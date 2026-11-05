package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type PlatformClient struct {
	ClientID               string
	ActorSubjectID         uuid.UUID
	CanDelegate, CanAttest bool
}

type DelegationGrant struct {
	Audience       string    `json:"audience"`
	ID             uuid.UUID `json:"delegation_id"`
	Version        int64     `json:"version"`
	SubjectID      uuid.UUID `json:"-"`
	ClientID       string    `json:"-"`
	ActorSubjectID uuid.UUID `json:"-"`
	Scopes         []string  `json:"scopes"`
	ProjectIDs     []string  `json:"project_ids"`
}

type DelegationRequest struct {
	ID, SubjectID                               uuid.UUID
	ClientID, RedirectURI, State, CodeChallenge string
	Audience                                    string
}

type AgentIdentity struct {
	SubjectID  uuid.UUID
	HostID     uuid.UUID
	Thumbprint string
	PublicKey  []byte
	Revoked    bool
}

func (p *PsqlDB) ClientPolicies(ctx context.Context) ([]coreauth.ClientPolicy, error) {
	rows, err := p.pool.Query(ctx, `SELECT policy FROM platform_clients WHERE revoked_at IS NULL ORDER BY client_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var policies []coreauth.ClientPolicy
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var policy coreauth.ClientPolicy
		if err = json.Unmarshal(raw, &policy); err != nil {
			return nil, fmt.Errorf("decode platform client policy: %w", err)
		}
		policies = append(policies, policy)
	}
	return policies, rows.Err()
}

func (p *PsqlDB) PlatformClient(ctx context.Context, clientID string) (PlatformClient, error) {
	const query = `
		SELECT client_id, COALESCE(actor_subject_id, '00000000-0000-0000-0000-000000000000'::uuid), can_delegate, can_attest_agent
		FROM platform_clients
		WHERE client_id = $1 AND revoked_at IS NULL
	`
	var c PlatformClient
	err := p.pool.QueryRow(ctx, query, clientID).Scan(&c.ClientID, &c.ActorSubjectID, &c.CanDelegate, &c.CanAttest)
	return c, err
}

func (p *PsqlDB) CreateDelegationRequest(ctx context.Context, request DelegationRequest) error {
	const query = `
		INSERT INTO delegation_requests (id, user_id, client_id, redirect_uri, state, code_challenge, audience, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '15 minutes')
	`
	_, err := p.pool.Exec(
		ctx,
		query,
		request.ID,
		request.SubjectID,
		request.ClientID,
		request.RedirectURI,
		request.State,
		request.CodeChallenge,
		request.Audience,
	)
	return err
}

// DelegationRequest returns a pending consent request that has not expired or been decided.
func (p *PsqlDB) DelegationRequest(ctx context.Context, requestID uuid.UUID) (DelegationRequest, error) {
	const query = `
		SELECT id, user_id, client_id, redirect_uri, state, code_challenge, audience
		FROM delegation_requests
		WHERE id = $1 AND expires_at > NOW() AND consumed_at IS NULL AND code_hash IS NULL
	`
	var d DelegationRequest
	err := p.pool.QueryRow(ctx, query, requestID).
		Scan(&d.ID, &d.SubjectID, &d.ClientID, &d.RedirectURI, &d.State, &d.CodeChallenge, &d.Audience)
	return d, err
}

const grantColumns = `id, version, user_id, client_id, actor_service_id, scopes, project_ids, audience`

func scanGrant(row pgx.Row) (DelegationGrant, error) {
	var g DelegationGrant
	err := row.Scan(
		&g.ID,
		&g.Version,
		&g.SubjectID,
		&g.ClientID,
		&g.ActorSubjectID,
		&g.Scopes,
		&g.ProjectIDs,
		&g.Audience,
	)
	return g, err
}

// DelegationGrant returns the active grant a user gave to a client.
func (p *PsqlDB) DelegationGrant(
	ctx context.Context,
	subjectID uuid.UUID,
	clientID, audience string,
) (DelegationGrant, error) {
	const query = `
		SELECT ` + grantColumns + `
		FROM delegation_grants
		WHERE user_id = $1 AND client_id = $2 AND audience = $3 AND revoked_at IS NULL
	`
	return scanGrant(p.pool.QueryRow(ctx, query, subjectID, clientID, audience))
}

// ApproveDelegation records the user's consent for a pending request. Re-approval bumps the
// grant version, which invalidates tokens issued under the previous scopes and projects.
func (p *PsqlDB) ApproveDelegation(
	ctx context.Context,
	requestID, subjectID uuid.UUID,
	scopes, projectIDs []string,
	codeHash []byte,
) (DelegationGrant, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return DelegationGrant{}, err
	}
	defer tx.Rollback(ctx)

	const selectRequestQuery = `
		SELECT r.client_id, c.actor_subject_id, r.audience, ARRAY(SELECT jsonb_array_elements_text(c.policy->'delegation_policies'->r.audience))
		FROM delegation_requests r
		JOIN platform_clients c ON c.client_id = r.client_id
		WHERE r.id = $1
			AND r.user_id = $2
			AND r.expires_at > NOW()
			AND r.consumed_at IS NULL
			AND r.code_hash IS NULL
			AND c.revoked_at IS NULL
			AND c.can_delegate
			AND c.policy->'delegation_policies' ? r.audience
		FOR UPDATE OF r, c
	`
	var clientID, audience string
	var actorID uuid.UUID
	var allowedScopes []string
	err = tx.QueryRow(ctx, selectRequestQuery, requestID, subjectID).
		Scan(&clientID, &actorID, &audience, &allowedScopes)
	if err != nil {
		return DelegationGrant{}, err
	}
	for _, scope := range scopes {
		if !slices.Contains(allowedScopes, scope) {
			return DelegationGrant{}, ErrOIDCInvalidGrant
		}
	}

	const upsertGrantQuery = `
		INSERT INTO delegation_grants (user_id, client_id, actor_service_id, audience, scopes, project_ids)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, client_id, audience) DO UPDATE SET
			actor_service_id = EXCLUDED.actor_service_id,
			audience = EXCLUDED.audience,
			scopes = EXCLUDED.scopes,
			project_ids = EXCLUDED.project_ids,
			version = delegation_grants.version + 1,
			revoked_at = NULL
		RETURNING ` + grantColumns
	grant, err := scanGrant(
		tx.QueryRow(ctx, upsertGrantQuery, subjectID, clientID, actorID, audience, scopes, projectIDs),
	)
	if err != nil {
		return grant, err
	}
	if _, err = tx.Exec(ctx, `UPDATE delegation_requests SET code_hash = $2, grant_id = $3 WHERE id = $1`, requestID, codeHash, grant.ID); err != nil {
		return grant, err
	}
	return grant, tx.Commit(ctx)
}

// RedeemDelegation consumes the one-use callback code after verifying its PKCE verifier.
func (p *PsqlDB) RedeemDelegation(
	ctx context.Context,
	codeHash []byte,
	clientID, redirectURI, codeVerifier string,
) (DelegationGrant, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return DelegationGrant{}, err
	}
	defer tx.Rollback(ctx)

	const selectRequestQuery = `
		SELECT id, grant_id, code_challenge
		FROM delegation_requests
		WHERE code_hash = $1
			AND client_id = $2
			AND redirect_uri = $3
			AND consumed_at IS NULL
			AND expires_at > NOW()
		FOR UPDATE
	`
	var requestID, grantID uuid.UUID
	var challenge string
	if err = tx.QueryRow(ctx, selectRequestQuery, codeHash, clientID, redirectURI).Scan(&requestID, &grantID, &challenge); err != nil {
		return DelegationGrant{}, err
	}
	if err = validateOIDCPKCEVerifier(codeVerifier, challenge); err != nil {
		return DelegationGrant{}, err
	}
	grant, err := scanGrant(
		tx.QueryRow(
			ctx,
			`SELECT `+grantColumns+` FROM delegation_grants WHERE id = $1 AND revoked_at IS NULL`,
			grantID,
		),
	)
	if err != nil {
		return grant, err
	}
	if _, err = tx.Exec(ctx, `UPDATE delegation_requests SET consumed_at = NOW(), code_hash = NULL WHERE id = $1`, requestID); err != nil {
		return grant, err
	}
	return grant, tx.Commit(ctx)
}

// RevokeDelegation revokes the user's grant and bumps its version so outstanding tokens stop verifying.
func (p *PsqlDB) RevokeDelegation(ctx context.Context, subjectID uuid.UUID, clientID, audience string) error {
	const query = `
		UPDATE delegation_grants
		SET revoked_at = COALESCE(revoked_at, NOW()), version = version + 1
		WHERE user_id = $1 AND client_id = $2 AND audience = $3
	`
	_, err := p.pool.Exec(ctx, query, subjectID, clientID, audience)
	return err
}

func (p *PsqlDB) DenyDelegation(ctx context.Context, requestID, subjectID uuid.UUID) error {
	const query = `
		UPDATE delegation_requests
		SET consumed_at = NOW()
		WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL
			AND code_hash IS NULL AND expires_at > NOW()
	`
	result, err := p.pool.Exec(ctx, query, requestID, subjectID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrOIDCAuthRequestNotFound
	}
	return nil
}

func (p *PsqlDB) LiveSession(ctx context.Context, sessionID, subjectID uuid.UUID) (bool, error) {
	var live bool
	err := p.pool.QueryRow(ctx, `SELECT is_live_session($1, $2)`, sessionID, subjectID).Scan(&live)
	return live, err
}

func (p *PsqlDB) LiveDelegation(ctx context.Context, grant DelegationGrant, scopes, projectIDs []string) (bool, error) {
	var live bool
	err := p.pool.QueryRow(
		ctx,
		`SELECT is_live_delegation($1, $2, $3, $4, $5, $6, $7, $8)`,
		grant.ID,
		grant.Version,
		grant.SubjectID,
		grant.ClientID,
		grant.ActorSubjectID,
		scopes,
		projectIDs,
		grant.Audience,
	).Scan(&live)
	return live, err
}

// EnrollAgent registers a Host's principal on first attestation and returns the existing one afterwards.
func (p *PsqlDB) EnrollAgent(
	ctx context.Context,
	clientID string,
	hostID uuid.UUID,
	publicKey []byte,
	thumbprint string,
	attestationID uuid.UUID,
) (AgentIdentity, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return AgentIdentity{}, err
	}
	defer tx.Rollback(ctx)

	// Serialize enrollment retries so a Host cannot acquire two principals.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, clientID+":"+hostID.String()); err != nil {
		return AgentIdentity{}, err
	}

	const selectPrincipalQuery = `
		SELECT subject_id, host_id, public_key, key_thumbprint, revoked_at
		FROM agent_principals
		WHERE attester_client_id = $1 AND host_id = $2
		FOR UPDATE
	`
	var d AgentIdentity
	var thumb *string
	var revokedAt *time.Time
	err = tx.QueryRow(ctx, selectPrincipalQuery, clientID, hostID).
		Scan(&d.SubjectID, &d.HostID, &d.PublicKey, &thumb, &revokedAt)
	if err == nil {
		if thumb != nil {
			d.Thumbprint = *thumb
		}
		if revokedAt != nil {
			return d, ErrOIDCInvalidGrant
		}
		if d.PublicKey == nil {
			const bindKeyQuery = `
				UPDATE agent_principals
				SET public_key = $1, key_thumbprint = $2
				WHERE subject_id = $3 AND public_key IS NULL AND revoked_at IS NULL
			`
			tag, execErr := tx.Exec(ctx, bindKeyQuery, publicKey, thumbprint, d.SubjectID)
			if execErr != nil || tag.RowsAffected() != 1 {
				return d, ErrOIDCInvalidGrant
			}
			d.PublicKey, d.Thumbprint = publicKey, thumbprint
			const auditQuery = `
				INSERT INTO platform_auth_audit (action, client_id, subject_id, host_id, key_thumbprint, attestation_id, result)
				VALUES ('agent.register', $1, $2, $3, $4, $5, 'registered')
			`
			if _, err = tx.Exec(ctx, auditQuery, clientID, d.SubjectID, hostID, thumbprint, attestationID); err != nil {
				return d, err
			}
			return d, tx.Commit(ctx)
		}
		if d.Thumbprint != thumbprint || string(d.PublicKey) != string(publicKey) {
			return d, ErrOIDCInvalidGrant
		}
		return d, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return d, err
	}

	d = AgentIdentity{SubjectID: uuid.New(), HostID: hostID, PublicKey: publicKey, Thumbprint: thumbprint}
	if _, err = tx.Exec(ctx, `INSERT INTO subjects (id, kind) VALUES ($1, $2)`, d.SubjectID, coreauth.SubjectAgent); err != nil {
		return d, err
	}
	const insertPrincipalQuery = `
		INSERT INTO agent_principals (subject_id, attester_client_id, host_id, public_key, key_thumbprint)
		VALUES ($1, $2, $3, $4, $5)
	`
	if _, err = tx.Exec(ctx, insertPrincipalQuery, d.SubjectID, clientID, hostID, publicKey, thumbprint); err != nil {
		return d, err
	}
	const auditQuery = `
		INSERT INTO platform_auth_audit (action, client_id, subject_id, host_id, key_thumbprint, attestation_id, result)
		VALUES ('agent.register', $1, $2, $3, $4, $5, 'registered')
	`
	if _, err = tx.Exec(ctx, auditQuery, clientID, d.SubjectID, hostID, thumbprint, attestationID); err != nil {
		return d, err
	}
	return d, tx.Commit(ctx)
}

func (p *PsqlDB) AgentIdentity(ctx context.Context, clientID string, subjectID uuid.UUID) (AgentIdentity, error) {
	const query = `
		SELECT subject_id, host_id, public_key, COALESCE(key_thumbprint, ''), revoked_at IS NOT NULL
		FROM agent_principals
		WHERE subject_id = $1 AND attester_client_id = $2
	`
	var d AgentIdentity
	err := p.pool.QueryRow(ctx, query, subjectID, clientID).
		Scan(&d.SubjectID, &d.HostID, &d.PublicKey, &d.Thumbprint, &d.Revoked)
	return d, err
}

// ReserveAgent creates a keyless agent principal owned by the verified user, or returns the existing one.
// A different owner, or a legacy principal with no owner, is rejected.
func (p *PsqlDB) ReserveAgent(ctx context.Context, clientID string, hostID, ownerID uuid.UUID) (uuid.UUID, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, clientID+":"+hostID.String()); err != nil {
		return uuid.Nil, err
	}
	const selectQuery = `
		SELECT subject_id, revoked_at IS NOT NULL, owner_subject_id
		FROM agent_principals
		WHERE attester_client_id = $1 AND host_id = $2
		FOR UPDATE
	`
	var subjectID uuid.UUID
	var revoked bool
	var owner *uuid.UUID
	err = tx.QueryRow(ctx, selectQuery, clientID, hostID).Scan(&subjectID, &revoked, &owner)
	if err == nil {
		if revoked || owner == nil || *owner != ownerID {
			return uuid.Nil, ErrOIDCInvalidGrant
		}
		return subjectID, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	subjectID = uuid.New()
	if _, err = tx.Exec(ctx, `INSERT INTO subjects (id, kind) VALUES ($1, $2)`, subjectID, coreauth.SubjectAgent); err != nil {
		return uuid.Nil, err
	}
	const insertQuery = `
		INSERT INTO agent_principals (subject_id, attester_client_id, host_id, owner_subject_id)
		VALUES ($1, $2, $3, $4)
	`
	if _, err = tx.Exec(ctx, insertQuery, subjectID, clientID, hostID, ownerID); err != nil {
		return uuid.Nil, err
	}
	const auditQuery = `
		INSERT INTO platform_auth_audit (action, client_id, subject_id, host_id, result)
		VALUES ('agent.reserve', $1, $2, $3, 'reserved')
	`
	if _, err = tx.Exec(ctx, auditQuery, clientID, subjectID, hostID); err != nil {
		return uuid.Nil, err
	}
	return subjectID, tx.Commit(ctx)
}

func (p *PsqlDB) RevokeAgent(ctx context.Context, clientID string, subjectID, attestationID uuid.UUID) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const revokeQuery = `
		UPDATE agent_principals
		SET revoked_at = COALESCE(revoked_at, NOW())
		WHERE subject_id = $1 AND attester_client_id = $2
		RETURNING host_id, key_thumbprint
	`
	var hostID uuid.UUID
	var thumbprint string
	if err = tx.QueryRow(ctx, revokeQuery, subjectID, clientID).Scan(&hostID, &thumbprint); err != nil {
		return err
	}
	const auditQuery = `
		INSERT INTO platform_auth_audit (action, client_id, subject_id, host_id, key_thumbprint, attestation_id, result)
		VALUES ('agent.revoke', $1, $2, $3, $4, $5, 'revoked')
	`
	if _, err = tx.Exec(ctx, auditQuery, clientID, subjectID, hostID, thumbprint, attestationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *PsqlDB) AuditPlatform(
	ctx context.Context,
	action, clientID string,
	subjectID, hostID, attestationID, tokenJTI *uuid.UUID,
	thumbprint, result string,
) error {
	const query = `
		INSERT INTO platform_auth_audit (action, client_id, subject_id, host_id, attestation_id, token_jti, key_thumbprint, result)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := p.pool.Exec(ctx, query, action, clientID, subjectID, hostID, attestationID, tokenJTI, thumbprint, result)
	return err
}
