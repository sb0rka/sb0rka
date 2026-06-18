package invite

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var ErrInvalid = errors.New("invite code not found or already used")

type Provider interface {
	Validate(ctx context.Context, code string) error
	Claim(ctx context.Context, code string, userID uuid.UUID) error
}

type disabledProvider struct{}

func Disabled() Provider {
	return disabledProvider{}
}

func (disabledProvider) Validate(context.Context, string) error {
	return nil
}

func (disabledProvider) Claim(context.Context, string, uuid.UUID) error {
	return nil
}
