package oidc

import "time"

const (
	pendingRequestTTL = 15 * time.Minute
	tokenTTL          = 5 * time.Minute
	canonicalScopes   = "openid profile email offline_access"
)

type protocolError struct {
	Code   string
	Status int
}

// Error exposes only the OAuth error code and never a runtime diagnostic message.
func (e *protocolError) Error() string {
	return e.Code
}

// newProtocolError keeps OAuth error payloads and their HTTP status coupled at creation time.
func newProtocolError(code string, status int) *protocolError {
	return &protocolError{Code: code, Status: status}
}
