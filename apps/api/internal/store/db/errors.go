package db

import "errors"

var (
	ErrPlanNotFound            = errors.New("plan not found")
	ErrUserPlanNotFound        = errors.New("user plan not found")
	ErrUserPlanAlreadyAttached = errors.New("user plan already attached")

	ErrProjectAlreadyExists = errors.New("project already exists")
	ErrProjectLimitReached  = errors.New("project limit reached")
	ErrProjectNotFound      = errors.New("project not found")

	ErrResourceLimitReached = errors.New("resource limit reached")
	ErrResourceNotFound     = errors.New("resource not found")
	ErrResourceTagNotFound  = errors.New("resource tag not found")
	ErrInvalidResourceType  = errors.New("invalid resource type")
	ErrMultipleResourceRows = errors.New("multiple resources found")

	ErrUnexpectedEmptyReturn = errors.New("unexpected empty insert return")
)
