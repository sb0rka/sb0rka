package secrets

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
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
	subjectIDStr, ok := runtime.AuthSubjectIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	subjectID, err := uuid.Parse(strings.TrimSpace(subjectIDStr))
	if err != nil {
		return uuid.Nil, false
	}
	return subjectID, true
}

func parsePathID(raw, name string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New(name + " is required")
	}
	return id, nil
}

func parseVersionNo(raw string) (int, error) {
	versionNo, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || versionNo <= 0 {
		return 0, errors.New("version_no must be a positive integer")
	}
	return versionNo, nil
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

func normalizePayloadKind(raw string) (string, error) {
	kind := strings.TrimSpace(raw)
	if kind == "" {
		return model.SecretPayloadKindText, nil
	}
	switch kind {
	case model.SecretPayloadKindText, model.SecretPayloadKindJSON:
		return kind, nil
	case model.SecretPayloadKindBinary:
		return "", errors.New("binary payload is not supported")
	default:
		return "", errors.New("invalid payload_kind")
	}
}

func (h *Handler) encryptSecretValue(r *http.Request, projectID string, secretID string, versionNo int, protectionClass string, value string) (model.EncryptionKey, []byte, []byte, error) {
	key, err := h.deps.PlatformDatabase.GetActiveEncryptionKey(r.Context())
	if err != nil {
		return model.EncryptionKey{}, nil, nil, err
	}
	aad, err := service.BuildSecretAAD(projectID, secretID, versionNo, protectionClass)
	if err != nil {
		return model.EncryptionKey{}, nil, nil, err
	}
	encryptedMessage, err := h.deps.SecretCrypto.Encrypt(r.Context(), []byte(value), aad, key.KeyRef)
	if err != nil {
		return model.EncryptionKey{}, nil, nil, err
	}
	return key, aad, encryptedMessage, nil
}

func (h *Handler) CreateSecret(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionSecretCreate, projectID) {
		return
	}
	if err := h.deps.PlatformDatabase.AssertCanCreateResourceWithType(r.Context(), subjectID, projectID, model.ResourceKindSecret); err != nil {
		if errors.Is(err, db.ErrResourceLimitReached) {
			http.Error(w, "Resource limit reached", http.StatusForbidden)
			return
		}
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
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
	value, err := service.ValidateSecretValue(req.Value)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	payloadKind, err := normalizePayloadKind(req.PayloadKind)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	secretID, err := service.GenerateResourceID()
	if err != nil {
		http.Error(w, "Failed to generate secret id", http.StatusInternalServerError)
		return
	}
	key, aad, encryptedMessage, err := h.encryptSecretValue(r, projectID, secretID, 1, model.SecretProtectionClassServerManaged, value)
	if err != nil {
		h.deps.Log.Error("encrypt_secret_failed", "project_id", projectID, "secret_id", secretID, "error", err)
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	secret, version, err := h.deps.PlatformDatabase.CreateSecretWithInitialVersion(r.Context(), db.CreateSecretWithInitialVersionParams{
		ProjectID:             projectID,
		SecretID:              secretID,
		Name:                  name,
		Description:           description,
		PayloadKind:           payloadKind,
		ProtectionClass:       model.SecretProtectionClassServerManaged,
		CreatedBySubjectID:    subjectID,
		EncryptionKeyID:       key.ID,
		CryptoProvider:        model.CryptoProviderTinkAEAD,
		CryptoEnvelopeVersion: model.CryptoEnvelopeVersionTinkAEADV1,
		ContentAlgorithm:      key.Algorithm,
		AADContext:            aad,
		EncryptedMessage:      encryptedMessage,
	})
	if err != nil {
		h.deps.Log.Error("create_secret_failed", "project_id", projectID, "secret_id", secretID, "error", err)
		http.Error(w, "Failed to create secret", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"secret":  toSecretResponse(secret),
		"version": toSecretVersionResponse(version),
	})
}

func (h *Handler) ListSecrets(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionSecretList, projectID) {
		return
	}
	rows, err := h.deps.PlatformDatabase.ListSecrets(r.Context(), projectID)
	if err != nil {
		h.deps.Log.Error("list_secrets_failed", "error", err)
		http.Error(w, "Failed to list secrets", http.StatusInternalServerError)
		return
	}
	out := make([]contract.SecretResponse, 0, len(rows))
	for _, s := range rows {
		out = append(out, toSecretResponse(s))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretListResponse{Secrets: out})
}

func (h *Handler) GetSecret(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretReadMeta, projectID) {
		return
	}
	secret, err := h.deps.PlatformDatabase.GetSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toSecretResponse(secret))
}

