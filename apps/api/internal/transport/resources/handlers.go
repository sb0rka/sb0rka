package resources

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/packages/contract"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"

	"github.com/google/uuid"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func extractSubjectID(r *http.Request) (uuid.UUID, bool) {
	raw, ok := authctx.SubjectIDFromContext(r.Context())
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
	decision, err := h.deps.Authorizer.Authorize(r.Context(), authz.PrincipalFromContext(r.Context(), callerID), action, authz.ResourceRef{
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

// ListResources godoc
// @Summary  Список ресурсов проекта
// @Tags     resources
// @Produce  json
// @Param    project_id  path      string  true  "ID проекта"
// @Success  200         {object}  contract.ResourceListResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources [get]
func (h *Handler) ListResources(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := extractSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionProjectRead, projectID) {
		return
	}

	rows, err := h.deps.PlatformDatabase.ListResources(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_resources_failed", "error", err)
		http.Error(w, "Failed to list resources", http.StatusInternalServerError)
		return
	}

	out := make([]contract.ResourceListItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, toResourceListItem(row))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ResourceListResponse{
		ProjectID: projectID,
		Resources: out,
	})
}

func toResourceListItem(row model.Resource) contract.ResourceListItem {
	return contract.ResourceListItem{
		ID:        row.ID,
		Kind:      row.Kind,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
}
