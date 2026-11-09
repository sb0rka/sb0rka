package secrets

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
)

// GrantSecretAgent godoc
// @Summary  Выдать секрет агенту
// @Description Агент уже должен быть участником проекта. Делегированный доступ не используется.
// @Tags     secrets
// @Accept   json
// @Param    project_id   path  string                            true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    resource_id  path  string                            true  "Public ID ресурса (12 строчных hex-символов)" minlength(12) maxlength(12)
// @Param    body         body  contract.GrantSecretAgentRequest true  "Субъект агента"
// @Success  204  "No Content"
// @Failure  400  {string}  string
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/agents [post]
func (h *Handler) GrantSecretAgent(w http.ResponseWriter, r *http.Request) {
	h.changeSecretAgent(w, r, true)
}

// RevokeSecretAgent godoc
// @Summary  Снять секрет с агента
// @Tags     secrets
// @Param    project_id   path  string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    resource_id  path  string  true  "Public ID ресурса (12 строчных hex-символов)" minlength(12) maxlength(12)
// @Param    subject_id   path  string  true  "UUID агента" format(uuid)
// @Success  204  "No Content"
// @Failure  400  {string}  string
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/secret/agents/{subject_id} [delete]
func (h *Handler) RevokeSecretAgent(w http.ResponseWriter, r *http.Request) {
	h.changeSecretAgent(w, r, false)
}

func (h *Handler) changeSecretAgent(w http.ResponseWriter, r *http.Request, grant bool) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectPublicID, secretPublicID, ok := h.parseSecretPath(w, r)
	if !ok {
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionSecretAgentGrant, projectPublicID)
	if !ok {
		return
	}
	var agentID uuid.UUID
	var err error
	if grant {
		var req contract.GrantSecretAgentRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		agentID, err = uuid.Parse(strings.TrimSpace(req.SubjectID))
	} else {
		agentID, err = uuid.Parse(strings.TrimSpace(r.PathValue("subject_id")))
	}
	if err != nil || agentID == uuid.Nil {
		http.Error(w, "invalid subject_id", http.StatusBadRequest)
		return
	}
	member, err := h.deps.PlatformDatabase.IsProjectAgent(r.Context(), projectID, agentID)
	if err != nil {
		http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
		return
	}
	if !member {
		http.Error(w, "Agent is not a member of the project", http.StatusForbidden)
		return
	}
	if grant {
		err = h.deps.PlatformDatabase.GrantSecretAgent(r.Context(), projectID, secretPublicID, agentID)
	} else {
		err = h.deps.PlatformDatabase.RevokeSecretAgent(r.Context(), projectID, secretPublicID, agentID)
	}
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Secret not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("change_secret_agent_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to update secret agent", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