func (h *Handler) UpdateSecret(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretUpdateMeta, projectID) {
		return
	}
	var req contract.UpdateSecretRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	description, err := service.ValidateCommonDescription(&req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secret, err := h.deps.PlatformDatabase.UpdateSecretMeta(r.Context(), projectID, secretID, description)
	if err != nil {
		h.writeSecretStoreError(w, "update_secret_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toSecretResponse(secret))
}

func (h *Handler) ListSecretVersions(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretVersionList, projectID) {
		return
	}
	versions, err := h.deps.PlatformDatabase.ListSecretVersions(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "list_secret_versions_failed", projectID, secretID, err)
		return
	}
	out := make([]contract.SecretVersionResponse, 0, len(versions))
	for _, version := range versions {
		out = append(out, toSecretVersionResponse(version))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretVersionListResponse{Versions: out})
}

func (h *Handler) GetSecretVersion(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	versionNo, err := parseVersionNo(r.PathValue("version_no"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretVersionRead, projectID) {
		return
	}
	version, err := h.deps.PlatformDatabase.GetSecretVersion(r.Context(), projectID, secretID, versionNo)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_version_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toSecretVersionResponse(version))
}

func (h *Handler) CreateSecretVersion(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretVersionCreate, projectID) {
		return
	}
	isDBPasswordSecret, err := h.deps.PlatformDatabase.IsDatabasePasswordSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "check_db_password_secret_failed", projectID, secretID, err)
		return
	}
	if isDBPasswordSecret {
		http.Error(w, "Cannot update database password secret through public secret version API", http.StatusConflict)
		return
	}
	secret, err := h.deps.PlatformDatabase.GetSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_failed", projectID, secretID, err)
		return
	}
	var req contract.CreateSecretVersionRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	value, err := service.ValidateSecretValue(req.Value)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	payloadKind, err := normalizePayloadKind(req.PayloadKind)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	newVersionNo := secret.CurrentVersionNo + 1
	key, aad, encryptedMessage, err := h.encryptSecretValue(r, projectID, secretID, newVersionNo, secret.ProtectionClass, value)
	if err != nil {
		h.deps.Log.Error("encrypt_secret_version_failed", "project_id", projectID, "secret_id", secretID, "version_no", newVersionNo, "error", err)
		http.Error(w, "Failed to encrypt secret value", http.StatusInternalServerError)
		return
	}
	version, err := h.deps.PlatformDatabase.CreateSecretVersion(r.Context(), db.CreateSecretVersionParams{
		ProjectID:             projectID,
		SecretID:              secretID,
		VersionNo:             newVersionNo,
		PayloadKind:           payloadKind,
		CreatedBySubjectID:    subjectID,
		EncryptionKeyID:       key.ID,
		CryptoProvider:        model.CryptoProviderTinkAEAD,
		CryptoEnvelopeVersion: model.CryptoEnvelopeVersionTinkAEADV1,
		ContentAlgorithm:      key.Algorithm,
		AADContext:            aad,
		EncryptedMessage:      encryptedMessage,
	})
	if err != nil {
		if errors.Is(err, db.ErrInvalidSecretVersion) {
			http.Error(w, "Secret version conflict", http.StatusConflict)
			return
		}
		h.writeSecretStoreError(w, "create_secret_version_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toSecretVersionResponse(version))
}

func (h *Handler) UpdateSecretVersion(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	versionNo, err := parseVersionNo(r.PathValue("version_no"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretVersionUpdate, projectID) {
		return
	}
	var req contract.UpdateSecretVersionRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.State != model.SecretVersionStateDisabled {
		http.Error(w, "only disabled state is supported", http.StatusUnprocessableEntity)
		return
	}
	version, err := h.deps.PlatformDatabase.DisableSecretVersion(r.Context(), projectID, secretID, versionNo)
	if err != nil {
		h.writeSecretStoreError(w, "disable_secret_version_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toSecretVersionResponse(version))
}

func (h *Handler) RevealSecret(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretReveal, projectID) {
		return
	}
	secret, err := h.deps.PlatformDatabase.GetSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_failed", projectID, secretID, err)
		return
	}
	h.revealSecretVersion(w, r, projectID, secretID, secret.CurrentVersionNo)
}

func (h *Handler) RevealSecretVersion(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	versionNo, err := parseVersionNo(r.PathValue("version_no"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretReveal, projectID) {
		return
	}
	h.revealSecretVersion(w, r, projectID, secretID, versionNo)
}

func (h *Handler) revealSecretVersion(w http.ResponseWriter, r *http.Request, projectID string, secretID string, versionNo int) {
	secret, version, material, err := h.deps.PlatformDatabase.GetSecretMaterialForReveal(r.Context(), projectID, secretID, versionNo)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_material_failed", projectID, secretID, err)
		return
	}
	if version.State != model.SecretVersionStateActive {
		http.Error(w, "Secret version is not active", http.StatusConflict)
		return
	}
	aad, err := service.BuildSecretAAD(projectID, secretID, version.VersionNo, secret.ProtectionClass)
	if err != nil {
		http.Error(w, "Failed to build secret AAD", http.StatusInternalServerError)
		return
	}
	value, err := h.deps.SecretCrypto.Decrypt(r.Context(), material.EncryptedMessage, aad, material.EncryptionKeyRef)
	if err != nil {
		h.deps.Log.Error("decrypt_secret_failed", "project_id", projectID, "secret_id", secretID, "version_no", versionNo, "crypto_provider", material.CryptoProvider, "encryption_key_id", material.EncryptionKeyID, "error", err)
		http.Error(w, "secret_decrypt_failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.RevealSecretResponse{
		ProjectID:   projectID,
		SecretID:    secretID,
		VersionNo:   version.VersionNo,
		PayloadKind: version.PayloadKind,
		Value:       string(value),
	})
}

func (h *Handler) DeleteSecret(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, secretID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionSecretDelete, projectID) {
		return
	}
	err := h.deps.PlatformDatabase.DeleteSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "delete_secret_failed", projectID, secretID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) parseSecretPath(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return "", "", false
	}
	secretID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return "", "", false
	}
	return projectID, secretID, true
}

