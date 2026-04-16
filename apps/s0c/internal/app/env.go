package app

import (
	"os"
	"strings"
)

const (
	DefaultAPIBaseURL             = "https://api.sb0rka.ru"
	DefaultAuthBaseURL            = "https://auth.sb0rka.ru"
	DefaultRefreshTokenCookieName = "__Secure-refresh_token"
)

func ResolveBaseURLs(getenv func(string) string) (string, string) {
	if getenv == nil {
		getenv = os.Getenv
	}
	return resolveBaseURL(getenv, "S0C_API_BASE_URL", DefaultAPIBaseURL),
		resolveBaseURL(getenv, "S0C_AUTH_BASE_URL", DefaultAuthBaseURL)
}

func ResolveRefreshTokenCookieName(getenv func(string) string) string {
	if getenv == nil {
		getenv = os.Getenv
	}

	// Prefer explicit CLI override, then shared backend variable.
	name := strings.TrimSpace(getenv("S0C_REFRESH_TOKEN_COOKIE_NAME"))
	if name == "" {
		name = strings.TrimSpace(getenv("REFRESH_TOKEN_COOKIE_NAME"))
	}
	if name == "" {
		name = DefaultRefreshTokenCookieName
	}

	return name
}

func resolveBaseURL(getenv func(string) string, key, defaultURL string) string {
	s := strings.TrimSpace(getenv(key))
	if s == "" {
		s = defaultURL
	}
	return strings.TrimRight(s, "/")
}
