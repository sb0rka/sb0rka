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

// CreateSecret godoc
// @Summary  Создать секрет
// @Tags     secrets
// @Accept   json
// @Produce  json
// @Param    project_id  path      string                         true  "ID проекта"
// @Param    body        body      contract.CreateSecretRequest   true  "Параметры секрета"
// @Success  201         {object}  map[string]interface{}  "{\"secret\": {...}, \"version\": {...}}"
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  422         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/secret [post]
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
	value, err := service.ValidateSecretValue(req.SecretValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.PayloadKind) == "" {
		http.Error(w, "payload_kind is required", http.StatusUnprocessableEntity)
		return
	}
	payloadKind, err := normalizePayloadKind(req.PayloadKind)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	secretID, err := h.deps.PlatformDatabase.GenerateResourceID(r.Context())
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

// ListSecrets godoc
// @Summary  Список секретов проекта
// @Tags     secrets
// @Produce  json
// @Param    project_id  path      string                          true  "ID проекта"
// @Success  200         {object}  contract.SecretListResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/secrets [get]
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
	out := make([]contract.SecretListItem, 0, len(rows))
	for _, s := range rows {
		out = append(out, toSecretListItem(s))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretListResponse{
		ProjectID: projectID,
		Secrets:   out,
	})
}

// GetSecret godoc
// @Summary  Получить метаданные секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                    true  "ID проекта"
// @Param    resource_id  path      string                    true  "ID секрета"
// @Success  200          {object}  contract.SecretResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret [get]
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

// UpdateSecret godoc
// @Summary  Обновить метаданные секрета
// @Tags     secrets
// @Accept   json
// @Produce  json
// @Param    project_id   path      string                         true  "ID проекта"
// @Param    resource_id  path      string                         true  "ID секрета"
// @Param    body         body      contract.UpdateSecretRequest   true  "Изменяемые поля"
// @Success  200          {object}  contract.SecretResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret [patch]
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

// ListSecretVersions godoc
// @Summary  Список версий секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                              true  "ID проекта"
// @Param    resource_id  path      string                              true  "ID секрета"
// @Success  200          {object}  contract.SecretVersionListResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions [get]
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
	out := make([]contract.SecretVersionListItem, 0, len(versions))
	for _, version := range versions {
		out = append(out, toSecretVersionListItem(version))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.SecretVersionListResponse{
		ProjectID: projectID,
		SecretID:  secretID,
		Versions:  out,
	})
}

// GetSecretVersion godoc
// @Summary  Получить версию секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                           true  "ID проекта"
// @Param    resource_id  path      string                           true  "ID секрета"
// @Param    version_no   path      integer                          true  "Номер версии"
// @Success  200          {object}  contract.SecretVersionResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no} [get]
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

// CreateSecretVersion godoc
// @Summary  Создать новую версию секрета
// @Tags     secrets
// @Accept   json
// @Produce  json
// @Param    project_id   path      string                                true  "ID проекта"
// @Param    resource_id  path      string                                true  "ID секрета"
// @Param    body         body      contract.CreateSecretVersionRequest   true  "Значение и тип payload"
// @Success  201          {object}  contract.SecretVersionResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Failure  422          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions [post]
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
	value, err := service.ValidateSecretValue(req.SecretValue)
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

