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

	UsageStatusAvailable   = "available"
	UsageStatusUnavailable = "unavailable"
	UsageStatusUnsupported = "unsupported"
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
	ID       string                        `json:"id" format:"uuid"`
	PublicID string                        `json:"public_id"`
	Usage    map[string]QuotaUsageResponse `json:"usage"`
}

type BalanceResponse map[string]QuotaBalanceResponse

type QuotaBalanceResponse struct {
	Limit     int64 `json:"limit" format:"int64"`
	Entitled  int64 `json:"entitled" format:"int64"`
	Used      int64 `json:"used" format:"int64"`
	Held      int64 `json:"held" format:"int64"`
	Available int64 `json:"available" format:"int64"`
}

type QuotaUsageResponse struct {
	Used        *int64                   `json:"used" format:"int64" extensions:"x-nullable"`
	Status      string                   `json:"status" enums:"available,unavailable,unsupported"`
	Unit        string                   `json:"unit"`
	ObservedAt  *time.Time               `json:"observed_at" format:"date-time" extensions:"x-nullable"`
	Aggregation string                   `json:"aggregation,omitempty" enums:"max"`
	Resources   *[]ResourceUsageResponse `json:"resources,omitempty"`
}

type ResourceUsageResponse struct {
	ID         string     `json:"id" format:"uuid"`
	PublicID   string     `json:"public_id"`
	Used       *int64     `json:"used" format:"int64" extensions:"x-nullable"`
	Status     string     `json:"status" enums:"available,unavailable,unsupported"`
	ObservedAt *time.Time `json:"observed_at" format:"date-time" extensions:"x-nullable"`
}
