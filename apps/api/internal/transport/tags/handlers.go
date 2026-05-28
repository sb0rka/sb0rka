package tags

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

func parsePathInt64(raw, name string) (int64, error) {
	if raw == "" {
		return 0, errors.New(name + " is required")
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, errors.New(name + " must be a valid integer")
	}
	if id == 0 {
		return 0, errors.New(name + " is required")
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

func (h *Handler) ListProjectTags(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionTagList, projectID) {
		return
	}

	tags, err := h.deps.PlatformDatabase.ListProjectTags(r.Context(), projectID)
	if err != nil {
		h.deps.Log.Error("list_project_tags_failed", "error", err)
		http.Error(w, "Failed to list project tags", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(contract.ProjectTagListResponse{
		ProjectID: projectID,
		Tags:      toTagListEntries(tags),
	})
}

func (h *Handler) ListResourceTags(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionTagList, projectID) {
		return
	}

	tags, err := h.deps.PlatformDatabase.ListResourceTags(r.Context(), projectID, resourceID)
	if err != nil {
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
	_ = json.NewEncoder(w).Encode(contract.ResourceTagListResponse{
		ProjectID:  projectID,
		ResourceID: resourceID,
		Tags:       toTagListEntries(tags),
	})
}

func (h *Handler) AttachResourceTag(w http.ResponseWriter, r *http.Request) {
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
	if !h.authorize(w, r, subjectID, authz.ActionResourceTagAttach, projectID) {
		return
	}
	var req contract.AttachResourceTagRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	tagKey, err := service.ValidateTagKey(req.TagKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tagValue, err := service.ValidateTagValue(req.TagValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tagColor, err := service.ValidateTagColor(req.Color)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tag, err := h.deps.PlatformDatabase.AttachResourceTag(r.Context(), projectID, resourceID, tagKey, tagValue, tagColor)
	if err != nil {
		if errors.Is(err, db.ErrResourceNotFound) {
			http.Error(w, "Resource not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceTagImmutable) {
			http.Error(w, "Cannot attach immutable tag", http.StatusForbidden)
			return
		}
		h.deps.Log.Error("attach_resource_tag_failed", "error", err)
		http.Error(w, "Failed to attach resource tag", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toTagResponse(tag))
}

func (h *Handler) DetachResourceTag(w http.ResponseWriter, r *http.Request) {
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
	tagID, err := parsePathInt64(r.PathValue("tag_id"), "tag_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.authorize(w, r, subjectID, authz.ActionResourceTagDetach, projectID) {
		return
	}

	if err := h.deps.PlatformDatabase.DetachResourceTag(r.Context(), projectID, resourceID, tagID); err != nil {
		if errors.Is(err, db.ErrResourceTagNotFound) {
			http.Error(w, "Tag not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrResourceTagImmutable) {
			http.Error(w, "Cannot detach immutable tag", http.StatusForbidden)
			return
		}
		h.deps.Log.Error("delete_resource_tag_failed", "error", err)
		http.Error(w, "Failed to delete resource tag", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func toTagResponse(tag model.Tag) contract.TagResponse {
	return contract.TagResponse{
		ID:         tag.ID,
		ProjectID:  tag.ProjectID,
		TagKey:     tag.TagKey,
		TagValue:   tag.TagValue,
		Color:      tag.Color,
		IsSystem:   tag.IsSystem,
		IsReadonly: tag.IsReadonly,
	}
}

func toTagListEntries(tags []model.Tag) []contract.TagListEntry {
	out := make([]contract.TagListEntry, 0, len(tags))
	for _, tag := range tags {
		out = append(out, toTagListEntry(tag))
	}
	return out
}

func toTagListEntry(tag model.Tag) contract.TagListEntry {
	return contract.TagListEntry{
		ID:         tag.ID,
		TagKey:     tag.TagKey,
		TagValue:   tag.TagValue,
		Color:      tag.Color,
		IsSystem:   tag.IsSystem,
		IsReadonly: tag.IsReadonly,
	}
}
