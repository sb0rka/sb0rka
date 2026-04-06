package projects

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
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

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
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

	var req contract.CreateProjectRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	if err := h.deps.PlatformDatabase.AssertCanCreateProject(r.Context(), userID); err != nil {
		if errors.Is(err, db.ErrUserPlanNotFound) {
			http.Error(w, "Plan not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrProjectLimitReached) {
			http.Error(w, "Project limit reached", http.StatusForbidden)
			return
		}
		h.deps.Log.Error("assert_project_quota_failed", "error", err)
		http.Error(w, "Failed to create project", http.StatusInternalServerError)
		return
	}

	project, err := h.deps.PlatformDatabase.CreateProject(r.Context(), userID, req.Name, req.Description, true)
	if err != nil {
		if errors.Is(err, db.ErrProjectAlreadyExists) {
			http.Error(w, "Project already exists", http.StatusConflict)
			return
		}
		h.deps.Log.Error("create_project_failed", "error", err)
		http.Error(w, "Failed to create project", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toProject(project))
}

func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
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
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	project, err := h.deps.PlatformDatabase.GetProject(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_failed", "error", err)
		http.Error(w, "Failed to get project", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toProject(project))
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
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

	projects, err := h.deps.PlatformDatabase.ListProjects(r.Context(), userID)
	if err != nil {
		h.deps.Log.Error("list_projects_failed", "error", err)
		http.Error(w, "Failed to list projects", http.StatusInternalServerError)
		return
	}

	out := make([]contract.ProjectResponse, 0, len(projects))
	for _, p := range projects {
		out = append(out, toProject(p))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ProjectListResponse{Projects: out})
}

func (h *Handler) UpdateProject(w http.ResponseWriter, r *http.Request) {
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
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req contract.UpdateProjectRequest
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

	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		req.Name = &trimmed
	}
	if req.Description != nil {
		trimmed := strings.TrimSpace(*req.Description)
		req.Description = &trimmed
	}

	project, err := h.deps.PlatformDatabase.UpdateProject(r.Context(), userID, projectID, req.Name, req.Description)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_project_failed", "error", err)
		http.Error(w, "Failed to update project", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toProject(project))
}

func (h *Handler) DeactivateProject(w http.ResponseWriter, r *http.Request) {
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
	projectID, err := parsePathInt64(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.deps.PlatformDatabase.DeactivateProject(r.Context(), userID, projectID); err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("deactivate_project_failed", "error", err)
		http.Error(w, "Failed to delete project", http.StatusInternalServerError)
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

func toProject(p model.Project) contract.ProjectResponse {
	var desc *string
	if p.Description != "" {
		desc = &p.Description
	}
	return contract.ProjectResponse{
		ID:          p.ID,
		UserID:      p.UserID.String(),
		Name:        p.Name,
		Description: desc,
		IsActive:    p.IsActive,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}
