package secrets

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
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
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.CreateSecretRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.SecretValue == "" {
		http.Error(w, "name and secret_value are required", http.StatusBadRequest)
		return
	}
	if req.Description != nil {
		trimmed := strings.TrimSpace(*req.Description)
		if trimmed == "" {
			req.Description = nil
		} else {
			req.Description = &trimmed
		}
	}
	encrypted, err := service.EncryptSecret(req.SecretValue, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	secret, err := h.deps.PlatformDatabase.CreateSecret(r.Context(), userID, projectID, req.Name, req.Description, encrypted)
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
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
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

func (h *Handler) RevealSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathInt64(r.PathValue("resource_id"), "resource_id")
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.RevealSecretValueResponse{SecretValue: value})
}

func (h *Handler) UpdateSecretValue(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourceID, err := parsePathInt64(r.PathValue("resource_id"), "resource_id")
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
	if req.SecretValue == "" {
		http.Error(w, "secret_value is required", http.StatusBadRequest)
		return
	}
	encrypted, err := service.EncryptSecret(req.SecretValue, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	secret, err := h.deps.PlatformDatabase.UpdateSecretValue(r.Context(), userID, projectID, resourceID, encrypted)
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

func parsePathInt64(raw, name string) (int64, error) {
	if raw == "" {
		return 0, errors.New(name + " is required")
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, errors.New(name + " must be a valid integer")
	}
	if id == 0 {
		return 0, errors.New("id is required")
	}
	return id, nil
}
