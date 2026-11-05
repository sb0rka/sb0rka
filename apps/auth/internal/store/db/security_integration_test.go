//go:build securityintegration

package db

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
)

func securityStoreFixture(t *testing.T) (*PsqlDB, uuid.UUID) {
	t.Helper()
	uri := os.Getenv("VULN_CHECK_DATABASE_URI")
	if uri == "" || os.Getenv("VULN_CHECK_ISOLATED_DB") != "1" {
		t.Fatal("BLOCKED: securityintegration requires an isolated VULN_CHECK_DATABASE_URI and VULN_CHECK_ISOLATED_DB=1")
	}
	d, err := NewPsqlDB(uri, 2, time.Minute)
	if err != nil {
		t.Fatal("fixture connection configuration failed")
	}
	t.Cleanup(func() { _ = d.Close() })
	id := uuid.New()
	name := "vcstore" + id.String()
	var manifestPath string
	if directory := os.Getenv("VULN_CHECK_FIXTURE_DIR"); directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
		manifestPath = filepath.Join(directory, id.String()+".json")
		record, _ := json.Marshal(map[string]string{"id": id.String(), "username": name, "email": name + "@example.test"})
		if err := os.WriteFile(manifestPath, record, 0600); err != nil {
			t.Fatal(err)
		}
	}
	_, err = d.pool.Exec(t.Context(), "INSERT INTO auth.subjects(id,kind) VALUES($1,'user')", id)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := d.pool.Exec(ctx, "DELETE FROM auth.subjects WHERE id=$1", id); err != nil {
			t.Errorf("fixture cleanup failed: %v", err)
		} else if manifestPath != "" {
			if err := os.Remove(manifestPath); err != nil {
				t.Errorf("manifest cleanup failed: %v", err)
			}
		}
	})
	_, err = d.pool.Exec(t.Context(), "INSERT INTO auth.user_principals(id,username,email,password_hash,email_verified_at) VALUES($1,$2,$3,'fixture-not-a-login-hash',now())", id, name, name+"@example.test")
	if err != nil {
		t.Fatal(err)
	}
	return d, id
}

func securityClientFixture(t *testing.T, d *PsqlDB) (string, uuid.UUID) {
	t.Helper()
	actor := uuid.New()
	client := "vcclient-" + actor.String()
	if _, err := d.pool.Exec(t.Context(), "INSERT INTO auth.subjects(id,kind) VALUES($1,'service')", actor); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := d.pool.Exec(ctx, "DELETE FROM auth.subjects WHERE id=$1", actor); err != nil {
			t.Errorf("actor cleanup: %v", err)
		}
	})
	if _, err := d.pool.Exec(t.Context(), "INSERT INTO auth.service_principals(subject_id,name) VALUES($1,$2)", actor, client); err != nil {
		t.Fatal(err)
	}
	policy := map[string]any{"client_id": client, "type": "confidential", "enabled": true, "can_attest": true, "grant_types": []string{"urn:sb0rka:params:oauth:grant-type:agent"}, "access_audience": "sb0rka-som", "delegation_policies": map[string][]string{"sb0rka-api": {"projects.read"}}}
	raw, _ := json.Marshal(policy)
	if _, err := d.pool.Exec(t.Context(), "INSERT INTO auth.platform_clients(client_id,actor_subject_id,can_delegate,can_attest_agent,policy) VALUES($1,$2,true,true,$3)", client, actor, raw); err != nil {
		t.Fatal(err)
	}
	return client, actor
}

