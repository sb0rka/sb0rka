package contract

import (
	"encoding/json"
	"time"
)

type RegisterUserRequest struct {
	Username string  `json:"username"`
	Email    string  `json:"email"`
	Password string  `json:"password"`
	Phone    *string `json:"phone,omitempty"`
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
	for _, k := range []string{"username", "email", "password", "phone"} {
		delete(all, k)
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
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Phone     *string   `json:"phone,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
