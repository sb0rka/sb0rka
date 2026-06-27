package organizations

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/authz"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/packages/contract"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

// orgResource constructs a ResourceRef for an organization.
func orgResource(id uuid.UUID) authz.ResourceRef {
	return authz.ResourceRef{Type: "organization", ID: id}
}

// authorize checks the caller's permission and writes a 403 or 500 on failure.
// Returns false if the handler should stop processing the request.
func (h *Handler) authorize(w http.ResponseWriter, r *http.Request, callerID uuid.UUID, action authz.Action, resource authz.ResourceRef) bool {
	decision, err := h.deps.Authorizer.Authorize(r.Context(), callerID, action, resource)
	if err != nil {
		h.deps.Log.Error("authorize_failed",
			"action", action,
			"resource_type", resource.Type,
			"resource_id", resource.ID,
			"error", err,
		)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if !decision.Allowed {
		h.deps.Log.Debug("authorize_denied",
			"caller_id", callerID,
			"action", action,
			"resource_id", resource.ID,
			"reason_code", decision.ReasonCode,
		)
		writeForbidden(w)
		return false
	}
	return true
}

// extractCallerID extracts and parses the authenticated user's UUID from context.
// Returns false and writes an error response on failure.
func extractCallerID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		writeForbidden(w)
		return uuid.UUID{}, false
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return uuid.UUID{}, false
	}
	return id, true
}

// writeForbidden writes a JSON 403 response. Internal reason details must not
// be included — they are only logged by the authorize helper.
func writeForbidden(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_, _ = w.Write([]byte(`{"error":"forbidden"}`))
}

// isValidRole reports whether role is a known member role value.
// This is input validation only — authorization logic lives in the Authorizer.
func isValidRole(role string) bool {
	switch role {
	case model.OrgMemberRoleOwner, model.OrgMemberRoleAdmin,
		model.OrgMemberRoleEditor, model.OrgMemberRoleViewer:
		return true
	}
	return false
}

// isAssignableRole reports whether role may be assigned via membership APIs.
// Owner is reserved for system-controlled flows (e.g. org creation / transfers).
func isAssignableRole(role string) bool {
	switch role {
	case model.OrgMemberRoleAdmin, model.OrgMemberRoleEditor, model.OrgMemberRoleViewer:
		return true
	}
	return false
}

func roleRank(role string) (int, bool) {
	switch role {
	case model.OrgMemberRoleOwner:
		return 4, true
	case model.OrgMemberRoleAdmin:
		return 3, true
	case model.OrgMemberRoleEditor:
		return 2, true
	case model.OrgMemberRoleViewer:
		return 1, true
	}
	return 0, false
}

// errLastOwner is returned by assertNotLastOwner when the org has only one owner.
var errLastOwner = errors.New("last owner")

// assertNotLastOwner returns errLastOwner if the organization has exactly one
// owner. Use before any operation that would remove or demote an owner.
func (h *Handler) assertNotLastOwner(ctx context.Context, orgID, callerID uuid.UUID) error {
	members, err := h.deps.Database.ListOrganizationMembers(ctx, orgID, callerID)
	if err != nil {
		return err
	}
	ownerCount := 0
	for _, m := range members {
		if m.Role == model.OrgMemberRoleOwner {
			ownerCount++
		}
	}
	if ownerCount <= 1 {
		return errLastOwner
	}
	return nil
}

func (h *Handler) CreateOrganization(w http.ResponseWriter, r *http.Request) {
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}

	var req contract.OrganizationCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}
	name := req.Name
	description := req.Description

	orgID := uuid.New()
	org, err := h.deps.Database.CreateOrganization(r.Context(), orgID, name, description, cID)
	if err != nil {
		h.deps.Log.Error("create_organization_failed", "caller_id", cID, "error", err)
		http.Error(w, "Failed to create organization", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ToOrganizationResponse(org))
}

