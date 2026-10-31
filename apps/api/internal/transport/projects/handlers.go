package projects

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/packages/contract"
	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"

	"github.com/google/uuid"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func projectResource(publicID string) authz.ResourceRef {
	return authz.ResourceRef{Type: "project", PublicID: publicID}
}

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request, callerID uuid.UUID, action authz.Action, resource authz.ResourceRef) (uuid.UUID, bool) {
	decision, err := h.deps.Authorizer.Authorize(r.Context(), authz.PrincipalFromContext(r.Context(), callerID), action, resource)
	if err != nil {
		h.deps.Log.Error("authorize_failed",
			"action", action,
			"resource_type", resource.Type,
			"resource_public_id", resource.PublicID,
			"error", err,
		)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !decision.Allowed {
		h.deps.Log.Debug("authorize_denied",
			"caller_id", callerID,
			"action", action,
			"resource_id", decision.Resource.ID,
			"reason_code", decision.ReasonCode,
		)
		writeForbidden(w)
		return uuid.Nil, false
	}
	return decision.Resource.ID, true
}

func extractSubjectIdentity(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, bool) {
	rawID, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return uuid.Nil, "", false
	}
	rawKind, ok := authctx.SubjectKindFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return uuid.Nil, "", false
	}
	subjectID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return uuid.Nil, "", false
	}
	return subjectID, rawKind, true
}

// TODO(kompotkot): Remove after organization subjects support
func enforceUserSubject(w http.ResponseWriter, subjectKind string) bool {
	if subjectKind != "user" {
		writeForbidden(w)
		return false
	}
	return true
}

func writeForbidden(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_, _ = w.Write([]byte(`{"error":"forbidden"}`))
}

func isValidRole(role string) bool {
	switch role {
	case model.PrjMemberRoleOwner, model.PrjMemberRoleAdmin, model.PrjMemberRoleEditor, model.PrjMemberRoleViewer:
		return true
	}
	return false
}

func roleRank(role string) (int, bool) {
	switch role {
	case model.PrjMemberRoleOwner:
		return 4, true
	case model.PrjMemberRoleAdmin:
		return 3, true
	case model.PrjMemberRoleEditor:
		return 2, true
	case model.PrjMemberRoleViewer:
		return 1, true
	}
	return 0, false
}

// canAssignProjectRole reports whether callerRole may grant targetRole.
// A member may grant only strictly lower roles: owner → admin and below,
// admin → editor and below, editor → viewer.
func canAssignProjectRole(callerRole, targetRole string) bool {
	callerRank, callerOK := roleRank(callerRole)
	targetRank, targetOK := roleRank(targetRole)
	return callerOK && targetOK && targetRank < callerRank
}

func (h *Handler) getCallerProjectMember(ctx *http.Request, projectID uuid.UUID, callerID uuid.UUID) (model.ProjectMember, error) {
	return h.deps.PlatformDatabase.GetProjectMember(ctx.Context(), projectID, callerID)
}

func (h *Handler) countProjectOwners(ctx *http.Request, projectID uuid.UUID) (int, error) {
	members, err := h.deps.PlatformDatabase.ListProjectMembers(ctx.Context(), projectID)
	if err != nil {
		return 0, err
	}
	owners := 0
	for _, m := range members {
		if m.Role == model.PrjMemberRoleOwner {
			owners++
		}
	}
	return owners, nil
}

