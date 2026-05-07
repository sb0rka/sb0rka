package databases

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
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

func parseSubjectID(r *http.Request) (uuid.UUID, bool) {
	raw, ok := runtime.AuthSubjectIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(strings.TrimSpace(raw))
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func parsePathID(raw, name string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New(name + " is required")
	}
	return id, nil
}

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request, callerID uuid.UUID, action authz.Action, projectID string) bool {
	decision, err := h.deps.Authorizer.Authorize(r.Context(), callerID, action, authz.ResourceRef{
		Type: "project",
		ID:   projectID,
	})
	if err != nil {
		h.deps.Log.Error("authorize_failed", "action", action, "project_id", projectID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if !decision.Allowed {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
		return false
	}
	return true
}

func (h *Handler) CreateDatabase(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionDBCreate, projectID) {
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

	if err := h.deps.PlatformDatabase.AssertCanCreateResourceWithType(r.Context(), subjectID, projectID, model.ResourceKindDatabase); err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceLimitReached) {
			http.Error(w, "Resource limit reached", http.StatusForbidden)
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
	dbID, err := h.deps.PlatformDatabase.GenerateResourceID(r.Context())
	if err != nil {
		http.Error(w, "Failed to generate database id", http.StatusInternalServerError)
		return
	}
	secretID, err := h.deps.PlatformDatabase.GenerateResourceID(r.Context())
	if err != nil {
		http.Error(w, "Failed to generate secret id", http.StatusInternalServerError)
		return
	}
	key, err := h.deps.PlatformDatabase.GetActiveEncryptionKey(r.Context())
	if err != nil {
		h.deps.Log.Error("get_active_encryption_key_failed", "error", err)
		http.Error(w, "Failed to resolve encryption key", http.StatusInternalServerError)
		return
	}
	aad, err := service.BuildSecretAAD(projectID, secretID, 1, model.SecretProtectionClassServerManaged)
	if err != nil {
		http.Error(w, "Failed to build secret AAD", http.StatusInternalServerError)
		return
	}
	encryptedSecretValue, err := h.deps.SecretCrypto.Encrypt(r.Context(), []byte(secretValue), aad, key.KeyRef)
	if err != nil {
		h.deps.Log.Error("encrypt_database_password_secret_failed", "project_id", projectID, "secret_id", secretID, "error", err)
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	passwordVerifier, err := service.GeneratePostgresSCRAMSHA256Verifier(secretValue)
	if err != nil {
		h.deps.Log.Error("generate_password_verifier_failed", "error", err)
		http.Error(w, "Failed to generate password verifier", http.StatusInternalServerError)
		return
	}

	dbRow, secretRow, _, err := h.deps.PlatformDatabase.CreateDatabase(r.Context(), db.CreateDatabaseParams{
		ProjectID:             projectID,
		DBID:                  dbID,
		SecretID:              secretID,
		Name:                  name,
		NormalizedName:        normalizedName,
		Description:           description,
		PasswordVerifier:      passwordVerifier,
		ActorSubjectID:        subjectID,
		EncryptionKeyID:       key.ID,
		CryptoProvider:        model.CryptoProviderTinkAEAD,
		CryptoEnvelopeVersion: model.CryptoEnvelopeVersionTinkAEADV1,
		ContentAlgorithm:      key.Algorithm,
		AADContext:            aad,
		EncryptedMessage:      encryptedSecretValue,
	})
	if err != nil {
		h.deps.Log.Error("create_database_failed", "error", err)
		http.Error(w, "Failed to create database", http.StatusInternalServerError)
		return
	}

	resp := contract.DatabaseWithSecretResponse{
		Database: toDatabaseResponse(dbRow),
		Secret:   toSecretResponse(secretRow),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionDBList, projectID) {
		return
	}

	rows, err := h.deps.PlatformDatabase.ListDatabases(r.Context(), projectID)
	if err != nil {
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
	subjectID, ok := parseSubjectID(r)
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
	if !h.authorize(w, r, subjectID, authz.ActionDBRead, projectID) {
		return
	}

	row, err := h.deps.PlatformDatabase.GetDatabase(r.Context(), subjectID, projectID, resourceID)
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
	subjectID, ok := parseSubjectID(r)
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
	if !h.authorize(w, r, subjectID, authz.ActionDBUpdateMeta, projectID) {
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

	row, err := h.deps.PlatformDatabase.UpdateDatabase(r.Context(), projectID, resourceID, name, description)
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

func (h *Handler) StartDatabase(w http.ResponseWriter, r *http.Request) {
	h.setDatabaseDesiredRuntimeState(w, r, authz.ActionDBStart, model.DBDesiredRuntimeStateRunning)
}

func (h *Handler) StopDatabase(w http.ResponseWriter, r *http.Request) {
	h.setDatabaseDesiredRuntimeState(w, r, authz.ActionDBStop, model.DBDesiredRuntimeStateSuspended)
}

func (h *Handler) setDatabaseDesiredRuntimeState(w http.ResponseWriter, r *http.Request, action authz.Action, desiredRuntimeState string) {
	subjectID, ok := parseSubjectID(r)
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
	if !h.authorize(w, r, subjectID, action, projectID) {
		return
	}

	row, err := h.deps.PlatformDatabase.SetDatabaseDesiredRuntimeState(r.Context(), projectID, resourceID, desiredRuntimeState)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("set_database_desired_runtime_state_failed", "project_id", projectID, "resource_id", resourceID, "desired_runtime_state", desiredRuntimeState, "error", err)
		http.Error(w, "Failed to update database runtime state", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toDatabaseResponse(row))
}

func (h *Handler) GetDatabaseConnection(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
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
	if !h.authorize(w, r, subjectID, authz.ActionDBConnectionInfoRead, projectID) {
		return
	}

	dbRow, secret, err := h.deps.PlatformDatabase.GetDatabaseConnParams(r.Context(), projectID, resourceID)
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

func (h *Handler) RevealDatabaseURI(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	dbID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionDBConnectionInfoRead, projectID) {
		return
	}

	dbRow, secret, version, material, err := h.deps.PlatformDatabase.GetDatabasePasswordSecretMaterial(r.Context(), projectID, dbID)
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
	if !h.authorize(w, r, subjectID, authz.ActionSecretReveal, projectID) {
		return
	}

	if version.State != model.SecretVersionStateActive {
		http.Error(w, "Database password secret version is not active", http.StatusConflict)
		return
	}
	aad, err := service.BuildSecretAAD(projectID, secret.ResourceID, version.VersionNo, secret.ProtectionClass)
	if err != nil {
		http.Error(w, "Failed to build secret AAD", http.StatusInternalServerError)
		return
	}
	decryptedSecretValue, err := h.deps.SecretCrypto.Decrypt(r.Context(), material.EncryptedMessage, aad, material.EncryptionKeyRef)
	if err != nil {
		h.deps.Log.Error("decrypt_database_uri_secret_failed", "project_id", projectID, "db_id", dbID, "secret_id", secret.ResourceID, "version_no", version.VersionNo, "error", err)
		http.Error(w, "Failed to decrypt secret value", http.StatusInternalServerError)
		return
	}

	databaseHost := fmt.Sprintf("%s.%s", dbRow.ResourceID, h.deps.Cfg.TenantsDatabasePublicBaseHost)
	uri := fmt.Sprintf(
		"postgresql://%s:%s@%s:%d/%s?sslmode=require&sslnegotiation=direct",
		h.deps.Cfg.TenantsDatabaseUser, string(decryptedSecretValue), databaseHost, h.deps.Cfg.TenantsDatabasePublicPort, dbRow.NormalizedName,
	)

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(uri))
}

func (h *Handler) DeleteDatabase(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
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
	if !h.authorize(w, r, subjectID, authz.ActionDBDelete, projectID) {
		return
	}

	dbRow, dbVerifier, err := h.deps.PlatformDatabase.ClaimDatabaseTermination(r.Context(), projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("claim_database_termination_failed", "error", err)
		http.Error(w, "Failed to delete database", http.StatusInternalServerError)
		return
	}

	h.deps.Log.Info("database_termination_claimed", "project_id", projectID, "db_id", dbRow.ResourceID, "secret_id", dbVerifier.PasswordSecretID)
	w.WriteHeader(http.StatusNoContent)
}

func toDatabaseResponse(d model.DB) contract.DatabaseResponse {
	resp := contract.DatabaseResponse{
		ResourceID:          d.ResourceID,
		Name:                d.Name,
		NormalizedName:      d.NormalizedName,
		Description:         d.Description,
		DesiredRuntimeState: d.DesiredRuntimeState,
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

func toSecretResponse(s model.Secret) contract.SecretResponse {
	resp := contract.SecretResponse{
		ProjectID:          s.ProjectID,
		SecretID:           s.ResourceID,
		Name:               s.Name,
		Description:        s.Description,
		PayloadKind:        s.PayloadKind,
		ProtectionClass:    s.ProtectionClass,
		CurrentVersionNo:   s.CurrentVersionNo,
		CreatedBySubjectID: s.CreatedBySubjectID.String(),
		CreatedAt:          s.CreatedAt,
		UpdatedAt:          s.UpdatedAt,
		ScheduledDestroyAt: s.ScheduledDestroyAt,
	}
	if s.ResourceState != nil {
		resp.ResourceState = &contract.ResourceStateResponse{
			RuntimeState: s.ResourceState.RuntimeState,
			CreatedAt:    s.ResourceState.CreatedAt,
			UpdatedAt:    s.ResourceState.UpdatedAt,
		}
	}
	return resp
}