func (h *Handler) GetOrganization(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationRead, orgResource(orgID)) {
		return
	}

	org, err := h.deps.Database.GetOrganization(r.Context(), orgID, cID)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationNotFound) {
			http.Error(w, "Organization not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_organization_failed", "org_id", orgID, "error", err)
		http.Error(w, "Failed to get organization", http.StatusInternalServerError)
		return
	}

	members, err := h.deps.Database.ListOrganizationMembers(r.Context(), orgID, cID)
	if err != nil {
		h.deps.Log.Error("get_organization_members_failed", "org_id", orgID, "error", err)
		http.Error(w, "Failed to get organization members", http.StatusInternalServerError)
		return
	}

	out := ToOrganizationResponse(org)
	out.Members = make([]contract.OrganizationMemberResponse, 0, len(members))
	for _, m := range members {
		out.Members = append(out.Members, ToOrganizationMemberResponse(m))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (h *Handler) UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationUpdate, orgResource(orgID)) {
		return
	}

	var req contract.OrganizationUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	org, err := h.deps.Database.UpdateOrganization(r.Context(), orgID, cID, req.Name, req.Description)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationNotFound) {
			http.Error(w, "Organization not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_organization_failed", "org_id", orgID, "error", err)
		http.Error(w, "Failed to update organization", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToOrganizationResponse(org))
}

func (h *Handler) DeleteOrganization(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationDelete, orgResource(orgID)) {
		return
	}

	if err := h.deps.Database.DeleteOrganization(r.Context(), orgID, cID); err != nil {
		if errors.Is(err, db.ErrOrganizationNotFound) {
			http.Error(w, "Organization not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_organization_failed", "org_id", orgID, "error", err)
		http.Error(w, "Failed to delete organization", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationMemberList, orgResource(orgID)) {
		return
	}

	members, err := h.deps.Database.ListOrganizationMembers(r.Context(), orgID, cID)
	if err != nil {
		h.deps.Log.Error("list_members_failed", "org_id", orgID, "error", err)
		http.Error(w, "Failed to list members", http.StatusInternalServerError)
		return
	}

	out := contract.OrganizationMemberListResponse{
		ID:      orgID.String(),
		Members: make([]contract.OrganizationMemberResponse, 0, len(members))}
	for _, m := range members {
		out.Members = append(out.Members, ToOrganizationMemberResponse(m))
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationMemberAdd, orgResource(orgID)) {
		return
	}

	var req contract.OrganizationMemberCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !isValidRole(req.Role) {
		http.Error(w, "Invalid role", http.StatusBadRequest)
		return
	}
	if !isAssignableRole(req.Role) {
		http.Error(w, "Role cannot be assigned", http.StatusBadRequest)
		return
	}
	targetUserID, err := uuid.Parse(req.UserID)
	if err != nil {
		http.Error(w, "Invalid user_id", http.StatusBadRequest)
		return
	}

	// Privilege escalation guard: callers may only assign roles at or below their own.
	callerMember, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, cID, cID)
	if err != nil {
		h.deps.Log.Error("get_caller_membership_failed", "org_id", orgID, "caller_id", cID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	callerRank, ok := roleRank(callerMember.Role)
	if !ok {
		writeForbidden(w)
		return
	}
	requestedRank, _ := roleRank(req.Role)
	if requestedRank > callerRank {
		writeForbidden(w)
		return
	}

	member, err := h.deps.Database.AddOrganizationMember(r.Context(), orgID, targetUserID, cID, req.Role)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberAlreadyExists) {
			http.Error(w, "User is already a member", http.StatusConflict)
			return
		}
		h.deps.Log.Error("add_member_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Failed to add member", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ToOrganizationMemberResponse(member))
}

func (h *Handler) GetMember(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	targetUserID, ok := parseUserID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationMemberRead, orgResource(orgID)) {
		return
	}

	member, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, targetUserID, cID)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_member_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Failed to get member", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToOrganizationMemberResponse(member))
}

