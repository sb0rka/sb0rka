package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type ResourceUsageRecord struct {
	ID         uuid.UUID       `json:"id"`
	ProjectID  uuid.UUID       `json:"project_id"`
	ResourceID uuid.UUID       `json:"resource_id"`
	Data       json.RawMessage `json:"data"`
	StartedAt  time.Time       `json:"started_at"`
	FinishedAt *time.Time      `json:"finished_at"`
}
