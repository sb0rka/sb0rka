package secrets

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	secrethook "github.com/sb0rka/sb0rka/apps/api/pkg/secret"
	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
)

func (h *Handler) prepareSecretValue(ctx context.Context, payloadKind, value, purpose string) (string, error) {
	if purpose != "" {
		return h.deps.SecretHook.GenerateValue(ctx, payloadKind, purpose)
	}
	validated, err := service.ValidateSecretValue(value)
	if err != nil {
		return "", &secrethook.StatusError{Status: http.StatusBadRequest, Message: err.Error()}
	}
	return validated, nil
}

func (h *Handler) writeSecretMutationError(w http.ResponseWriter, event string, projectID uuid.UUID, secretID string, err error) {
	if errors.Is(err, db.ErrResourceNotFound) {
		h.writeSecretStoreError(w, event, projectID, secretID, err)
		return
	}
	coretransport.WriteHookError(w, err, h.deps.Log, event, "project_id", projectID, "secret_id", secretID)
}