// CreateProject godoc
// @Summary  Создать проект
// @Description Требует предварительного POST /account/initialize. Проект получает план по умолчанию. owner_subject_id по умолчанию — текущий пользователь; организация допустима только для её owner, billing при этом ставится на этого owner.
// @Tags     projects
// @Accept   json
// @Produce  json
// @Param    body  body      contract.CreateProjectRequest  true  "Параметры проекта"
// @Success  201   {object}  contract.ProjectResponse
// @Failure  400   {string}  string
// @Failure  403   {string}  string
// @Failure  404   {string}  string
// @Failure  409   {string}  string
// @Security BearerAuth
// @Router   /projects [post]
func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}

	var req contract.CreateProjectRequest
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
	description, err := service.ValidateCommonDescription(&req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ownerSubjectID := subjectID
	if rawOwner := strings.TrimSpace(req.OwnerSubjectID); rawOwner != "" {
		ownerSubjectID, err = uuid.Parse(rawOwner)
		if err != nil || ownerSubjectID == uuid.Nil {
			http.Error(w, "invalid owner_subject_id", http.StatusBadRequest)
			return
		}
	}
	ownerKind, err := h.deps.PlatformDatabase.GetSubjectKind(r.Context(), ownerSubjectID)
	if err != nil {
		if errors.Is(err, db.ErrSubjectNotFound) {
			http.Error(w, "Owner subject not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_owner_subject_kind_failed", "owner_subject_id", ownerSubjectID, "error", err)
		http.Error(w, "Failed to create project", http.StatusInternalServerError)
		return
	}

	billingSubjectID, ok := h.resolveProjectBilling(w, r, subjectID, ownerSubjectID, ownerKind)
	if !ok {
		return
	}
	if _, err := h.deps.PlatformDatabase.GetSubjectPlanByKind(r.Context(), billingSubjectID, model.PlanKindAccount); err != nil {
		if errors.Is(err, db.ErrSubjectPlanNotFound) {
			http.Error(w, "Subject plan not found", http.StatusNotFound)
		} else {
			h.deps.Log.Error("get_account_plan_failed", "error", err)
			http.Error(w, "Failed to create project", http.StatusInternalServerError)
		}
		return
	}

	planID, err := h.deps.PlatformDatabase.ResolvePlanID(r.Context(), h.deps.DefaultPlans.ProjectCode, model.PlanKindProject)
	if err != nil {
		switch {
		case errors.Is(err, db.ErrPlanNotFound):
			http.Error(w, "Plan not found", http.StatusNotFound)
		case errors.Is(err, db.ErrPlanUnavailable):
			http.Error(w, "Plan unavailable", http.StatusForbidden)
		case errors.Is(err, db.ErrInvalidPlanKind):
			http.Error(w, "Invalid plan kind", http.StatusBadRequest)
		default:
			h.deps.Log.Error("resolve_project_plan_failed", "error", err)
			http.Error(w, "Failed to create project", http.StatusInternalServerError)
		}
		return
	}
	if err := h.deps.QuotaHook.BeforeCreateProject(r.Context(), billingSubjectID); err != nil {
		coretransport.WriteHookError(w, err, h.deps.Log, "assert_project_quota_failed")
		return
	}

	project, err := h.deps.PlatformDatabase.CreateProject(r.Context(), ownerSubjectID, billingSubjectID, planID, name, description)
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

func (h *Handler) resolveProjectBilling(
	w http.ResponseWriter,
	r *http.Request,
	callerID uuid.UUID,
	ownerSubjectID uuid.UUID,
	ownerKind string,
) (uuid.UUID, bool) {
	switch ownerKind {
	case "user":
		if ownerSubjectID != callerID {
			writeForbidden(w)
			return uuid.Nil, false
		}
		return callerID, true
	case "organization":
		billingSubjectID, err := h.deps.MembershipHook.ResolveOrganizationBilling(r.Context(), callerID, ownerSubjectID)
		if err != nil {
			coretransport.WriteHookError(w, err, h.deps.Log, "resolve_organization_billing_failed")
			return uuid.Nil, false
		}
		if billingSubjectID == uuid.Nil {
			http.Error(w, "Organization owner not found", http.StatusNotFound)
			return uuid.Nil, false
		}
		return billingSubjectID, true
	default:
		http.Error(w, "invalid owner subject kind", http.StatusBadRequest)
		return uuid.Nil, false
	}
}

// GetProject godoc
// @Summary  Получить проект
// @Tags     projects
// @Produce  json
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  200         {object}  contract.ProjectResponse
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id} [get]
func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectRead, projectResource(projectPublicID))
	if !ok {
		return
	}

	project, err := h.deps.PlatformDatabase.GetProject(r.Context(), projectID)
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

