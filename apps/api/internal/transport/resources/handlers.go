package resources

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

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

func (h *Handler) ListResources(w http.ResponseWriter, r *http.Request) {
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

	rows, err := h.deps.PlatformDatabase.ListResources(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_resources_failed", "error", err)
		http.Error(w, "Failed to list resources", http.StatusInternalServerError)
		return
	}

	out := make([]contract.ResourceResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, contract.ResourceResponse{
			ID:           row.ID,
			ProjectID:    row.ProjectID,
			IsActive:     row.IsActive,
			ResourceType: row.ResourceType,
			CreatedAt:    row.CreatedAt,
			UpdatedAt:    row.UpdatedAt,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ResourceListResponse{Resources: out})
}

func (h *Handler) GetResource(w http.ResponseWriter, r *http.Request) {
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
	resourceID, err := parsePathInt64(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	row, err := h.deps.PlatformDatabase.GetResource(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_resource_failed", "error", err)
		http.Error(w, "Failed to get resource", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ResourceResponse{
		ID:           row.ID,
		ProjectID:    row.ProjectID,
		IsActive:     row.IsActive,
		ResourceType: row.ResourceType,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	})
}

func (h *Handler) DeactivateResource(w http.ResponseWriter, r *http.Request) {
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
	resourceID, err := parsePathInt64(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	row, err := h.deps.PlatformDatabase.DeactivateResource(r.Context(), userID, projectID, resourceID)
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ResourceResponse{
		ID:           row.ID,
		ProjectID:    row.ProjectID,
		IsActive:     row.IsActive,
		ResourceType: row.ResourceType,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	})
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
