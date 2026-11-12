package apiapp

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/apps/api/pkg/route"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

func projectReadAuthorizer(authorizer authz.Authorizer) func(context.Context, string) (uuid.UUID, error) {
	return projectActionAuthorizer(authorizer, authz.ActionProjectRead)
}

// Each exposed permission binds a fixed platform action to the audited RBAC.
func projectActionAuthorizer(authorizer authz.Authorizer, action authz.Action) func(context.Context, string) (uuid.UUID, error) {
	return func(ctx context.Context, publicID string) (uuid.UUID, error) {
		raw, ok := authctx.SubjectIDFromContext(ctx)
		callerID, err := uuid.Parse(raw)
		if !ok || err != nil || callerID == uuid.Nil {
			return uuid.Nil, &route.StatusError{Status: http.StatusUnauthorized, Message: "Unauthorized"}
		}
		publicID, err = runtime.ParsePublicID(publicID, "project_id")
		if err != nil {
			return uuid.Nil, &route.StatusError{Status: http.StatusBadRequest, Message: err.Error()}
		}
		decision, err := authorizer.Authorize(ctx, authz.PrincipalFromContext(ctx, callerID), action, authz.ResourceRef{
			Type: "project", PublicID: publicID,
		})
		if err != nil {
			return uuid.Nil, err
		}
		if !decision.Allowed {
			return uuid.Nil, &route.StatusError{Status: http.StatusForbidden, Message: "Forbidden"}
		}
		return decision.Resource.ID, nil
	}
}

// Another helper belongs here only for a platform action that project.read does
// not cover, such as db.create or secret.delete. Resource public ids are not an
// action: load the row by the returned project UUID. Extension-owned rules stay
// in the extension.
