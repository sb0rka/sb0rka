package model

import (
	"time"

	"github.com/google/uuid"
)

type UserPlan struct {
	PlanID    uuid.UUID `json:"plan_id"`
	UserID    uuid.UUID `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Plan struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	IsPublic      bool      `json:"is_public"`
	IsAvailable   bool      `json:"is_available"`
	DBLimit       int       `json:"db_limit"`
	CodeLimit     int       `json:"code_limit"`
	FunctionLimit int       `json:"function_limit"`
	SecretLimit   int       `json:"secret_limit"`
	ProjectLimit  int       `json:"project_limit"`
	GroupLimit    int       `json:"group_limit"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
