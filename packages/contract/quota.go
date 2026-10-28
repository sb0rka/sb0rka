package contract

import "time"

const (
	PlanKindAccount = "account"
	PlanKindProject = "project"

	QuotaScopeAccount = "account"
	QuotaScopeProject = "project"

	QuotaKindSnapshot = "snapshot"
	QuotaKindPeriodic = "periodic"
	QuotaKindBalance  = "balance"

	QuotaUnitCount  = "count"
	QuotaUnitBytes  = "bytes"
	QuotaUnitBps    = "bps"
	QuotaUnitMicros = "micros"

	QuotaWindowMinute = "minute"
	QuotaWindowHour   = "hour"
	QuotaWindowMonth  = "month"
)

type PlanResponse struct {
	ID            string    `json:"id"`
	NameEN        string    `json:"name_en"`
	NameRU        string    `json:"name_ru"`
	DescriptionEN *string   `json:"description_en,omitempty"`
	DescriptionRU *string   `json:"description_ru,omitempty"`
	Code          string    `json:"code"`
	Kind          string    `json:"kind"`
	IsPublic      bool      `json:"is_public"`
	IsAvailable   bool      `json:"is_available"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type QuotaDefinitionResponse struct {
	ID            string    `json:"id"`
	NameEN        string    `json:"name_en"`
	NameRU        string    `json:"name_ru"`
	DescriptionEN *string   `json:"description_en,omitempty"`
	DescriptionRU *string   `json:"description_ru,omitempty"`
	Code          string    `json:"code"`
	Scope         string    `json:"scope"`
	Kind          string    `json:"kind" enums:"snapshot,periodic,balance"`
	Unit          string    `json:"unit"`
	Window        *string   `json:"window"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type QuotaDefinitionSnippet struct {
	ID            string  `json:"id"`
	NameEN        string  `json:"name_en"`
	NameRU        string  `json:"name_ru"`
	DescriptionEN *string `json:"description_en,omitempty"`
	DescriptionRU *string `json:"description_ru,omitempty"`
	Code          string  `json:"code"`
	Unit          string  `json:"unit"`
	Scope         string  `json:"scope"`
	Kind          string  `json:"kind" enums:"snapshot,periodic,balance"`
	Window        *string `json:"window"`
}

type ProjectQuotaItemResponse struct {
	PlanID          string                 `json:"plan_id"`
	QuotaDefinition QuotaDefinitionSnippet `json:"quota_definition"`
	LimitValue      int64                  `json:"limit_value"`
	CreatedAt       time.Time              `json:"created_at"`
}

type ProjectQuotaListResponse struct {
	PublicID string                     `json:"public_id"`
	ID       string                     `json:"id" format:"uuid"`
	Quotas   []ProjectQuotaItemResponse `json:"quotas"`
}

type ProjectUsageResponse struct {
	PublicID string           `json:"public_id"`
	ID       string           `json:"id" format:"uuid"`
	Usage    map[string]int64 `json:"usage"`
}
