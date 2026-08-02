package authz

import (
	"context"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// Action names a specific operation a subject wants to perform on a resource.
// Action values are stable identifiers — do not change them once in use.
type Action string

const (
	ActionProjectRead          Action = "project.read"
	ActionProjectUpdateMeta    Action = "project.update_meta"
	ActionProjectDelete        Action = "project.delete"
	ActionProjectChangePlan    Action = "project.change_plan"
	ActionProjectChangeBilling Action = "project.change_billing_subject"
	ActionProjectMemberList    Action = "project.member.list"
	ActionProjectMemberRead    Action = "project.member.read"
	ActionProjectMemberAdd     Action = "project.member.add"
	ActionProjectMemberUpdate  Action = "project.member.update"
	ActionProjectMemberRemove  Action = "project.member.remove"
	ActionDBList               Action = "db.list"
	ActionDBRead               Action = "db.read"
	ActionDBCreate             Action = "db.create"
	ActionDBUpdateMeta         Action = "db.update_meta"
	ActionDBStart              Action = "db.start"
	ActionDBStop               Action = "db.stop"
	ActionDBDelete             Action = "db.delete"
	ActionDBConnectionInfoRead Action = "db.connection_info.read"
	ActionSecretList           Action = "secret.list"
	ActionSecretReadMeta       Action = "secret.read_meta"
	ActionSecretCreate         Action = "secret.create"
	ActionSecretUpdateMeta     Action = "secret.update_meta"
	ActionSecretReveal         Action = "secret.reveal"
	ActionSecretDelete         Action = "secret.delete"
	ActionSecretVersionList    Action = "secret.version.list"
	ActionSecretVersionRead    Action = "secret.version.read"
	ActionSecretVersionCreate  Action = "secret.version.create"
	ActionSecretVersionDisable Action = "secret.version.disable"
	ActionTagList              Action = "tag.list"
	ActionTagCreate            Action = "tag.create"
	ActionTagUpdate            Action = "tag.update"
	ActionTagDelete            Action = "tag.delete"
	ActionResourceTagAttach    Action = "resource.tag.attach"
	ActionResourceTagDetach    Action = "resource.tag.detach"
)

// ResourceRef identifies the target resource of an authorization check.
type ResourceRef struct {
	Type string
	ID   string
}

// Principal is API authorization context. ClientID is audit context only and
// never participates in RBAC decisions.
type Principal struct {
	SubjectID uuid.UUID
	SessionID string
	ClientID  string
}

func PrincipalFromContext(ctx context.Context, subjectID uuid.UUID) Principal {
	identity, _ := authctx.IdentityFromContext(ctx)
	return Principal{SubjectID: subjectID, SessionID: identity.SessionID, ClientID: identity.ClientID}
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
	Authorize(ctx context.Context, principal Principal, action Action, resource ResourceRef) (*AuthorizationDecision, error)
}
