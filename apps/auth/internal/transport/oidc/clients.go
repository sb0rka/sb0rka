package oidc

import (
	"net/http"
	"slices"
	"strings"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

func (h *Handler) authenticatedClient(r *http.Request) (config.RegisteredClient, error) {
	id, secret, ok := parseBasicCredentials(r)
	c, registered := h.config.Registry.Client(id)
	if !ok || !registered || !c.Authenticate(secret) {
		return c, coreauth.ErrUnauthorized
	}
	return c, nil
}

func (h *Handler) clientGrantAllowed(clientID, grant string) bool {
	c, ok := h.config.Registry.Client(clientID)
	return ok && slices.Contains(c.GrantTypes, grant)
}

func allowedOIDCScopes(raw string, allowed []string) bool {
	fields := strings.Fields(raw)
	if len(fields) == 0 || !slices.Contains(fields, "openid") {
		return false
	}
	seen := map[string]bool{}
	for _, scope := range fields {
		if !slices.Contains(allowed, scope) || seen[scope] {
			return false
		}
		seen[scope] = true
	}
	return true
}
