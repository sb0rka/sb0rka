package databases

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
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

func (h *Handler) CreateDatabase(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.CreateDatabaseRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	name, err := service.ValidateCommonName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	normalizedName, err := service.NormalizeDatabaseName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	description, err := service.ValidateCommonDescription(req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.deps.PlatformDatabase.AssertCanCreateResourceWithType(r.Context(), userID, projectID, "database"); err != nil {
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
		if errors.Is(err, db.ErrInvalidResourceKind) {
			http.Error(w, "Invalid resource type", http.StatusBadRequest)
			return
		}
		h.deps.Log.Error("assert_resource_quota_failed", "error", err)
		http.Error(w, "Failed to create database", http.StatusInternalServerError)
		return
	}

	secretValue, err := service.GenerateAlphaNumPassword()
	if err != nil {
		h.deps.Log.Error("generate_password_failed", "error", err)
		http.Error(w, "Failed to generate password", http.StatusInternalServerError)
		return
	}
	encryptedSecretValue, err := service.EncryptSecret(secretValue, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	passwordVerifier, err := service.GeneratePostgresSCRAMSHA256Verifier(secretValue)
	if err != nil {
		h.deps.Log.Error("generate_password_verifier_failed", "error", err)
		http.Error(w, "Failed to generate password verifier", http.StatusInternalServerError)
		return
	}

	dbRow, secretRow, err := h.deps.PlatformDatabase.CreateDatabase(r.Context(), userID, projectID, name, normalizedName, description, encryptedSecretValue, passwordVerifier)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("create_database_failed", "error", err)
		http.Error(w, "Failed to create database", http.StatusInternalServerError)
		return
	}

	resp := contract.DatabaseWithSecretResponse{
		Database: toDatabaseResponse(dbRow),
		Secret: contract.SecretResponse{
			ResourceID:  secretRow.ResourceID,
			Name:        secretRow.Name,
			Description: secretRow.Description,
			Version:     secretRow.Version,
			RevealedAt:  secretRow.RevealedAt,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rows, err := h.deps.PlatformDatabase.ListDatabases(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_databases_failed", "error", err)
		http.Error(w, "Failed to list databases", http.StatusInternalServerError)
		return
	}

	out := make([]contract.DatabaseResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, toDatabaseResponse(r))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.DatabaseListResponse{Databases: out})
}

func (h *Handler) GetDatabase(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
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

	row, err := h.deps.PlatformDatabase.GetDatabase(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_database_failed", "error", err)
		http.Error(w, "Failed to get database", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toDatabaseResponse(row))
}

func (h *Handler) UpdateDatabase(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
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

	var req contract.UpdateDatabaseRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == nil && req.Description == nil {
		http.Error(w, "at least one of name or description must be provided", http.StatusBadRequest)
		return
	}

	var name, description *string

	if req.Name != nil {
		validatedName, err := service.ValidateCommonName(*req.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		name = &validatedName
	}
	if req.Description != nil {
		description, err = service.ValidateCommonDescription(req.Description)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	row, err := h.deps.PlatformDatabase.UpdateDatabase(r.Context(), userID, projectID, resourceID, name, description)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_database_failed", "error", err)
		http.Error(w, "Failed to update database", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toDatabaseResponse(row))
}

func (h *Handler) GetDatabaseConnection(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
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

	dbRow, secret, err := h.deps.PlatformDatabase.GetDatabaseConnParams(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrMultipleResourceRows) {
			http.Error(w, "Database secret mapping is ambiguous", http.StatusConflict)
			return
		}
		h.deps.Log.Error("get_database_uri_params_failed", "error", err)
		http.Error(w, "Failed to get database URI params", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.DatabaseConnParamsResponse{
		Host:             fmt.Sprintf("%s.%s", dbRow.ResourceID, h.deps.Cfg.TenantsDatabasePublicBaseHost),
		Port:             h.deps.Cfg.TenantsDatabasePublicPort,
		User:             h.deps.Cfg.TenantsDatabaseUser,
		PasswordSecretID: secret.ResourceID,
		DatabaseName:     dbRow.NormalizedName,
	})
}

func (h *Handler) GetDatabaseURI(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
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

	dbRow, secret, err := h.deps.PlatformDatabase.GetDatabaseConnParams(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrMultipleResourceRows) {
			http.Error(w, "Database secret mapping is ambiguous", http.StatusConflict)
			return
		}
		h.deps.Log.Error("get_database_uri_params_failed", "error", err)
		http.Error(w, "Failed to get database URI params", http.StatusInternalServerError)
		return
	}

	decryptedSecretValue, err := service.DecryptSecret(secret.SecretValueHash, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to decrypt secret value", http.StatusInternalServerError)
		return
	}

	databaseHost := fmt.Sprintf("%s.%s", dbRow.ResourceID, h.deps.Cfg.TenantsDatabasePublicBaseHost)

	uri := fmt.Sprintf(
		"postgresql://%s:%s@%s:%d/%s?sslmode=require&sslnegotiation=direct",
		h.deps.Cfg.TenantsDatabaseUser, decryptedSecretValue, databaseHost, h.deps.Cfg.TenantsDatabasePublicPort, dbRow.NormalizedName,
	)

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(uri))
}

func (h *Handler) DeleteDatabase(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(strings.TrimSpace(userIDStr))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusInternalServerError)
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

	dbRow, dbVerifier, err := h.deps.PlatformDatabase.ClaimDatabaseTermination(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("claim_database_termination_failed", "error", err)
		http.Error(w, "Failed to delete database", http.StatusInternalServerError)
		return
	}

	h.deps.Log.Info("database_termination_claimed", "user_id", userID, "project_id", projectID, "db_id", dbRow.ResourceID, "secret_id", dbVerifier.PasswordSecretID)

	w.WriteHeader(http.StatusNoContent)
}

func parsePathID(raw, name string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New(name + " is required")
	}
	return id, nil
}

func toDatabaseResponse(d model.DB) contract.DatabaseResponse {
	resp := contract.DatabaseResponse{
		ResourceID:     d.ResourceID,
		Name:           d.Name,
		NormalizedName: d.NormalizedName,
		Description:    d.Description,
	}

	if d.ResourceState != nil {
		resp.ResourceState = &contract.ResourceStateResponse{
			RuntimeState: d.ResourceState.RuntimeState,
			CreatedAt:    d.ResourceState.CreatedAt,
			UpdatedAt:    d.ResourceState.UpdatedAt,
		}
	}

	if len(d.Tags) > 0 {
		resp.Tags = make([]contract.TagResponse, 0, len(d.Tags))
		for _, tag := range d.Tags {
			resp.Tags = append(resp.Tags, contract.TagResponse{
				ID:         tag.ID,
				ProjectID:  tag.ProjectID,
				TagKey:     tag.TagKey,
				TagValue:   tag.TagValue,
				Color:      tag.Color,
				IsSystem:   tag.IsSystem,
				IsReadonly: tag.IsReadonly,
			})
		}
	}

	return resp
}
