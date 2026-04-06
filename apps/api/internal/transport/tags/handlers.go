package tags

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

func (h *Handler) ListProjectTags(w http.ResponseWriter, r *http.Request) {
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
	tags, err := h.deps.PlatformDatabase.ListProjectTags(r.Context(), userID, projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_project_tags_failed", "error", err)
		http.Error(w, "Failed to list project tags", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ProjectTagListResponse{Tags: toTags(tags)})
}

func (h *Handler) ListResourceTags(w http.ResponseWriter, r *http.Request) {
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
	tags, err := h.deps.PlatformDatabase.ListResourceTags(r.Context(), userID, projectID, resourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_resource_tags_failed", "error", err)
		http.Error(w, "Failed to list resource tags", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ProjectTagListResponse{Tags: toTags(tags)})
}

func (h *Handler) AttachResourceTag(w http.ResponseWriter, r *http.Request) {
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
	var req contract.AttachResourceTagRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.TagKey = strings.TrimSpace(req.TagKey)
	req.TagValue = strings.TrimSpace(req.TagValue)
	if req.TagKey == "" || req.TagValue == "" {
		http.Error(w, "tag_key and tag_value are required", http.StatusBadRequest)
		return
	}
	tag, err := h.deps.PlatformDatabase.AttachResourceTag(r.Context(), userID, projectID, resourceID, req.TagKey, req.TagValue, req.Color, false)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("attach_resource_tag_failed", "error", err)
		http.Error(w, "Failed to attach resource tag", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(contract.TagResponse{
		ID:        tag.ID,
		ProjectID: tag.ProjectID,
		TagKey:    tag.TagKey,
		TagValue:  tag.TagValue,
		Color:     tag.Color,
		IsSystem:  tag.IsSystem,
	})
}

func (h *Handler) DeleteResourceTag(w http.ResponseWriter, r *http.Request) {
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
	tagID, err := parsePathInt64(r.PathValue("tag_id"), "tag_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.deps.PlatformDatabase.DeleteResourceTag(r.Context(), userID, projectID, resourceID, tagID); err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceTagNotFound) {
			http.Error(w, "Tag not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_resource_tag_failed", "error", err)
		http.Error(w, "Failed to delete resource tag", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

func toTags(tags []model.Tag) []contract.TagResponse {
	out := make([]contract.TagResponse, 0, len(tags))
	for _, tag := range tags {
		out = append(out, contract.TagResponse{
			ID:        tag.ID,
			ProjectID: tag.ProjectID,
			TagKey:    tag.TagKey,
			TagValue:  tag.TagValue,
			Color:     tag.Color,
			IsSystem:  tag.IsSystem,
		})
	}
	return out
}
