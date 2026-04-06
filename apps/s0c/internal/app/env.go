package app

import (
	"errors"
	"os"
	"strings"
)

const (
	EnvAPIBaseURL  = "S0C_API_BASE_URL"
	EnvAuthBaseURL = "S0C_AUTH_BASE_URL"
)

func ResolveBaseURLs(getenv func(string) string) (string, string, error) {
	apiBaseURL, err := resolveRequiredBaseURL(getenv, EnvAPIBaseURL)
	if err != nil {
		return "", "", err
	}

	authBaseURL, err := resolveRequiredBaseURL(getenv, EnvAuthBaseURL)
	if err != nil {
		return "", "", err
	}

	return apiBaseURL, authBaseURL, nil
}

func resolveRequiredBaseURL(getenv func(string) string, key string) (string, error) {
	if getenv == nil {
		getenv = os.Getenv
	}

	baseURL := strings.TrimSpace(getenv(key))
	if baseURL == "" {
		return "", errors.New(key + " is not set")
	}

	return strings.TrimRight(baseURL, "/"), nil
}