// DisableSecretVersion godoc
// @Summary  Отключить версию секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                           true  "ID проекта"
// @Param    resource_id  path      string                           true  "ID секрета"
// @Param    version_no   path      integer                          true  "Номер версии"
// @Success  200          {object}  contract.SecretVersionResponse
// @Success  204          "Already disabled"
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/disable [post]
func (h *Handler) DisableSecretVersion(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionSecretVersionDisable, projectID) {
		return
	}
	version, err := h.deps.PlatformDatabase.DisableSecretVersion(r.Context(), projectID, secretID, versionNo)
	if err != nil {
		if errors.Is(err, db.ErrSecretVersionAlreadyDisabled) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.writeSecretStoreError(w, "disable_secret_version_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toSecretVersionResponse(version))
}

// RevealSecret godoc
// @Summary  Раскрыть значение текущей версии секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                         true  "ID проекта"
// @Param    resource_id  path      string                         true  "ID секрета"
// @Success  200          {object}  contract.RevealSecretResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/reveal [post]
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

// RevealSecretVersion godoc
// @Summary  Раскрыть значение версии секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                         true  "ID проекта"
// @Param    resource_id  path      string                         true  "ID секрета"
// @Param    version_no   path      integer                        true  "Номер версии"
// @Success  200          {object}  contract.RevealSecretResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/reveal [post]
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

// ApplySecretVersionPasswordVerifier godoc
// @Summary  Применить SCRAM-verifier пароля БД для версии секрета
// @Tags     secrets
// @Produce  json
// @Param    project_id   path      string                                          true  "ID проекта"
// @Param    resource_id  path      string                                          true  "ID секрета"
// @Param    version_no   path      integer                                         true  "Номер версии"
// @Success  200          {object}  contract.ApplySecretPasswordVerifierResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Failure  422          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/verifier/apply [post]
func (h *Handler) ApplySecretVersionPasswordVerifier(w http.ResponseWriter, r *http.Request) {
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
	isDBPasswordSecret, err := h.deps.PlatformDatabase.IsDatabasePasswordSecret(r.Context(), projectID, secretID)
	if err != nil {
		h.writeSecretStoreError(w, "check_db_password_secret_failed", projectID, secretID, err)
		return
	}
	if !isDBPasswordSecret {
		http.Error(w, "Secret is not a database password secret", http.StatusConflict)
		return
	}
	secret, version, material, err := h.deps.PlatformDatabase.GetSecretMaterialForReveal(r.Context(), projectID, secretID, versionNo)
	if err != nil {
		h.writeSecretStoreError(w, "get_secret_material_failed", projectID, secretID, err)
		return
	}
	if version.State != model.SecretVersionStateActive {
		http.Error(w, "Secret version is not active", http.StatusConflict)
		return
	}
	if version.PayloadKind != model.SecretPayloadKindText {
		http.Error(w, "Only text payload_kind can be used as a database password", http.StatusUnprocessableEntity)
		return
	}
	aad, err := service.BuildSecretAAD(projectID, secretID, version.VersionNo, secret.ProtectionClass)
	if err != nil {
		http.Error(w, "Failed to build secret AAD", http.StatusInternalServerError)
		return
	}
	plain, err := h.deps.SecretCrypto.Decrypt(r.Context(), material.EncryptedMessage, aad, material.EncryptionKeyRef)
	if err != nil {
		h.deps.Log.Error("decrypt_secret_failed", "project_id", projectID, "secret_id", secretID, "version_no", versionNo, "crypto_provider", material.CryptoProvider, "encryption_key_id", material.EncryptionKeyID, "error", err)
		http.Error(w, "secret_decrypt_failed", http.StatusInternalServerError)
		return
	}
	passwordVerifier, err := service.GeneratePostgresSCRAMSHA256Verifier(string(plain))
	if err != nil {
		h.deps.Log.Error("generate_db_password_verifier_failed", "project_id", projectID, "secret_id", secretID, "version_no", versionNo, "error", err)
		http.Error(w, "Failed to prepare database password verifier", http.StatusInternalServerError)
		return
	}
	verifierRow, err := h.deps.PlatformDatabase.SetDatabasePasswordSecretVerifier(r.Context(), projectID, secretID, versionNo, passwordVerifier)
	if err != nil {
		h.writeSecretStoreError(w, "set_db_password_verifier_failed", projectID, secretID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ApplySecretPasswordVerifierResponse{
		ProjectID:    projectID,
		SecretID:     secretID,
		VersionNo:    versionNo,
		DBInstanceID: verifierRow.DBInstanceID,
	})
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

// DeleteSecret godoc
// @Summary  Удалить секрет
// @Tags     secrets
// @Param    project_id   path  string  true  "ID проекта"
// @Param    resource_id  path  string  true  "ID секрета"
// @Success  204          "No Content"
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  409          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret [delete]
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
	case errors.Is(err, db.ErrResourceInUse), errors.Is(err, db.ErrInvalidSecretVersion),
		errors.Is(err, db.ErrCannotDisableCurrentSecretVersion), errors.Is(err, db.ErrSecretVersionReferencedByDBVerifier):
		switch {
		case errors.Is(err, db.ErrCannotDisableCurrentSecretVersion):
			http.Error(w, "Cannot disable current secret version", http.StatusConflict)
		case errors.Is(err, db.ErrSecretVersionReferencedByDBVerifier):
			http.Error(w, "Secret version is referenced by a database password verifier", http.StatusConflict)
		default:
			http.Error(w, "Secret conflict", http.StatusConflict)
		}
	case errors.Is(err, db.ErrEncryptionKeyNotFound):
		http.Error(w, "Encryption key not found", http.StatusInternalServerError)
	case errors.Is(err, db.ErrDBPasswordVerifierNotUpdated):
		http.Error(w, "Database password verifier could not be updated", http.StatusConflict)
	default:
		h.deps.Log.Error(event, "project_id", projectID, "secret_id", secretID, "error", err)
		http.Error(w, "Failed to process secret", http.StatusInternalServerError)
	}
}

func toSecretListItem(s model.Secret) contract.SecretListItem {
	return contract.SecretListItem{
		SecretID:           s.ResourceID,
		Name:               s.Name,
		Description:        s.Description,
		PayloadKind:        s.PayloadKind,
		ProtectionClass:    s.ProtectionClass,
		CurrentVersionNo:   s.CurrentVersionNo,
		CreatedBySubjectID: s.CreatedBySubjectID.String(),
		CreatedAt:          s.CreatedAt,
		UpdatedAt:          s.UpdatedAt,
	}
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
	if s.PasswordVerifier != nil {
		resp.PasswordVerifier = &contract.SecretPasswordVerifierResponse{
			PasswordDesiredVersion: s.PasswordVerifier.PasswordDesiredVersion,
			PasswordDesiredState:   s.PasswordVerifier.PasswordDesiredState,
			CreatedAt:              s.PasswordVerifier.CreatedAt,
			UpdatedAt:              s.PasswordVerifier.UpdatedAt,
		}
	}
	return resp
}

func toSecretVersionListItem(v model.SecretVersion) contract.SecretVersionListItem {
	return contract.SecretVersionListItem{
		VersionNo:          v.VersionNo,
		State:              v.State,
		PayloadKind:        v.PayloadKind,
		CreatedBySubjectID: v.CreatedBySubjectID.String(),
		CreatedAt:          v.CreatedAt,
		UpdatedAt:          v.UpdatedAt,
	}
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
