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

func parseSubjectID(r *http.Request) (uuid.UUID, bool) {
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

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request, callerID uuid.UUID, action authz.Action, projectPublicID string) (uuid.UUID, bool) {
	decision, err := h.deps.Authorizer.Authorize(r.Context(), authz.PrincipalFromContext(r.Context(), callerID), action, authz.ResourceRef{
		Type:     "project",
		PublicID: projectPublicID,
	})
	if err != nil {
		h.deps.Log.Error("authorize_failed", "action", action, "project_public_id", projectPublicID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !decision.Allowed {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
		return uuid.Nil, false
	}
	return decision.Resource.ID, true
}

// InitializeAccount godoc
// @Summary  Инициализировать аккаунт
// @Description Назначает план аккаунта по умолчанию. Повторный вызов сохраняет существующий план; перед созданием проекта инициализация обязательна.
// @Tags     iam
// @Success  204
// @Failure  401  {string}  string
// @Failure  403  {string}  string
// @Failure  404  {string}  string
// @Failure  500  {string}  string
// @Security BearerAuth
// @Router   /account/initialize [post]
func (h *Handler) InitializeAccount(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
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

	if err := h.deps.AccountHook.BeforeInitialize(r.Context(), subjectID); err != nil {
		coretransport.WriteHookError(w, err, h.deps.Log, "account_initialize_hook_failed")
		return
	}

	if err := h.deps.PlatformDatabase.EnsureSubjectPlan(r.Context(), subjectID, h.deps.DefaultPlans.AccountCode, model.PlanKindAccount); err != nil {
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
// @Router   /account/plan [get]
func (h *Handler) GetAccountPlan(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
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

// GetPlan godoc
// @Summary  Получить тариф по ID
// @Description Авторизованному пользователю доступны публичные активные тарифы, а также тариф его аккаунта и тарифы проектов, в которых он состоит, независимо от is_public и is_available.
// @Tags     iam
// @Produce  json
// @Param    plan_id  path  string  true  "UUID тарифа" format(uuid)
// @Success  200  {object}  contract.PlanResponse
// @Failure  400  {string}  string
// @Failure  401  {string}  string
// @Failure  404  {string}  string
// @Failure  500  {string}  string
// @Security BearerAuth
// @Router   /plan/{plan_id} [get]
func (h *Handler) GetPlan(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	planID, err := uuid.Parse(strings.TrimSpace(r.PathValue("plan_id")))
	if err != nil {
		http.Error(w, "Invalid plan_id", http.StatusBadRequest)
		return
	}

	plan, err := h.deps.PlatformDatabase.GetPlan(r.Context(), planID, subjectID)
	if err != nil {
		if errors.Is(err, db.ErrPlanNotFound) {
			http.Error(w, "Plan not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_plan_failed", "plan_id", planID, "error", err)
		http.Error(w, "Failed to get plan", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toPlanResponse(plan))
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
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  200         {object}  contract.PlanResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/plan [get]
func (h *Handler) GetProjectPlan(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectPublicID, err := runtime.ParsePublicID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectRead, projectPublicID)
	if !ok {
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
// @Description Возвращает список квот проекта.
// @Tags     iam
// @Produce  json
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  200         {object}  contract.ProjectQuotaListResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/quotas [get]
func (h *Handler) GetProjectQuotas(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectPublicID, err := runtime.ParsePublicID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectRead, projectPublicID)
	if !ok {
		return
	}
	quotas, err := h.deps.QuotaHook.ListProjectQuotas(r.Context(), projectID)
	if err != nil {
		coretransport.WriteHookError(w, err, h.deps.Log, "get_project_quotas_failed", "project_id", projectID)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if quotas == nil {
		quotas = []contract.ProjectQuotaItemResponse{}
	}
	_ = json.NewEncoder(w).Encode(contract.ProjectQuotaListResponse{
		PublicID: projectPublicID,
		ID:       projectID.String(),
		Quotas:   quotas,
	})
}

// GetProjectUsage godoc
// @Summary  Получить потребление проекта
// @Tags     iam
// @Produce  json
// @Param    project_id  path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Success  200         {object}  contract.ProjectUsageResponse
// @Failure  400         {string}  string
// @Failure  403         {string}  string
// @Failure  404         {string}  string
// @Failure  500         {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/usage [get]
func (h *Handler) GetProjectUsage(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectPublicID, err := runtime.ParsePublicID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionProjectRead, projectPublicID)
	if !ok {
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
	_ = json.NewEncoder(w).Encode(contract.ProjectUsageResponse{
		PublicID: projectPublicID,
		ID:       projectID.String(),
		Usage:    usage,
	})
}

func toPlanResponse(p model.Plan) contract.PlanResponse {
	return contract.PlanResponse{
		ID:            p.ID.String(),
		NameEN:        p.NameEN,
		NameRU:        p.NameRU,
		DescriptionEN: p.DescriptionEN,
		DescriptionRU: p.DescriptionRU,
		Code:          p.Code,
		Kind:          p.Kind,
		IsPublic:      p.IsPublic,
		IsAvailable:   p.IsAvailable,
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
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
