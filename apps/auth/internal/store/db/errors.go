package db

import "errors"

var (
	ErrUnexpectedEmptyReturn = errors.New("unexpected empty insert return")

	ErrSubjectNotFound = errors.New("subject not found")

	ErrTokenNotFound      = errors.New("token not found")
	ErrTokenExpired       = errors.New("token expired")
	ErrTokenReuseDetected = errors.New("token reuse detected")

	ErrUserAlreadyExists = errors.New("user already exists")

	ErrUserNotFound = errors.New("user not found")

	ErrOrganizationNotFound            = errors.New("organization not found")
	ErrOrganizationMemberNotFound      = errors.New("organization member not found")
	ErrOrganizationMemberAlreadyExists = errors.New("organization member already exists")
)
