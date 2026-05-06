package contract

import "time"

const (
	PlanKindAccount = "account"
	PlanKindProject = "project"

	QuotaScopeAccount = "account"
	QuotaScopeProject = "project"

	QuotaUnitCount = "count"
	QuotaUnitBytes = "bytes"
	QuotaUnitBps   = "bps"
)

type RefreshSessionResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int64  `json:"expires_in,omitempty"`
	ExpiresAt    string `json:"expires_at,omitempty"`
}

type PlanResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Code        string    `json:"code"`
	Kind        string    `json:"kind"`
	IsPublic    bool      `json:"is_public"`
	IsAvailable bool      `json:"is_available"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type QuotaDefinitionResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Code        string    `json:"code"`
	Scope       string    `json:"scope"`
	Unit        string    `json:"unit"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PlanQuotaResponse struct {
	PlanID            string    `json:"plan_id"`
	QuotaDefinitionID string    `json:"quota_definition_id"`
	LimitValue        int64     `json:"limit_value"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