func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	targetUserID, ok := parseUserID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationMemberUpdate, orgResource(orgID)) {
		return
	}

	var req contract.OrganizationMemberUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !isValidRole(req.Role) {
		http.Error(w, "Invalid role", http.StatusBadRequest)
		return
	}
	if req.Role == model.OrgMemberRoleOwner {
		http.Error(w, "Role cannot be assigned", http.StatusBadRequest)
		return
	}

	// Fetch target's current membership to apply invariant checks.
	targetMember, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, targetUserID, cID)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_target_membership_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Privilege escalation guard: callers may only update roles at or below their own.
	callerMember, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, cID, cID)
	if err != nil {
		h.deps.Log.Error("get_caller_membership_failed", "org_id", orgID, "caller_id", cID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	callerRank, ok := roleRank(callerMember.Role)
	if !ok {
		writeForbidden(w)
		return
	}
	targetRank, ok := roleRank(targetMember.Role)
	if !ok {
		h.deps.Log.Error("invalid_target_member_role", "org_id", orgID, "user_id", targetUserID, "role", targetMember.Role)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	requestedRank, _ := roleRank(req.Role)
	if targetRank > callerRank || requestedRank > callerRank {
		writeForbidden(w)
		return
	}

	// Last-owner guard: prevent demoting the last owner.
	if targetMember.Role == model.OrgMemberRoleOwner && req.Role != model.OrgMemberRoleOwner {
		if err := h.assertNotLastOwner(r.Context(), orgID, cID); err != nil {
			if errors.Is(err, errLastOwner) {
				http.Error(w, "Cannot demote the last owner", http.StatusUnprocessableEntity)
				return
			}
			h.deps.Log.Error("last_owner_check_failed", "org_id", orgID, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	member, err := h.deps.Database.UpdateOrganizationMemberRole(r.Context(), orgID, targetUserID, cID, req.Role)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("update_member_role_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Failed to update member role", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToOrganizationMemberResponse(member))
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	orgID, ok := parseOrgID(w, r)
	if !ok {
		return
	}
	targetUserID, ok := parseUserID(w, r)
	if !ok {
		return
	}
	cID, ok := extractCallerID(w, r)
	if !ok {
		return
	}
	if !h.authorize(w, r, cID, authz.ActionOrganizationMemberRemove, orgResource(orgID)) {
		return
	}

	// Fetch target's current membership to apply invariant checks.
	targetMember, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, targetUserID, cID)
	if err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_target_membership_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Owners can only be removed by other owners, and only when at least one other owner exists.
	if targetMember.Role == model.OrgMemberRoleOwner {
		callerMember, err := h.deps.Database.GetOrganizationMember(r.Context(), orgID, cID, cID)
		if err != nil {
			h.deps.Log.Error("get_caller_membership_failed", "org_id", orgID, "caller_id", cID, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if callerMember.Role != model.OrgMemberRoleOwner {
			writeForbidden(w)
			return
		}
		if err := h.assertNotLastOwner(r.Context(), orgID, cID); err != nil {
			if errors.Is(err, errLastOwner) {
				http.Error(w, "Cannot remove the last owner", http.StatusUnprocessableEntity)
				return
			}
			h.deps.Log.Error("last_owner_check_failed", "org_id", orgID, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	if err := h.deps.Database.RemoveOrganizationMember(r.Context(), orgID, targetUserID, cID); err != nil {
		if errors.Is(err, db.ErrOrganizationMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("remove_member_failed", "org_id", orgID, "user_id", targetUserID, "error", err)
		http.Error(w, "Failed to remove member", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func parseOrgID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := r.PathValue("organization_id")
	if raw == "" {
		http.Error(w, "Missing organization_id", http.StatusBadRequest)
		return uuid.UUID{}, false
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, "Invalid organization_id", http.StatusBadRequest)
		return uuid.UUID{}, false
	}
	return id, true
}

func parseUserID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := r.PathValue("user_id")
	if raw == "" {
		http.Error(w, "Missing user_id", http.StatusBadRequest)
		return uuid.UUID{}, false
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, "Invalid user_id", http.StatusBadRequest)
		return uuid.UUID{}, false
	}
	return id, true
}

func ToOrganizationResponse(o model.Organization) contract.OrganizationResponse {
	return contract.OrganizationResponse{
		ID:          o.ID.String(),
		Name:        o.Name,
		Description: o.Description,
		CreatedAt:   o.CreatedAt,
		UpdatedAt:   o.UpdatedAt,
	}
}

func ToOrganizationMemberResponse(m model.OrganizationMember) contract.OrganizationMemberResponse {
	return contract.OrganizationMemberResponse{
		UserID:    m.UserID.String(),
		Role:      m.Role,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}
