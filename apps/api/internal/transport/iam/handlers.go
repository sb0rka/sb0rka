package auth

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

func (h *Handler) authorizeProjectRead(w http.ResponseWriter, r *http.Request, projectID string) bool {
	subjectIDStr, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	subjectID, err := uuid.Parse(strings.TrimSpace(subjectIDStr))
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	decision, err := h.deps.Authorizer.Authorize(r.Context(), subjectID, authz.ActionProjectRead, authz.ResourceRef{
		Type: "project",
		ID:   projectID,
	})
	if err != nil {
		h.deps.Log.Error("authorize_failed", "action", authz.ActionProjectRead, "project_id", projectID, "error", err)
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

// InitializeAccount godoc
// @Summary  Инициализировать аккаунт
// @Tags     iam
// @Success  204
// @Failure  401  {string}  string
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Failure  500  {string}  string
// @Security BearerAuth
// @Router   /account/initialize [post]
func (h *Handler) InitializeAccount(w http.ResponseWriter, r *http.Request) {
	subjectIDStr, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subjectKind, ok := authctx.SubjectKindFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if strings.TrimSpace(subjectKind) != "user" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	subjectID, err := uuid.Parse(strings.TrimSpace(subjectIDStr))
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := h.deps.PlatformDatabase.EnsureSubjectPlan(r.Context(), subjectID, model.PlanCodeFreeAccount, model.PlanKindAccount); err != nil {
		h.handleInitializePlanError(w, "account", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAccountPlan godoc
// @Summary  Получить тариф аккаунта
// @Tags     iam
// @Produce  json
// @Success  200  {object}  contract.PlanResponse
// @Failure  401  {string}  string
// @Failure  404  {string}  string
// @Failure  500  {string}  string
// @Security BearerAuth
// @Router   /plan [get]
// @Router   /account/plan [get]
func (h *Handler) GetAccountPlan(w http.ResponseWriter, r *http.Request) {
	subjectIDStr, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subjectID, err := uuid.Parse(strings.TrimSpace(subjectIDStr))
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	plan, err := h.deps.PlatformDatabase.GetSubjectPlanByKind(r.Context(), subjectID, model.PlanKindAccount)
	if err != nil {
		if errors.Is(err, db.ErrSubjectPlanNotFound) {
			http.Error(w, "Account plan not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_account_plan_failed", "error", err)
		http.Error(w, "Failed to get account plan", http.StatusInternalServerError)
		return
	}

	resp := toPlanResponse(plan)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// ListPublicPlans godoc
// @Summary  Список публичных тарифов
// @Tags     iam
// @Produce  json
// @Success  200  {object}  map[string][]contract.PlanResponse  "{\"plans\": [...]}"
// @Failure  500  {string}  string
// @Router   /plans [get]
func (h *Handler) ListPublicPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.deps.PlatformDatabase.ListPublicPlans(r.Context())
	if err != nil {
		h.deps.Log.Error("list_plans_failed", "error", err)
		http.Error(w, "Failed to list plans", http.StatusInternalServerError)
		return
	}

	out := make([]contract.PlanResponse, 0, len(plans))
	for _, p := range plans {
		out = append(out, toPlanResponse(p))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"plans": out})
}

// GetProjectPlan godoc
// @Summary  Получить тариф проекта
// @Tags     iam
// @Produce  json
// @Param    project_id  path      string  true  "ID проекта"
// @Success  200         {object}  contract.PlanResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/plan [get]
func (h *Handler) GetProjectPlan(w http.ResponseWriter, r *http.Request) {
	projectID := strings.TrimSpace(r.PathValue("project_id"))
	if projectID == "" {
		http.Error(w, "project_id is required", http.StatusBadRequest)
		return
	}
	if !h.authorizeProjectRead(w, r, projectID) {
		return
	}

	plan, err := h.deps.PlatformDatabase.GetProjectPlan(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_plan_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to get project plan", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toPlanResponse(plan))
}

// GetProjectQuotas godoc
// @Summary  Получить квоты проекта
// @Tags     iam
// @Produce  json
// @Param    project_id  path      string  true  "ID проекта"
// @Success  200         {object}  contract.ProjectQuotaListResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/quotas [get]
func (h *Handler) GetProjectQuotas(w http.ResponseWriter, r *http.Request) {
	projectID := strings.TrimSpace(r.PathValue("project_id"))
	if projectID == "" {
		http.Error(w, "project_id is required", http.StatusBadRequest)
		return
	}
	if !h.authorizeProjectRead(w, r, projectID) {
		return
	}
	quotas, err := h.deps.PlatformDatabase.ListProjectQuotas(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_quotas_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to get project quotas", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	items := make([]contract.ProjectQuotaItemResponse, 0, len(quotas))
	for _, q := range quotas {
		items = append(items, contract.ProjectQuotaItemResponse{
			PlanID: q.PlanID.String(),
			QuotaDefinition: contract.QuotaDefinitionSnippet{
				ID:          q.Definition.ID.String(),
				Name:        q.Definition.Name,
				Description: q.Definition.Description,
				Code:        q.Definition.Code,
				Unit:        q.Definition.Unit,
				Scope:       q.Definition.Scope,
			},
			LimitValue: q.LimitValue,
			CreatedAt:  q.CreatedAt,
			UpdatedAt:  q.UpdatedAt,
		})
	}
	_ = json.NewEncoder(w).Encode(contract.ProjectQuotaListResponse{
		ProjectID: projectID,
		Quotas:    items,
	})
}

// GetProjectUsage godoc
// @Summary  Получить потребление проекта
// @Tags     iam
// @Produce  json
// @Param    project_id  path      string  true  "ID проекта"
// @Success  200         {object}  map[string]interface{}
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/usage [get]
func (h *Handler) GetProjectUsage(w http.ResponseWriter, r *http.Request) {
	projectID := strings.TrimSpace(r.PathValue("project_id"))
	if projectID == "" {
		http.Error(w, "project_id is required", http.StatusBadRequest)
		return
	}
	if !h.authorizeProjectRead(w, r, projectID) {
		return
	}
	usage, err := h.deps.PlatformDatabase.ListProjectUsage(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_project_usage_failed", "project_id", projectID, "error", err)
		http.Error(w, "Failed to get project usage", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"project_id": projectID, "usage": usage})
}

func toPlanResponse(p model.Plan) contract.PlanResponse {
	return contract.PlanResponse{
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description,
		Code:        p.Code,
		Kind:        p.Kind,
		IsPublic:    p.IsPublic,
		IsAvailable: p.IsAvailable,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}
func (h *Handler) handleInitializePlanError(w http.ResponseWriter, kind string, err error) {
	switch {
	case errors.Is(err, db.ErrPlanNotFound):
		http.Error(w, "Plan not found", http.StatusNotFound)
	case errors.Is(err, db.ErrPlanUnavailable):
		http.Error(w, "Plan unavailable", http.StatusForbidden)
	case errors.Is(err, db.ErrInvalidPlanKind):
		http.Error(w, "Invalid plan kind", http.StatusBadRequest)
	default:
		h.deps.Log.Error("initialize_subject_plan_failed", "kind", kind, "error", err)
		http.Error(w, "Failed to initialize account", http.StatusInternalServerError)
	}
}
