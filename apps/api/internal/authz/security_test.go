package authz

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	"testing"
)

type securityMembership struct {
	role string
	err  error
}

func (s securityMembership) GetProjectMember(context.Context, uuid.UUID, uuid.UUID) (model.ProjectMember, error) {
	return model.ProjectMember{Role: s.role}, s.err
}
func (s securityMembership) GetProjectMemberByPublicID(context.Context, string, uuid.UUID) (model.ProjectMember, error) {
	return model.ProjectMember{Role: s.role}, s.err
}

func TestSecurityRBACBoundaries(t *testing.T) {
	for _, tc := range []struct {
		role   string
		action Action
		allow  bool
	}{
		{"owner", ActionProjectDelete, true}, {"owner", ActionSecretReveal, true},
		{"admin", ActionProjectDelete, false}, {"admin", ActionProjectChangeBilling, false},
		{"editor", ActionProjectMemberUpdate, false}, {"editor", ActionSecretCreate, true},
		{"viewer", ActionSecretReveal, true}, {"viewer", ActionSecretCreate, false},
		{"viewer", ActionProjectUpdateMeta, false},
		{"agent", ActionProjectMemberAdd, false}, {"agent", ActionDBConnectionInfoRead, false},
		{"agent", ActionSecretVersionCreate, true},
		{"root", ActionSecretReveal, false}, {"", ActionProjectRead, false},
		{"owner", Action("undefined.action"), false},
	} {
		t.Run(tc.role+"/"+string(tc.action), func(t *testing.T) {
			a := NewRBACAuthorizer(securityMembership{role: tc.role})
			dec, err := a.Authorize(t.Context(), Principal{SubjectID: uuid.New()}, tc.action, ResourceRef{Type: "project", PublicID: "fixture"})
			if err != nil || dec.Allowed != tc.allow {
				t.Fatalf("allowed=%v decision=%+v error=%v", tc.allow, dec, err)
			}
		})
	}
	for _, err := range []error{db.ErrProjectMemberNotFound, errors.New("database unavailable")} {
		a := NewRBACAuthorizer(securityMembership{role: "owner", err: err})
		dec, got := a.Authorize(t.Context(), Principal{SubjectID: uuid.New()}, ActionProjectRead, ResourceRef{Type: "project", PublicID: "fixture"})
		if got == nil && (dec == nil || dec.Allowed) {
			t.Fatal("membership lookup failure allowed access")
		}
	}
	a := NewRBACAuthorizer(securityMembership{role: "owner"})
	dec, err := a.Authorize(t.Context(), Principal{}, ActionProjectRead, ResourceRef{Type: "unknown"})
	if err != nil || dec.Allowed {
		t.Fatal("unknown resource type allowed")
	}
}
