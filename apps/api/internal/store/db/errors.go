package db

import "errors"

var (
	ErrUserPlanNotFound = errors.New("user plan not found")

	ErrProjectAlreadyExists = errors.New("project already exists")
	ErrProjectLimitReached  = errors.New("project limit reached")
	ErrProjectNotFound      = errors.New("project not found")

	ErrResourceNotFound    = errors.New("resource not found")
	ErrResourceTagNotFound = errors.New("resource tag not found")

	ErrUnexpectedEmptyReturn = errors.New("unexpected empty insert return")
)
