package db

import "errors"

var (
	ErrPlanNotFound            = errors.New("plan not found")
	ErrSubjectPlanNotFound     = errors.New("subject plan not found")
	ErrUserPlanAlreadyAttached = errors.New("user plan already attached")
	ErrPlanUnavailable         = errors.New("plan unavailable")
	ErrInvalidPlanKind         = errors.New("invalid plan kind")

	ErrProjectAlreadyExists  = errors.New("project already exists")
	ErrProjectLimitReached   = errors.New("project limit reached")
	ErrProjectNotFound       = errors.New("project not found")
	ErrProjectMemberNotFound = errors.New("project member not found")
	ErrProjectMemberExists   = errors.New("project member already exists")
	ErrLastOwner             = errors.New("last owner")

	ErrResourceLimitReached  = errors.New("resource limit reached")
	ErrResourceNotFound      = errors.New("resource not found")
	ErrResourceTagNotFound   = errors.New("resource tag not found")
	ErrResourceTagImmutable  = errors.New("resource tag is immutable")
	ErrInvalidResourceKind   = errors.New("invalid resource kind")
	ErrMultipleResourceRows  = errors.New("multiple resources found")
	ErrResourceInUse         = errors.New("resource in use")
	ErrInvalidSecretVersion  = errors.New("invalid secret version")
	ErrSubjectNotFound       = errors.New("subject not found")
	ErrSubjectKindMismatch   = errors.New("subject kind mismatch")
	ErrSessionNotLive        = errors.New("session is not live")
	ErrEncryptionKeyNotFound = errors.New("encryption key not found")

	ErrUnexpectedEmptyReturn = errors.New("unexpected empty insert return")
)
