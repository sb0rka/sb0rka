package contract

import "time"

type RefreshSessionResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int64  `json:"expires_in,omitempty"`
	ExpiresAt    string `json:"expires_at,omitempty"`
}

type PlanResponse struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	DBLimit       int       `json:"db_limit"`
	CodeLimit     int       `json:"code_limit"`
	FunctionLimit int       `json:"function_limit"`
	SecretLimit   int       `json:"secret_limit"`
	ProjectLimit  int       `json:"project_limit"`
	GroupLimit    int       `json:"group_limit"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
