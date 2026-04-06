package auth

import (
	"encoding/json"
	"errors"
	"net/http"
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

func (h *Handler) GetUserPlan(w http.ResponseWriter, r *http.Request) {
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

	plan, err := h.deps.PlatformDatabase.GetUserPlan(r.Context(), userID)
	if err != nil {
		if errors.Is(err, db.ErrUserPlanNotFound) {
			http.Error(w, "User plan not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("get_user_plan_failed", "error", err)
		http.Error(w, "Failed to get user plan", http.StatusInternalServerError)
		return
	}

	resp := contract.PlanResponse{
		ID:            plan.ID.String(),
		Name:          plan.Name,
		Description:   plan.Description,
		DBLimit:       plan.DBLimit,
		CodeLimit:     plan.CodeLimit,
		FunctionLimit: plan.FunctionLimit,
		SecretLimit:   plan.SecretLimit,
		ProjectLimit:  plan.ProjectLimit,
		GroupLimit:    plan.GroupLimit,
		CreatedAt:     plan.CreatedAt,
		UpdatedAt:     plan.UpdatedAt,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ListPublicPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.deps.PlatformDatabase.ListPublicPlans(r.Context())
	if err != nil {
		h.deps.Log.Error("list_plans_failed", "error", err)
		http.Error(w, "Failed to list plans", http.StatusInternalServerError)
		return
	}

	out := make([]contract.PlanResponse, 0, len(plans))
	for _, p := range plans {
		out = append(out, contract.PlanResponse{
			ID:            p.ID.String(),
			Name:          p.Name,
			Description:   p.Description,
			DBLimit:       p.DBLimit,
			CodeLimit:     p.CodeLimit,
			FunctionLimit: p.FunctionLimit,
			SecretLimit:   p.SecretLimit,
			ProjectLimit:  p.ProjectLimit,
			GroupLimit:    p.GroupLimit,
			CreatedAt:     p.CreatedAt,
			UpdatedAt:     p.UpdatedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"plans": out})
}
