package secrets

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/packages/contract"

	"github.com/google/uuid"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func (h *Handler) CreateSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.deps.PlatformDatabase.AssertCanCreateResourceWithType(r.Context(), userID, projectID, "secret"); err != nil {
		if errors.Is(err, db.ErrUserPlanNotFound) {
			http.Error(w, "Plan not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceLimitReached) {
			http.Error(w, "Resource limit reached", http.StatusForbidden)
			return
		}
		if errors.Is(err, db.ErrInvalidResourceType) {
			http.Error(w, "Invalid resource type", http.StatusBadRequest)
			return
		}
		h.deps.Log.Error("assert_resource_quota_failed", "error", err)
		http.Error(w, "Failed to create secret", http.StatusInternalServerError)
		return
	}

	var req contract.CreateSecretRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	name, err := service.ValidateSecretName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	description, err := service.ValidateCommonDescription(req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secretValue, err := service.ValidateSecretValue(req.SecretValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	encryptedSecretValue, err := service.EncryptSecret(secretValue, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	secret, err := h.deps.PlatformDatabase.CreateSecret(r.Context(), userID, projectID, name, description, encryptedSecretValue)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("create_secret_failed", "error", err)
		http.Error(w, "Failed to create secret", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(contract.SecretResponse{
		ResourceID:  secret.ResourceID,
		Name:        secret.Name,
		Description: secret.Description,
		RevealedAt:  secret.RevealedAt,
	})
}

func (h *Handler) ListSecrets(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	rows, err := h.deps.PlatformDatabase.ListSecrets(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_secrets_failed", "error", err)
		http.Error(w, "Failed to list secrets", http.StatusInternalServerError)
		return
	}
	out := make([]contract.SecretResponse, 0, len(rows))
	for _, s := range rows {
		out = append(out, contract.SecretResponse{
			ResourceID:  s.ResourceID,
			Name:        s.Name,
			Description: s.Description,
			RevealedAt:  s.RevealedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretListResponse{Secrets: out})
}

func (h *Handler) GetSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	secret, err := h.deps.PlatformDatabase.GetSecret(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretResponse{
		ResourceID:  secret.ResourceID,
		Name:        secret.Name,
		Description: secret.Description,
		RevealedAt:  secret.RevealedAt,
	})
}

func (h *Handler) RevealSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	secret, err := h.deps.PlatformDatabase.RevealSecret(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("reveal_secret_failed", "error", err)
		http.Error(w, "Failed to reveal secret", http.StatusInternalServerError)
		return
	}

	value, err := service.DecryptSecret(secret.SecretValueHash, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to decrypt secret value", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(value))
}

func (h *Handler) UpdateSecretValue(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var req contract.UpdateSecretValueRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	secretValue, err := service.ValidateSecretValue(req.SecretValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	encryptedSecretValue, err := service.EncryptSecret(secretValue, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	secret, err := h.deps.PlatformDatabase.UpdateSecretValue(r.Context(), userID, projectID, resourceID, encryptedSecretValue)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_secret_value_failed", "error", err)
		http.Error(w, "Failed to update secret value", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretResponse{
		ResourceID:  secret.ResourceID,
		Name:        secret.Name,
		Description: secret.Description,
		RevealedAt:  secret.RevealedAt,
	})
}

func (h *Handler) DeleteSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tags, err := h.deps.PlatformDatabase.ListResourceTags(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_resource_tags_failed", "error", err)
		http.Error(w, "Failed to check secret tags", http.StatusInternalServerError)
		return
	}
	for _, tag := range tags {
		if tag.IsSystem {
			http.Error(w, "Cannot delete secret with system tags", http.StatusForbidden)
			return
		}
	}

	err = h.deps.PlatformDatabase.DeleteSecret(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Secret not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_secret_failed", "error", err)
		http.Error(w, "Failed to delete secret", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func parseUserID(r *http.Request) (uuid.UUID, bool) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		return uuid.Nil, false
	}
	return userID, true
}

func parsePathID(raw, name string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New(name + " is required")
	}
	return id, nil
}