func (h *Handler) writeSecretStoreError(w http.ResponseWriter, event string, projectID string, secretID string, err error) {
	switch {
	case errors.Is(err, db.ErrResourceNotFound):
		http.Error(w, "Secret not found", http.StatusNotFound)
	case errors.Is(err, db.ErrResourceInUse), errors.Is(err, db.ErrInvalidSecretVersion):
		http.Error(w, "Secret conflict", http.StatusConflict)
	case errors.Is(err, db.ErrEncryptionKeyNotFound):
		http.Error(w, "Encryption key not found", http.StatusInternalServerError)
	default:
		h.deps.Log.Error(event, "project_id", projectID, "secret_id", secretID, "error", err)
		http.Error(w, "Failed to process secret", http.StatusInternalServerError)
	}
}

func toSecretResponse(s model.Secret) contract.SecretResponse {
	resp := contract.SecretResponse{
		ProjectID:          s.ProjectID,
		ResourceID:         s.ResourceID,
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
	if len(s.Tags) > 0 {
		resp.Tags = make([]contract.TagResponse, 0, len(s.Tags))
		for _, tag := range s.Tags {
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

func toSecretVersionResponse(v model.SecretVersion) contract.SecretVersionResponse {
	return contract.SecretVersionResponse{
		ProjectID:          v.ProjectID,
		SecretID:           v.SecretID,
		VersionNo:          v.VersionNo,
		State:              v.State,
		PayloadKind:        v.PayloadKind,
		CreatedBySubjectID: v.CreatedBySubjectID.String(),
		CreatedAt:          v.CreatedAt,
		UpdatedAt:          v.UpdatedAt,
		DisabledAt:         v.DisabledAt,
	}
}
