package model

import (
	"time"

	"github.com/google/uuid"
)

type UserInvite struct {
	ID          string     `json:"id"`
	UserID      *uuid.UUID `json:"user_id,omitempty"`
	Description *string    `json:"description,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