// ListProjects godoc
// @Summary  Список проектов пользователя
// @Tags     projects
// @Produce  json
// @Success  200  {object}  contract.ProjectListResponse
// @Security BearerAuth
// @Router   /projects [get]
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}

	projects, err := h.deps.PlatformDatabase.ListProjectsBySubject(r.Context(), subjectID)
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

// UpdateProject godoc
// @Summary  Обновить метаданные проекта
// @Tags     projects
// @Accept   json
// @Produce  json
// @Param    project_id  path      string                         true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    body        body      contract.UpdateProjectRequest  true  "Новые имя/описание"
// @Success  200         {object}  contract.ProjectResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  409         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id} [patch]
func (h *Handler) UpdateProject(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectUpdateMeta, projectResource(projectPublicID))
	if !ok {
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

	project, err := h.deps.PlatformDatabase.UpdateProject(r.Context(), projectID, name, description)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrProjectAlreadyExists) {
			http.Error(w, "Project with this name already exists", http.StatusConflict)
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

// DeleteProject godoc
// @Summary  Удалить проект
// @Description Проект можно удалить только если в нём нет баз данных.
// @Tags     projects
// @Param    project_id  path  string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  204  "No Content"
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id} [delete]
func (h *Handler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectDelete, projectResource(projectPublicID))
	if !ok {
		return
	}

	dbs, err := h.deps.PlatformDatabase.ListDatabases(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("list_databases_failed", "error", err)
		http.Error(w, "Failed to list databases", http.StatusInternalServerError)
		return
	}
	if len(dbs) > 0 {
		http.Error(w, "Project contains databases. Delete all databases first", http.StatusForbidden)
		return
	}

	if err := h.deps.PlatformDatabase.DeleteProject(r.Context(), projectID); err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("delete_project_failed", "error", err)
		http.Error(w, "Failed to delete project", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListProjectMembers godoc
// @Summary  Список участников проекта
// @Tags     project-members
// @Produce  json
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  200         {object}  contract.ProjectMemberListResponse
// @Failure  403         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/members [get]
func (h *Handler) ListProjectMembers(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectMemberList, projectResource(projectPublicID))
	if !ok {
		return
	}

	members, err := h.deps.PlatformDatabase.ListProjectMembers(r.Context(), projectID)
	if err != nil {
		h.deps.Log.Error("list_project_members_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to list members", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	items := make([]contract.ProjectMemberItemResponse, 0, len(members))
	for _, m := range members {
		items = append(items, toProjectMemberItem(m))
	}
	_ = json.NewEncoder(w).Encode(contract.ProjectMemberListResponse{ProjectID: projectID.String(), Members: items})
}

// GetProjectMember godoc
// @Summary  Получить участника проекта
// @Tags     project-members
// @Produce  json
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    subject_id  path      string  true  "UUID участника" format(uuid)
// @Success  200         {object}  contract.ProjectMemberResponse
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/members/{subject_id} [get]
func (h *Handler) GetProjectMember(w http.ResponseWriter, r *http.Request) {
	subjectID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectMemberRead, projectResource(projectPublicID))
	if !ok {
		return
	}

	targetSubjectID, err := uuid.Parse(strings.TrimSpace(r.PathValue("subject_id")))
	if err != nil {
		http.Error(w, "invalid subject_id", http.StatusBadRequest)
		return
	}
	member, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, targetSubjectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_member_failed", "project_id", projectID, "subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to get member", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toProjectMember(member))
}

// AddProjectMember godoc
// @Summary  Добавить участника проекта
// @Tags     project-members
// @Accept   json
// @Produce  json
// @Param    project_id  path      string                                true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    body        body      contract.CreateProjectMemberRequest   true  "Subject и роль"
// @Success  201         {object}  contract.ProjectMemberResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  409         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/members [post]
func (h *Handler) AddProjectMember(w http.ResponseWriter, r *http.Request) {
	callerID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, callerID, authz.ActionProjectMemberAdd, projectResource(projectPublicID))
	if !ok {
		return
	}

	callerMember, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, callerID)
	if err != nil {
		h.deps.Log.Error("get_caller_project_member_failed", "project_id", projectID, "caller_id", callerID, "error", err)
		http.Error(w, "Failed to add member", http.StatusInternalServerError)
		return
	}

	var req contract.CreateProjectMemberRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	targetSubjectID, err := uuid.Parse(strings.TrimSpace(req.SubjectID))
	if err != nil {
		http.Error(w, "invalid subject_id", http.StatusBadRequest)
		return
	}
	role := strings.TrimSpace(req.Role)
	if !isValidRole(role) {
		http.Error(w, "invalid role", http.StatusBadRequest)
		return
	}
	if !canAssignProjectRole(callerMember.Role, role) {
		writeForbidden(w)
		return
	}

	project, err := h.deps.PlatformDatabase.GetProject(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to add member", http.StatusInternalServerError)
		return
	}
	targetKind, err := h.deps.PlatformDatabase.GetSubjectKind(r.Context(), targetSubjectID)
	if err != nil {
		if errors.Is(err, db.ErrSubjectNotFound) {
			http.Error(w, "Subject not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_target_subject_kind_failed", "target_subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to add member", http.StatusInternalServerError)
		return
	}
	if err := h.deps.MembershipHook.BeforeAddProjectMember(
		r.Context(),
		project.ID,
		project.OwnerSubjectID,
		targetSubjectID,
		targetKind,
	); err != nil {
		coretransport.WriteHookError(w, err, h.deps.Log, "assert_project_membership_failed")
		return
	}

	member, err := h.deps.PlatformDatabase.AddProjectMember(r.Context(), projectID, targetSubjectID, role)
	if err != nil {
		switch {
		case errors.Is(err, db.ErrProjectMemberExists):
			http.Error(w, "Member already exists", http.StatusConflict)
		case errors.Is(err, db.ErrSubjectNotFound):
			http.Error(w, "Subject not found", http.StatusNotFound)
		case errors.Is(err, db.ErrSubjectKindMismatch):
			http.Error(w, "Subject kind is not allowed as a project member", http.StatusBadRequest)
		default:
			h.deps.Log.Error("add_project_member_failed", "project_id", projectID, "target_subject_id", targetSubjectID, "error", err)
			http.Error(w, "Failed to add member", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toProjectMember(member))
}

// UpdateProjectMemberRole godoc
// @Summary  Изменить роль участника
// @Tags     project-members
// @Accept   json
// @Produce  json
// @Param    project_id  path      string                                   true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    subject_id  path      string                                   true  "UUID участника" format(uuid)
// @Param    body        body      contract.UpdateProjectMemberRoleRequest  true  "Новая роль"
// @Success  200         {object}  contract.ProjectMemberResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  409         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/members/{subject_id} [patch]
func (h *Handler) UpdateProjectMemberRole(w http.ResponseWriter, r *http.Request) {
	callerID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, callerID, authz.ActionProjectMemberUpdate, projectResource(projectPublicID))
	if !ok {
		return
	}
	targetSubjectID, err := uuid.Parse(strings.TrimSpace(r.PathValue("subject_id")))
	if err != nil {
		http.Error(w, "invalid subject_id", http.StatusBadRequest)
		return
	}

	var req contract.UpdateProjectMemberRoleRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	newRole := strings.TrimSpace(req.Role)
	if !isValidRole(newRole) {
		http.Error(w, "invalid role", http.StatusBadRequest)
		return
	}

	callerMember, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, callerID)
	if err != nil {
		h.deps.Log.Error("get_caller_project_member_failed", "project_id", projectID, "caller_id", callerID, "error", err)
		http.Error(w, "Failed to update role", http.StatusInternalServerError)
		return
	}
	targetMember, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, targetSubjectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_target_project_member_failed", "project_id", projectID, "target_subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to update role", http.StatusInternalServerError)
		return
	}

	targetRank, ok := roleRank(targetMember.Role)
	if !ok {
		h.deps.Log.Error("invalid_target_project_member_role", "project_id", projectID, "target_subject_id", targetSubjectID, "role", targetMember.Role)
		http.Error(w, "Failed to update role", http.StatusInternalServerError)
		return
	}
	callerRank, callerOK := roleRank(callerMember.Role)
	if !callerOK || targetRank >= callerRank || !canAssignProjectRole(callerMember.Role, newRole) {
		writeForbidden(w)
		return
	}

	member, err := h.deps.PlatformDatabase.UpdateProjectMemberRole(r.Context(), projectID, targetSubjectID, newRole)
	if err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrLastOwner) {
			http.Error(w, "Cannot demote the last owner", http.StatusConflict)
			return
		}
		h.deps.Log.Error("update_project_member_role_failed", "project_id", projectID, "target_subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to update role", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toProjectMember(member))
}

