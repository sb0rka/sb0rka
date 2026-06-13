package authz

import (
	"context"

	"github.com/google/uuid"
)

// Action names a specific operation a subject wants to perform on a resource.
// Action values are stable identifiers — do not change them once in use.
type Action string

const (
	ActionOrganizationRead         Action = "organization.read"
	ActionOrganizationUpdate       Action = "organization.update"
	ActionOrganizationDelete       Action = "organization.delete"
	ActionOrganizationMemberList   Action = "organization.member.list"
	ActionOrganizationMemberRead   Action = "organization.member.read"
	ActionOrganizationMemberAdd    Action = "organization.member.add"
	ActionOrganizationMemberUpdate Action = "organization.member.update"
	ActionOrganizationMemberRemove Action = "organization.member.remove"
)

// ResourceRef identifies the target resource of an authorization check.
type ResourceRef struct {
	Type string
	ID   uuid.UUID
}

// AuthorizationDecision is the result of an Authorize call.
// ReasonCode is a stable, machine-readable string for logging; it must never be
// forwarded verbatim to API clients.
type AuthorizationDecision struct {
	Allowed    bool
	ReasonCode string
	SubjectID  uuid.UUID
	Action     Action
	Resource   ResourceRef
}

// Authorizer evaluates whether a subject may perform an action on a resource.
// Implementations must be safe for concurrent use.
type Authorizer interface {
	Authorize(ctx context.Context, subjectID uuid.UUID, action Action, resource ResourceRef) (*AuthorizationDecision, error)
}
