package contract

import (
	"encoding/json"
	"strings"
	"time"
)

type RegisterUserRequest struct {
	Username     string  `json:"username"`
	Email        string  `json:"email"`
	Password     string  `json:"password"`
	Phone        *string `json:"phone,omitempty"`
	CaptchaToken string  `json:"captcha_token,omitempty"`
	// Extras holds non-core fields (credentials excluded) for downstream registration hooks.
	Extras map[string]json.RawMessage `json:"-"`
}

func (r *RegisterUserRequest) UnmarshalJSON(data []byte) error {
	type core RegisterUserRequest
	var c core
	if err := json.Unmarshal(data, &c); err != nil {
		return err
	}
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return err
	}
	for key := range all {
		for _, field := range [...]string{"username", "email", "password", "phone", "captcha_token"} {
			if strings.EqualFold(key, field) {
				delete(all, key)
				break
			}
		}
	}
	c.Extras = all
	*r = RegisterUserRequest(c)
	return nil
}

type UserUpdateRequest struct {
	Username *string `json:"username,omitempty"`
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
}

type UserPasswordUpdateRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type UserResponse struct {
	ID              string     `json:"id"`
	Username        string     `json:"username"`
	Email           string     `json:"email"`
	EmailVerifiedAt *time.Time `json:"email_verified_at,omitempty"`
	Phone           *string    `json:"phone,omitempty"`
	PhoneVerifiedAt *time.Time `json:"phone_verified_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}
