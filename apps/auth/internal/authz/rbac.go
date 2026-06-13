package authz

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

var rolePermissions = map[string]map[Action]struct{}{
	model.OrgMemberRoleOwner: {
		ActionOrganizationRead:         {},
		ActionOrganizationUpdate:       {},
		ActionOrganizationDelete:       {},
		ActionOrganizationMemberList:   {},
		ActionOrganizationMemberRead:   {},
		ActionOrganizationMemberAdd:    {},
		ActionOrganizationMemberUpdate: {},
		ActionOrganizationMemberRemove: {},
	},
	model.OrgMemberRoleAdmin: {
		ActionOrganizationRead:         {},
		ActionOrganizationUpdate:       {},
		ActionOrganizationMemberList:   {},
		ActionOrganizationMemberRead:   {},
		ActionOrganizationMemberAdd:    {},
		ActionOrganizationMemberUpdate: {},
		ActionOrganizationMemberRemove: {},
	},
	model.OrgMemberRoleEditor: {
		ActionOrganizationRead:       {},
		ActionOrganizationUpdate:     {},
		ActionOrganizationMemberList: {},
		ActionOrganizationMemberRead: {},
	},
	model.OrgMemberRoleViewer: {
		ActionOrganizationRead:       {},
		ActionOrganizationMemberList: {},
		ActionOrganizationMemberRead: {},
	},
}

// RBACAuthorizer is a role-based Authorizer backed by the database.
type RBACAuthorizer struct {
	db db.Database
}

func NewRBACAuthorizer(database db.Database) *RBACAuthorizer {
	return &RBACAuthorizer{db: database}
}

// Authorize implementation. Error is returned only for genuine database failures — all
// authorization denials are expressed via AuthorizationDecision.Allowed == false.
func (a *RBACAuthorizer) Authorize(
	ctx context.Context,
	subjectID uuid.UUID,
	action Action,
	resource ResourceRef,
) (*AuthorizationDecision, error) {
	dec := &AuthorizationDecision{
		SubjectID: subjectID,
		Action:    action,
		Resource:  resource,
	}

	// Reject unsupported resource types before any DB access.
	// Unknown types must never accidentally allow.
	if resource.Type != "organization" {
		dec.Allowed = false
		dec.ReasonCode = "unsupported_resource_type"
		return dec, nil
	}

	membership, err := a.db.GetOrganizationMember(ctx, resource.ID, subjectID, subjectID)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			// Non-member is a valid deny, not a server error.
			dec.Allowed = false
			dec.ReasonCode = "organization_membership_not_found"
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