func TestSecurityStoreDelegationSQLBindings(t *testing.T) {
	d, user := securityStoreFixture(t)
	client, actor := securityClientFixture(t, d)
	grant := uuid.New()
	if _, err := d.pool.Exec(t.Context(), "INSERT INTO auth.delegation_grants(id,user_id,client_id,actor_service_id,audience,scopes,project_ids) VALUES($1,$2,$3,$4,'sb0rka-api',ARRAY['projects.read'],ARRAY['abcdef0123'])", grant, user, client, actor); err != nil {
		t.Fatal(err)
	}
	type arguments struct {
		id, sub, actor   uuid.UUID
		client, aud      string
		version          int64
		scopes, projects []string
	}
	control := arguments{grant, user, actor, client, "sb0rka-api", 1, []string{"projects.read"}, []string{"abcdef0123"}}
	check := func(t *testing.T, a arguments, want bool) {
		t.Helper()
		var got bool
		err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_delegation($1,$2,$3,$4,$5,$6,$7,$8)", a.id, a.version, a.sub, a.client, a.actor, a.scopes, a.projects, a.aud).Scan(&got)
		if err != nil || got != want {
			t.Fatalf("live=%v expected=%v err=%v", got, want, err)
		}
	}
	check(t, control, true)
	for name, mutate := range map[string]func(*arguments){
		"grant":         func(a *arguments) { a.id = uuid.New() },
		"subject":       func(a *arguments) { a.sub = uuid.New() },
		"actor":         func(a *arguments) { a.actor = uuid.New() },
		"client":        func(a *arguments) { a.client = "unregistered" },
		"audience":      func(a *arguments) { a.aud = "sb0rka-som" },
		"version":       func(a *arguments) { a.version++ },
		"scope":         func(a *arguments) { a.scopes = []string{"secrets.write"} },
		"empty_scope":   func(a *arguments) { a.scopes = []string{} },
		"project":       func(a *arguments) { a.projects = []string{"foreign"} },
		"empty_project": func(a *arguments) { a.projects = []string{} },
	} {
		t.Run(name, func(t *testing.T) { a := control; mutate(&a); check(t, a, false) })
	}
	if _, err := d.pool.Exec(t.Context(), "UPDATE auth.platform_clients SET revoked_at=now() WHERE client_id=$1", client); err != nil {
		t.Fatal(err)
	}
	check(t, control, false)
}

func TestSecurityStoreAgentEnrollmentAndRevocation(t *testing.T) {
	d, user := securityStoreFixture(t)
	client, _ := securityClientFixture(t, d)
	host := uuid.New()
	subject, err := d.ReserveAgent(t.Context(), client, host, user)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := d.pool.Exec(ctx, "DELETE FROM auth.subjects WHERE id=$1", subject); err != nil {
			t.Errorf("agent cleanup: %v", err)
		}
	})
	var live bool
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_agent($1,$2)", subject, host).Scan(&live); err != nil || live {
		t.Fatal("reserved agent is live without enrolled key")
	}
	if _, err := d.ReserveAgent(t.Context(), client, host, uuid.New()); !errors.Is(err, ErrOIDCInvalidGrant) {
		t.Fatalf("host ownership changed: %v", err)
	}
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(pub)
	thumb := base64.RawURLEncoding.EncodeToString(sum[:])
	identity, err := d.EnrollAgent(t.Context(), client, host, pub, thumb, uuid.New())
	if err != nil || identity.SubjectID != subject {
		t.Fatalf("enrollment: %v", err)
	}
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_agent($1,$2)", subject, host).Scan(&live); err != nil || !live {
		t.Fatal("enrolled agent not live")
	}
	if _, err := d.pool.Exec(t.Context(), "UPDATE auth.platform_clients SET revoked_at=now() WHERE client_id=$1", client); err != nil {
		t.Fatal(err)
	}
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_agent($1,$2)", subject, host).Scan(&live); err != nil {
		t.Fatal(err)
	}
	if live {
		t.Error("SEC-AGENT-001: revoking the attesting workload client does not invalidate agent liveness")
	}
	if _, err := d.pool.Exec(t.Context(), "UPDATE auth.platform_clients SET revoked_at=NULL WHERE client_id=$1", client); err != nil {
		t.Fatal(err)
	}
	other, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	otherSum := sha256.Sum256(other)
	if _, err := d.EnrollAgent(t.Context(), client, host, other, base64.RawURLEncoding.EncodeToString(otherSum[:]), uuid.New()); !errors.Is(err, ErrOIDCInvalidGrant) {
		t.Fatalf("host key replaced: %v", err)
	}
	if err := d.RevokeAgent(t.Context(), client, subject, uuid.New()); err != nil {
		t.Fatal(err)
	}
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_agent($1,$2)", subject, host).Scan(&live); err != nil || live {
		t.Fatal("revoked agent still live")
	}
	if _, err := d.EnrollAgent(t.Context(), client, host, pub, thumb, uuid.New()); !errors.Is(err, ErrOIDCInvalidGrant) {
		t.Fatalf("revoked agent resurrected: %v", err)
	}
}

