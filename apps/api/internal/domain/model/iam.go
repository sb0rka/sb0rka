package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	PlanKindAccount = "account"
	PlanKindProject = "project"
	
	// Default plan code for free plan for new projects.
	PlanCodeFree    = "free"

	QuotaScopeAccount = "account"
	QuotaScopeProject = "project"

	QuotaUnitCount = "count"
	QuotaUnitBytes = "bytes"
	QuotaUnitBps   = "bps"
)

type SubjectPlan struct {
	SubjectID uuid.UUID `json:"subject_id"`
	PlanID    uuid.UUID `json:"plan_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Plan struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Code        string    `json:"code"`
	Kind        string    `json:"kind"`
	IsPublic    bool      `json:"is_public"`
	IsAvailable bool      `json:"is_available"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type QuotaDefinition struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Code        string    `json:"code"`
	Scope       string    `json:"scope"`
	Unit        string    `json:"unit"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PlanQuota struct {
	PlanID            uuid.UUID `json:"plan_id"`
	QuotaDefinitionID uuid.UUID `json:"quota_definition_id"`
	LimitValue        int64     `json:"limit_value"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
