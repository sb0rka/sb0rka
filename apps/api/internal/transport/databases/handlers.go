package databases

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
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
		if errors.Is(err, db.ErrInvalidResourceType) {
			http.Error(w, "Invalid resource type", http.StatusBadRequest)
			return
		}
		h.deps.Log.Error("assert_resource_quota_failed", "error", err)
		http.Error(w, "Failed to create database", http.StatusInternalServerError)
		return
	}

	dbRow, err := h.deps.PlatformDatabase.CreateDatabase(r.Context(), userID, projectID, name, normalizedName, description)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("create_database_failed", "error", err)
		http.Error(w, "Failed to create database", http.StatusInternalServerError)
		return
	}

	secretName := fmt.Sprintf("DATABASE_%s_PASSWORD", dbRow.ResourceID)
	secretDescription := fmt.Sprintf("Password for database %s with ID %s", dbRow.Name, dbRow.ResourceID)
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

	secret, err := h.deps.PlatformDatabase.CreateSecret(r.Context(), userID, projectID, secretName, &secretDescription, encryptedSecretValue)
	if err != nil {
		h.deps.Log.Error("create_secret_failed", "error", err)
		http.Error(w, "Failed to create secret", http.StatusInternalServerError)
		return
	}

	tagKey := "db_id"
	tagValue := dbRow.ResourceID
	if _, err := h.deps.PlatformDatabase.AttachResourceTag(r.Context(), userID, projectID, dbRow.ResourceID, tagKey, tagValue, nil, true); err != nil {
		h.deps.Log.Error("attach_resource_tag_failed", "error", err)
		http.Error(w, "Failed to attach resource tag", http.StatusInternalServerError)
		return
	}
	if _, err := h.deps.PlatformDatabase.AttachResourceTag(r.Context(), userID, projectID, secret.ResourceID, tagKey, tagValue, nil, true); err != nil {
		h.deps.Log.Error("attach_resource_tag_failed", "error", err)
		http.Error(w, "Failed to attach resource tag", http.StatusInternalServerError)
		return
	}

	resp := contract.DatabaseWithSecretResponse{
		Database: toDatabaseResponse(dbRow),
		Secret: contract.SecretResponse{
			ResourceID:  secret.ResourceID,
			Name:        secret.Name,
			Description: secret.Description,
			RevealedAt:  secret.RevealedAt,
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

	dbs, err := h.deps.PlatformDatabase.ListDatabases(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_databases_failed", "error", err)
		http.Error(w, "Failed to list databases", http.StatusInternalServerError)
		return
	}

	out := make([]contract.DatabaseResponse, 0, len(dbs))
	for _, d := range dbs {
		out = append(out, toDatabaseResponse(d))
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

	dbRow, err := h.deps.PlatformDatabase.GetDatabase(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_database_failed", "error", err)
		http.Error(w, "Failed to get database", http.StatusInternalServerError)
		return
	}

	secret, err := h.deps.PlatformDatabase.GetDatabaseSecret(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database secret not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrMultipleResourceRows) {
			http.Error(w, "Database secret mapping is ambiguous", http.StatusConflict)
			return
		}
		h.deps.Log.Error("get_database_secret_failed", "error", err)
		http.Error(w, "Failed to get database secret", http.StatusInternalServerError)
		return
	}

	decryptedSecretValue, err := service.DecryptSecret(secret.SecretValueHash, h.deps.Cfg.AuthConfig.SecretMasterKey)
	if err != nil {
		http.Error(w, "Failed to decrypt secret value", http.StatusInternalServerError)
		return
	}

	uri := fmt.Sprintf(
		"postgresql://root:%s@%s.%s:%d/%s?sslmode=require&sslnegotiation=direct",
		decryptedSecretValue, resourceID, h.deps.Cfg.TenantsDatabasePublicBaseHost, h.deps.Cfg.TenantsDatabasePublicPort, dbRow.NormalizedName,
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

	res, err := h.deps.PlatformDatabase.DeactivateResource(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("deactivate_resource_failed", "error", err)
		http.Error(w, "Failed to deactivate resource", http.StatusInternalServerError)
		return
	}

	// TODO(kompotkot): CreateJob for database and secret deletion
	// TODO(kompotkot): Delete databases, secret and related tag

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ResourceResponse{
		ID:           res.ID,
		ProjectID:    res.ProjectID,
		IsActive:     res.IsActive,
		ResourceType: res.ResourceType,
		CreatedAt:    res.CreatedAt,
		UpdatedAt:    res.UpdatedAt,
	})
}

func (h *Handler) CreateDatabaseTable(w http.ResponseWriter, r *http.Request) {
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

	var req contract.CreateDatabaseTableRequest
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
	description, err := service.ValidateCommonDescription(req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	row, err := h.deps.PlatformDatabase.CreateDatabaseTable(r.Context(), userID, projectID, resourceID, name, description)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("create_database_table_failed", "error", err)
		http.Error(w, "Failed to create table", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toTableResponse(row))
}

func (h *Handler) ListDatabaseTables(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.deps.PlatformDatabase.ListDatabaseTables(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_database_tables_failed", "error", err)
		http.Error(w, "Failed to list tables", http.StatusInternalServerError)
		return
	}
	out := make([]contract.DBTableResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toTableResponse(row))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.DBTableListResponse{Tables: out})
}

func (h *Handler) GetDatabaseTable(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := h.deps.PlatformDatabase.GetDatabaseTable(r.Context(), userID, projectID, resourceID, tableID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_database_table_failed", "error", err)
		http.Error(w, "Failed to get table", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toTableResponse(row))
}

func (h *Handler) UpdateDatabaseTable(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.UpdateDatabaseTableRequest
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

	row, err := h.deps.PlatformDatabase.UpdateDatabaseTable(r.Context(), userID, projectID, resourceID, tableID, name, description)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_database_table_failed", "error", err)
		http.Error(w, "Failed to update table", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toTableResponse(row))
}

func (h *Handler) DeleteDatabaseTable(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.deps.PlatformDatabase.DeleteDatabaseTable(r.Context(), userID, projectID, resourceID, tableID); err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_database_table_failed", "error", err)
		http.Error(w, "Failed to delete table", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) CreateDatabaseColumn(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.CreateDatabaseColumnRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.DataType = strings.TrimSpace(req.DataType)
	req.Name, err = service.ValidateCommonName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.DataType == "" {
		http.Error(w, "name and data_type are required", http.StatusBadRequest)
		return
	}
	row, err := h.deps.PlatformDatabase.CreateDatabaseColumn(
		r.Context(), userID, projectID, resourceID, tableID, req.Name, req.DataType, req.IsPK, req.IsNullable, req.IsUnique, req.IsArray, req.DefaultValue, req.FK,
	)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("create_database_column_failed", "error", err)
		http.Error(w, "Failed to create column", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toColumnResponse(row))
}

func (h *Handler) ListDatabaseColumns(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	rows, err := h.deps.PlatformDatabase.ListDatabaseColumns(r.Context(), userID, projectID, resourceID, tableID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_database_columns_failed", "error", err)
		http.Error(w, "Failed to list columns", http.StatusInternalServerError)
		return
	}
	out := make([]contract.DBTableColumnResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toColumnResponse(row))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.DBTableColumnListResponse{Columns: out})
}

func (h *Handler) GetDatabaseColumn(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	columnID, err := parsePathInt64(r.PathValue("column_id"), "column_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := h.deps.PlatformDatabase.GetDatabaseColumn(r.Context(), userID, projectID, resourceID, tableID, columnID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Column not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_database_column_failed", "error", err)
		http.Error(w, "Failed to get column", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toColumnResponse(row))
}

func (h *Handler) UpdateDatabaseColumn(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	columnID, err := parsePathInt64(r.PathValue("column_id"), "column_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.UpdateDatabaseColumnRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Name, err = service.ValidateCommonName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := h.deps.PlatformDatabase.UpdateDatabaseColumn(r.Context(), userID, projectID, resourceID, tableID, columnID, req.Name)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Column not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_database_column_failed", "error", err)
		http.Error(w, "Failed to update column", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toColumnResponse(row))
}

func (h *Handler) DeleteDatabaseColumn(w http.ResponseWriter, r *http.Request) {
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
	tableID, err := parsePathInt64(r.PathValue("table_id"), "table_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	columnID, err := parsePathInt64(r.PathValue("column_id"), "column_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.deps.PlatformDatabase.DeleteDatabaseColumn(r.Context(), userID, projectID, resourceID, tableID, columnID); err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Column not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_database_column_failed", "error", err)
		http.Error(w, "Failed to delete column", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

func parsePathID(raw, name string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New(name + " is required")
	}
	return id, nil
}

func toDatabaseResponse(d model.DB) contract.DatabaseResponse {
	return contract.DatabaseResponse{
		ResourceID:     d.ResourceID,
		Name:           d.Name,
		NormalizedName: d.NormalizedName,
		Description:    d.Description,
		NextTableID:    d.NextTableID,
	}
}

func toTableResponse(row model.DBTable) contract.DBTableResponse {
	return contract.DBTableResponse{
		ID:           row.ID,
		DBID:         row.DBID,
		Name:         row.Name,
		Description:  row.Description,
		NextColumnID: row.NextColumnID,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}

func toColumnResponse(row model.DBTableColumn) contract.DBTableColumnResponse {
	return contract.DBTableColumnResponse{
		ID:           row.ID,
		TableID:      row.TableID,
		DBID:         row.DBID,
		Name:         row.Name,
		DataType:     row.DataType,
		IsPK:         row.IsPrimaryKey,
		IsNullable:   row.IsNullable,
		IsUnique:     row.IsUnique,
		IsArray:      row.IsArray,
		DefaultValue: row.DefaultValue,
		FK:           row.ForeignKey,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}
