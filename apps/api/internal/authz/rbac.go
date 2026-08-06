package authz

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
)

var rolePermissions = map[string]map[Action]struct{}{
	model.PrjMemberRoleOwner: {
		ActionProjectRead:          {},
		ActionProjectUpdateMeta:    {},
		ActionProjectDelete:        {},
		ActionProjectChangePlan:    {},
		ActionProjectChangeBilling: {},
		ActionProjectMemberList:    {},
		ActionProjectMemberRead:    {},
		ActionProjectMemberAdd:     {},
		ActionProjectMemberUpdate:  {},
		ActionProjectMemberRemove:  {},
		ActionDBList:               {},
		ActionDBRead:               {},
		ActionDBCreate:             {},
		ActionDBUpdateMeta:         {},
		ActionDBStart:              {},
		ActionDBStop:               {},
		ActionDBDelete:             {},
		ActionDBConnectionInfoRead: {},
		ActionSecretList:           {},
		ActionSecretReadMeta:       {},
		ActionSecretCreate:         {},
		ActionSecretUpdateMeta:     {},
		ActionSecretReveal:         {},
		ActionSecretDelete:         {},
		ActionSecretVersionList:    {},
		ActionSecretVersionRead:    {},
		ActionSecretVersionCreate:  {},
		ActionSecretVersionDisable: {},
		ActionTagList:              {},
		ActionTagCreate:            {},
		ActionTagUpdate:            {},
		ActionTagDelete:            {},
		ActionResourceTagAttach:    {},
		ActionResourceTagDetach:    {},
	},
	model.PrjMemberRoleAdmin: {
		ActionProjectRead:          {},
		ActionProjectUpdateMeta:    {},
		ActionProjectMemberList:    {},
		ActionProjectMemberRead:    {},
		ActionProjectMemberAdd:     {},
		ActionProjectMemberUpdate:  {},
		ActionProjectMemberRemove:  {},
		ActionDBList:               {},
		ActionDBRead:               {},
		ActionDBCreate:             {},
		ActionDBUpdateMeta:         {},
		ActionDBStart:              {},
		ActionDBStop:               {},
		ActionDBDelete:             {},
		ActionDBConnectionInfoRead: {},
		ActionSecretList:           {},
		ActionSecretReadMeta:       {},
		ActionSecretCreate:         {},
		ActionSecretUpdateMeta:     {},
		ActionSecretReveal:         {},
		ActionSecretDelete:         {},
		ActionSecretVersionList:    {},
		ActionSecretVersionRead:    {},
		ActionSecretVersionCreate:  {},
		ActionSecretVersionDisable: {},
		ActionTagList:              {},
		ActionTagCreate:            {},
		ActionTagUpdate:            {},
		ActionTagDelete:            {},
		ActionResourceTagAttach:    {},
		ActionResourceTagDetach:    {},
	},
	model.PrjMemberRoleEditor: {
		ActionProjectRead:          {},
		ActionProjectUpdateMeta:    {},
		ActionProjectMemberList:    {},
		ActionProjectMemberRead:    {},
		ActionDBList:               {},
		ActionDBRead:               {},
		ActionDBCreate:             {},
		ActionDBUpdateMeta:         {},
		ActionDBStart:              {},
		ActionDBStop:               {},
		ActionDBConnectionInfoRead: {},
		ActionSecretList:           {},
		ActionSecretReadMeta:       {},
		ActionSecretCreate:         {},
		ActionSecretUpdateMeta:     {},
		ActionSecretReveal:         {},
		ActionSecretVersionList:    {},
		ActionSecretVersionRead:    {},
		ActionSecretVersionCreate:  {},
		ActionTagList:              {},
		ActionTagCreate:            {},
		ActionTagUpdate:            {},
		ActionResourceTagAttach:    {},
	},
	model.PrjMemberRoleViewer: {
		ActionProjectRead:          {},
		ActionProjectMemberList:    {},
		ActionProjectMemberRead:    {},
		ActionDBList:               {},
		ActionDBRead:               {},
		ActionDBConnectionInfoRead: {},
		ActionSecretList:           {},
		ActionSecretReadMeta:       {},
		ActionSecretReveal:         {},
		ActionSecretVersionList:    {},
		ActionSecretVersionRead:    {},
		ActionTagList:              {},
	},
}

// RBACAuthorizer is a role-based Authorizer backed by the database.
type RBACAuthorizer struct {
	db projectMemberStore
}

type projectMemberStore interface {
	GetProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID) (model.ProjectMember, error)
}

func NewRBACAuthorizer(database projectMemberStore) *RBACAuthorizer {
	return &RBACAuthorizer{db: database}
}

// Authorize implementation. Error is returned only for genuine database failures — all
// authorization denials are expressed via AuthorizationDecision.Allowed == false.
func (a *RBACAuthorizer) Authorize(
	ctx context.Context,
	principal Principal,
	action Action,
	resource ResourceRef,
) (*AuthorizationDecision, error) {
	dec := &AuthorizationDecision{
		SubjectID: principal.SubjectID,
		Action:    action,
		Resource:  resource,
	}

	// Reject unsupported resource types before any DB access.
	// Unknown types must never accidentally allow.
	if resource.Type != "project" {
		dec.Allowed = false
		dec.ReasonCode = "unsupported_resource_type"
		return dec, nil
	}

	membership, err := a.db.GetProjectMember(ctx, resource.ID, principal.SubjectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			// Non-member is a valid deny, not a server error.
			dec.Allowed = false
			dec.ReasonCode = "project_membership_not_found"
			return dec, nil
		}
		return nil, err
	}

	actions, ok := rolePermissions[membership.Role]
	if !ok {
		dec.Allowed = false
		dec.ReasonCode = "role_missing_required_permission"
		return dec, nil
	}

	if _, allowed := actions[action]; allowed {
		dec.Allowed = true
		dec.ReasonCode = "role_allows_action"
	} else {
		dec.Allowed = false
		dec.ReasonCode = "role_missing_required_permission"
	}

	return dec, nil
}