func securityHash() string {
	sum := sha256.Sum256([]byte(uuid.NewString()))
	return hex.EncodeToString(sum[:])
}

func TestSecurityStoreRefreshAtomicity(t *testing.T) {
	d, user := securityStoreFixture(t)
	sid := uuid.New()
	old := securityHash()
	if _, err := d.CreateAuthSession(t.Context(), sid, user, uuid.New(), old, "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash"); err != nil {
		t.Fatal(err)
	}
	issueCalls := 0
	issue := func(s model.AuthSession) (string, error) { issueCalls++; return "sealed-fixture-response", nil }
	first, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", "same-operation", issue)
	if err != nil {
		t.Fatal(err)
	}
	retry, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", "same-operation", issue)
	if err != nil || retry != first || issueCalls != 1 {
		t.Fatalf("retry issue calls=%d err=%v", issueCalls, err)
	}
	if _, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", "different-operation", issue); !errors.Is(err, ErrTokenReuseDetected) {
		t.Fatalf("reused token: %v", err)
	}
	session, err := d.GetAuthSession(t.Context(), sid)
	if err != nil || session.RevokedAt == nil {
		t.Fatal("reuse did not revoke session")
	}
}

func TestSecurityStoreRefreshRace(t *testing.T) {
	d, user := securityStoreFixture(t)
	sid := uuid.New()
	old := securityHash()
	if _, err := d.CreateAuthSession(t.Context(), sid, user, uuid.New(), old, "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	start := make(chan struct{})
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", uuid.NewString(), func(model.AuthSession) (string, error) { return "sealed-fixture", nil })
			results <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	success, reused := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrTokenReuseDetected) {
			reused++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || reused != 1 {
		t.Fatalf("success=%d reused=%d", success, reused)
	}
}

func TestSecurityStoreClientAndSessionBinding(t *testing.T) {
	d, user := securityStoreFixture(t)
	sid := uuid.New()
	old := securityHash()
	if _, err := d.CreateAuthSession(t.Context(), sid, user, uuid.New(), old, "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "foreign-client", "op", func(model.AuthSession) (string, error) { t.Fatal("wrong-client issuer reached"); return "", nil }); !errors.Is(err, ErrTokenNotFound) {
		t.Fatalf("client binding: %v", err)
	}
	var own, foreign bool
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_session($1,$2),auth.is_live_session($1,$3)", sid, user, uuid.New()).Scan(&own, &foreign); err != nil {
		t.Fatal(err)
	}
	if !own || foreign {
		t.Fatal("sid/sub SQL binding failed")
	}
	if _, err := d.pool.Exec(t.Context(), "UPDATE auth.user_principals SET is_active=false WHERE id=$1", user); err != nil {
		t.Fatal(err)
	}
	if _, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", "op", func(model.AuthSession) (string, error) { t.Fatal("inactive-user issuer reached"); return "", nil }); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("inactive refresh: %v", err)
	}
	if err := d.pool.QueryRow(t.Context(), "SELECT auth.is_live_session($1,$2)", sid, user).Scan(&own); err != nil || own {
		t.Fatalf("inactive live session: %v", err)
	}
}