// RemoveProjectMember godoc
// @Summary  Удалить участника проекта
// @Tags     project-members
// @Param    project_id  path  string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    subject_id  path  string  true  "UUID участника" format(uuid)
// @Success  204  "No Content"
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Failure  409  {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/members/{subject_id} [delete]
func (h *Handler) RemoveProjectMember(w http.ResponseWriter, r *http.Request) {
	callerID, subjectKind, ok := extractSubjectIdentity(w, r)
	if !ok {
		return
	}
	if !enforceUserSubject(w, subjectKind) {
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, callerID, authz.ActionProjectMemberRemove, projectResource(projectPublicID))
	if !ok {
		return
	}
	targetSubjectID, err := uuid.Parse(strings.TrimSpace(r.PathValue("subject_id")))
	if err != nil {
		http.Error(w, "invalid subject_id", http.StatusBadRequest)
		return
	}

	callerMember, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, callerID)
	if err != nil {
		h.deps.Log.Error("get_caller_project_member_failed", "project_id", projectID, "caller_id", callerID, "error", err)
		http.Error(w, "Failed to remove member", http.StatusInternalServerError)
		return
	}
	targetMember, err := h.deps.PlatformDatabase.GetProjectMember(r.Context(), projectID, targetSubjectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_target_project_member_failed", "project_id", projectID, "target_subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to remove member", http.StatusInternalServerError)
		return
	}

	if targetMember.Role == model.PrjMemberRoleOwner && callerMember.Role != model.PrjMemberRoleOwner {
		writeForbidden(w)
		return
	}
	if targetMember.Role == model.PrjMemberRoleOwner {
		owners, err := h.countProjectOwners(r, projectID)
		if err != nil {
			h.deps.Log.Error("count_project_owners_failed", "project_id", projectID, "error", err)
			http.Error(w, "Failed to remove member", http.StatusInternalServerError)
			return
		}
		if owners <= 1 {
			http.Error(w, "Cannot remove the last owner", http.StatusConflict)
			return
		}
	}

	if err := h.deps.PlatformDatabase.RemoveProjectMember(r.Context(), projectID, targetSubjectID); err != nil {
		if errors.Is(err, db.ErrProjectMemberNotFound) {
			http.Error(w, "Member not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, db.ErrLastOwner) {
			http.Error(w, "Cannot remove the last owner", http.StatusConflict)
			return
		}
		h.deps.Log.Error("remove_project_member_failed", "project_id", projectID, "target_subject_id", targetSubjectID, "error", err)
		http.Error(w, "Failed to remove member", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parsePathID(raw, name string) (string, error) {
	return runtime.ParsePublicID(raw, name)
}

func toProject(p model.Project) contract.ProjectResponse {
	return contract.ProjectResponse{
		PublicID:         p.PublicID,
		ID:               p.ID.String(),
		OwnerSubjectID:   p.OwnerSubjectID.String(),
		BillingSubjectID: p.BillingSubjectID.String(),
		PlanID:           p.PlanID.String(),
		Name:             p.Name,
		Description:      p.Description,
		IsActive:         p.IsActive,
		CreatedAt:        p.CreatedAt,
		UpdatedAt:        p.UpdatedAt,
	}
}

func toProjectMember(m model.ProjectMember) contract.ProjectMemberResponse {
	return contract.ProjectMemberResponse{
		ProjectID: m.ProjectID.String(),
		SubjectID: m.SubjectID.String(),
		Role:      m.Role,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}

func toProjectMemberItem(m model.ProjectMember) contract.ProjectMemberItemResponse {
	return contract.ProjectMemberItemResponse{
		SubjectID: m.SubjectID.String(),
		Role:      m.Role,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}
