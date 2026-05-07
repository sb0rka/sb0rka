package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	PlanKindAccount = "account"
	PlanKindProject = "project"

	PlanCodeFreeAccount = "free_account"
	PlanCodeFreeProject = "free_project"

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

type ProjectQuota struct {
	PlanID     uuid.UUID
	LimitValue int64
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Definition QuotaDefinition
}
