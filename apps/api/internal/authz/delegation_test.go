package authz

import (
	"context"
	"testing"

	"github.com/google/uuid"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

func delegatedContext(actor string, projects ...string) context.Context {
	return authctx.WithIdentity(context.Background(), authctx.Identity{
		SubjectID:      uuid.NewString(),
		SubjectKind:    coreauth.SubjectUser,
		ActorSubjectID: actor,
		ProjectIDs:     projects,
	})
}

func userContext() context.Context { return delegatedContext("") }

func TestDelegationAllows(t *testing.T) {
	id := coreauth.AccessTokenIdentity{
		Scope:      coreauth.ScopeProjectsRead + " " + coreauth.ScopeResourcesRead,
		ProjectIDs: []string{"aaaaaaaaaa"},
	}
	tests := []struct {
		name    string
		scope   string
		project string
		want    bool
	}{
		{"scope and project granted", coreauth.ScopeProjectsRead, "aaaaaaaaaa", true},
		{"second scope granted", coreauth.ScopeResourcesRead, "aaaaaaaaaa", true},
		{"scope without project route", coreauth.ScopeProjectsRead, "", true},
		{"scope not granted", coreauth.ScopeSecretsCreate, "aaaaaaaaaa", false},
		{"project not granted", coreauth.ScopeProjectsRead, "bbbbbbbbbb", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := DelegationAllows(id, tt.scope, tt.project); got != tt.want {
				t.Fatalf("DelegationAllows = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFilterDelegatedProjects(t *testing.T) {
	projects := []string{"aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"}
	identity := func(s string) string { return s }

	got := FilterDelegatedProjects(delegatedContext(uuid.NewString(), "bbbbbbbbbb"), projects, identity)
	if len(got) != 1 || got[0] != "bbbbbbbbbb" {
		t.Fatalf("delegated projects = %v", got)
	}
	if got = FilterDelegatedProjects(userContext(), projects, identity); len(got) != len(projects) {
		t.Fatalf("user projects must not be filtered, got %v", got)
	}
}

func TestDelegatedTagAllowed(t *testing.T) {
	color := "red"
	delegated := delegatedContext(uuid.NewString(), "aaaaaaaaaa")
	if !DelegatedTagAllowed(delegated, "source", "som", nil) {
		t.Fatal("delegated attach without color must be allowed")
	}
	if !DelegatedTagAllowed(delegated, "env", "prod", nil) {
		t.Fatal("delegated attach is not limited to source=som")
	}
	if DelegatedTagAllowed(delegated, "source", "som", &color) {
		t.Fatal("delegated attach must not set color on a shared tag")
	}
	if !DelegatedTagAllowed(userContext(), "env", "prod", &color) {
		t.Fatal("user tags must be unrestricted")
	}
}
