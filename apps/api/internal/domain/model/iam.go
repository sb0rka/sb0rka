package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	PlanKindAccount = "account"
	PlanKindProject = "project"
)

type SubjectPlan struct {
	SubjectID uuid.UUID `json:"subject_id"`
	PlanID    uuid.UUID `json:"plan_id"`
	CreatedAt time.Time `json:"created_at"`
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
