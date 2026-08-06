package authz

import (
	"context"
	"log/slog"
)

type auditedAuthorizer struct {
	next Authorizer
	log  *slog.Logger
}

func NewAuditedAuthorizer(next Authorizer, logger *slog.Logger) Authorizer {
	return &auditedAuthorizer{next: next, log: logger}
}

func (a *auditedAuthorizer) Authorize(ctx context.Context, principal Principal, action Action, resource ResourceRef) (*AuthorizationDecision, error) {
	decision, err := a.next.Authorize(ctx, principal, action, resource)
	args := []any{
		"subject_id", principal.SubjectID,
		"session_id", principal.SessionID,
		"client_id", principal.ClientID,
		"action", action,
		"resource_type", resource.Type,
		"resource_id", resource.ID,
	}
	if err != nil {
		a.log.Error("authorization_decision", append(args, "outcome", "error", "error", err)...)
		return nil, err
	}
	a.log.Info("authorization_decision", append(args,
		"outcome", map[bool]string{true: "allow", false: "deny"}[decision.Allowed],
		"reason_code", decision.ReasonCode,
	)...)
	return decision, nil
}