func securitySession(t *testing.T, d *PsqlDB, user uuid.UUID) (uuid.UUID, string) {
	t.Helper()
	sid, token := uuid.New(), securityHash()
	if _, err := d.CreateAuthSession(t.Context(), sid, user, uuid.New(), token, "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash"); err != nil {
		t.Fatal(err)
	}
	return sid, token
}
func TestSecurityPasswordChangeRevokesEveryFamily(t *testing.T) {
	d, user := securityStoreFixture(t)
	sid, old := securitySession(t, d, user)
	oauth, oauthToken := securitySession(t, d, user)
	if _, err := d.pool.Exec(t.Context(), `UPDATE auth_sessions SET oauth_client_id='audit-oauth' WHERE id=$1`, oauth); err != nil {
		t.Fatal(err)
	}
	if _, err := d.RefreshOAuthResult(t.Context(), old, securityHash(), "", "same-operation", func(model.AuthSession) (string, error) { return "sealed", nil }); err != nil {
		t.Fatal(err)
	}
	if err := d.UpdateUserPassword(t.Context(), user, sid, "fixture-not-a-login-hash", "new-hash"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []uuid.UUID{sid, oauth} {
		live, err := d.LiveSession(t.Context(), id, user)
		if err != nil || live {
			t.Fatalf("revoked session is live: %v", err)
		}
	}
	for _, tc := range []struct{ token, client string }{{old, ""}, {oauthToken, "audit-oauth"}} {
		if _, err := d.RefreshOAuthResult(t.Context(), tc.token, securityHash(), tc.client, "same-operation", func(model.AuthSession) (string, error) { t.Fatal("revoked refresh reached issuer"); return "", nil }); !errors.Is(err, ErrTokenExpired) {
			t.Fatalf("refresh survived: %v", err)
		}
	}
	if _, err := d.CreateAuthSession(t.Context(), uuid.New(), user, uuid.New(), securityHash(), "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash"); !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("stale password proof accepted: %v", err)
	}
	if _, err := d.CreateAuthSession(t.Context(), uuid.New(), user, uuid.New(), securityHash(), "127.0.0.1", nil, time.Now().Add(time.Hour), "new-hash"); err != nil {
		t.Fatal("new password proof rejected", err)
	}
}
func TestSecurityPasswordChangeRaces(t *testing.T) {
	for _, name := range []string{"login", "native_refresh", "oauth_refresh", "password_change", "logout_all", "logout_one"} {
		t.Run(name, func(t *testing.T) {
			d, user := securityStoreFixture(t)
			sid, token := securitySession(t, d, user)
			if name == "oauth_refresh" {
				if _, err := d.pool.Exec(t.Context(), `UPDATE auth_sessions SET oauth_client_id='audit-oauth' WHERE id=$1`, sid); err != nil {
					t.Fatal(err)
				}
			}
			start := make(chan struct{})
			results := make(chan error, 2)
			var wg sync.WaitGroup
			race := func(f func() error) { wg.Add(1); go func() { defer wg.Done(); <-start; results <- f() }() }
			race(func() error {
				return d.UpdateUserPassword(t.Context(), user, sid, "fixture-not-a-login-hash", "new-hash")
			})
			race(func() error {
				switch name {
				case "logout_all":
					return d.RevokeAllAuthSessions(t.Context(), user)
				case "logout_one":
					return d.RevokeAuthSession(t.Context(), sid, user, "logout", nil)
				case "login":
					_, err := d.CreateAuthSession(t.Context(), uuid.New(), user, uuid.New(), securityHash(), "127.0.0.1", nil, time.Now().Add(time.Hour), "fixture-not-a-login-hash")
					return err
				case "password_change":
					return d.UpdateUserPassword(t.Context(), user, sid, "fixture-not-a-login-hash", "another-hash")
				default:
					client := ""
					if name == "oauth_refresh" {
						client = "audit-oauth"
					}
					_, err := d.RefreshOAuthResult(t.Context(), token, securityHash(), client, "operation", func(model.AuthSession) (string, error) { return "sealed", nil })
					return err
				}
			})
			close(start)
			wg.Wait()
			close(results)
			success := 0
			for err := range results {
				if err == nil {
					success++
				} else if !errors.Is(err, ErrTokenExpired) {
					t.Fatal(err)
				}
			}
			if success < 1 || (name == "password_change" && success != 1) {
				t.Fatalf("unexpected successful operations: %d", success)
			}
			var active int
			if err := d.pool.QueryRow(t.Context(), `SELECT count(*) FROM auth_sessions WHERE subject_id=$1 AND revoked_at IS NULL`, user).Scan(&active); err != nil || active != 0 {
				t.Fatalf("session resurrection: active=%d err=%v", active, err)
			}
		})
	}
}
func TestSecurityStrictAgentIdentity(t *testing.T) {
	d, user := securityStoreFixture(t)
	client, _ := securityClientFixture(t, d)
	host := uuid.New()
	sub, err := d.ReserveAgent(t.Context(), client, host, user)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.pool.Exec(context.Background(), `DELETE FROM auth.subjects WHERE id=$1`, sub) })
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	sum := sha256.Sum256(pub)
	thumb := base64.RawURLEncoding.EncodeToString(sum[:])
	if _, err = d.EnrollAgent(t.Context(), client, host, pub, thumb, uuid.New()); err != nil {
		t.Fatal(err)
	}
	check := func(clientID, key string, want bool) {
		t.Helper()
		var live bool
		if err := d.pool.QueryRow(t.Context(), `SELECT auth.is_live_agent($1,$2,$3,$4)`, sub, host, clientID, key).Scan(&live); err != nil || live != want {
			t.Fatalf("live=%v want=%v err=%v", live, want, err)
		}
	}
	check(client, thumb, true)
	check("foreign-client", thumb, false)
	check(client, "foreign-key", false)
	for _, change := range []string{`can_attest_agent=false`, `policy=jsonb_set(policy,'{enabled}','false')`, `policy=jsonb_set(policy,'{can_attest}','false')`, `policy=jsonb_set(policy,'{grant_types}','[]')`} {
		tx, err := d.pool.Begin(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(t.Context(), `UPDATE auth.platform_clients SET `+change+` WHERE client_id=$1`, client); err != nil {
			t.Fatal(err)
		}
		var live bool
		if err = tx.QueryRow(t.Context(), `SELECT auth.is_live_agent($1,$2,$3,$4)`, sub, host, client, thumb).Scan(&live); err != nil || live {
			t.Fatal("disabled attester accepted", err)
		}
		if err = tx.Rollback(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	check(client, thumb, true)
}

func securityOIDCCode(t *testing.T, d *PsqlDB, user, sid uuid.UUID) OIDCExchangeRequest {
	t.Helper()
	client, _ := securityClientFixture(t, d)
	if _, err := d.pool.Exec(t.Context(), `UPDATE platform_clients SET policy=jsonb_set(policy,'{oidc_scopes}','["openid"]') WHERE client_id=$1`, client); err != nil {
		t.Fatal(err)
	}
	verifier := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	id := uuid.New()
	code := sha256.Sum256([]byte(uuid.NewString()))
	if err := d.CreateOIDCPending(t.Context(), OIDCPendingRequest{ID: id, ClientID: client, RedirectURI: "https://client.example/callback", State: "audit", Nonce: "audit-nonce", Scopes: "openid", CodeChallenge: challenge}); err != nil {
		t.Fatal(err)
	}
	authTime, err := d.GetOIDCSessionAuthenticationTime(t.Context(), sid, user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = d.AuthorizeOIDC(t.Context(), id, user, sid, authTime, code[:], time.Now()); err != nil {
		t.Fatal(err)
	}
	return OIDCExchangeRequest{CodeHash: code[:], ClientID: client, RedirectURI: "https://client.example/callback", CodeVerifier: verifier, SessionID: uuid.New(), FamilyID: uuid.New(), RefreshTokenHash: securityHash(), CreatedIP: "127.0.0.1", SessionExpiresAt: time.Now().Add(time.Hour)}
}
func TestSecurityPasswordChangeCodeRace(t *testing.T) {
	for _, order := range []string{"code_first", "password_first", "legacy_unbound"} {
		t.Run(order, func(t *testing.T) {
			d, user := securityStoreFixture(t)
			sid, _ := securitySession(t, d, user)
			request := securityOIDCCode(t, d, user, sid)
			issue := func(OIDCUserClaims, time.Time) (OIDCTokenSet, error) {
				return OIDCTokenSet{AccessToken: "isolated-fixture"}, nil
			}
			switch order {
			case "code_first":
				issued, release := make(chan struct{}), make(chan struct{})
				results := make(chan error, 2)
				go func() {
					_, err := d.ExchangeOIDCCode(t.Context(), request, func(user OIDCUserClaims, now time.Time) (OIDCTokenSet, error) {
						close(issued)
						<-release
						return issue(user, now)
					})
					results <- err
				}()
				select {
				case <-issued:
				case <-time.After(5 * time.Second):
					t.Fatal("code exchange did not reach issuer")
				}
				go func() {
					results <- d.UpdateUserPassword(t.Context(), user, sid, "fixture-not-a-login-hash", "new-hash")
				}()
				close(release)
				for range 2 {
					if err := <-results; err != nil {
						t.Fatal(err)
					}
				}
				var active int
				if err := d.pool.QueryRow(t.Context(), `SELECT count(*) FROM auth_sessions WHERE subject_id=$1 AND revoked_at IS NULL`, user).Scan(&active); err != nil || active != 0 {
					t.Fatal("code session survived password change", err)
				}
			case "password_first":
				if err := d.UpdateUserPassword(t.Context(), user, sid, "fixture-not-a-login-hash", "new-hash"); err != nil {
					t.Fatal(err)
				}
				if _, err := d.ExchangeOIDCCode(t.Context(), request, issue); !errors.Is(err, ErrOIDCInvalidGrant) {
					t.Fatalf("old code accepted: %v", err)
				}
			case "legacy_unbound":
				if _, err := d.pool.Exec(t.Context(), `UPDATE oidc_auth_requests SET source_session_id=NULL WHERE code_hash=$1`, request.CodeHash); err != nil {
					t.Fatal(err)
				}
				if _, err := d.ExchangeOIDCCode(t.Context(), request, issue); !errors.Is(err, ErrOIDCInvalidGrant) {
					t.Fatalf("unbound code accepted: %v", err)
				}
			}
		})
	}
}

func TestSecurityLogoutAfterConcurrentSessionCreation(t *testing.T) {
	d, user := securityStoreFixture(t)
	tx, err := d.pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err = lockAuthenticationUser(t.Context(), tx, user); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { result <- d.RevokeAllAuthSessions(t.Context(), user) }()
	// Wait for the revocation transaction to start before inserting a newer session.
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting bool
		_, err = tx.Exec(t.Context(), `SELECT pg_stat_clear_snapshot()`)
		if err != nil {
			t.Fatal(err)
		}
		err = tx.QueryRow(t.Context(), `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM user_principals%')`).Scan(&waiting)
		if err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("revocation did not reach the user lock")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err = tx.Exec(t.Context(), `INSERT INTO auth_sessions(id,subject_id,created_ip,created_at,expires_at) VALUES($1,$2,'127.0.0.1',clock_timestamp(),clock_timestamp()+interval '1 hour')`, uuid.New(), user); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err = <-result; err != nil {
		t.Fatal("revocation used its earlier transaction timestamp", err)
	}
	sessions, err := d.ListAuthSessions(t.Context(), user)
	if err != nil || len(sessions) != 0 {
		t.Fatal("concurrently created session survived logout", err)
	}
}
