package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

func GetStringEnv(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func GetIntEnv(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}

	if val, err := strconv.Atoi(v); err != nil {
		return fallback
	} else {
		return val
	}
}

func GetDurationEnv(key string, fallback time.Duration, unit time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}

	if val, err := strconv.Atoi(v); err != nil {
		return fallback
	} else {
		return time.Duration(val) * unit
	}
}

func GetBoolEnv(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}

	switch v {
	case "1", "true":
		return true
	case "0", "false":
		return false
	default:
		return fallback
	}
}

// GetBoolEnvStrict returns the fallback for an unset variable and rejects an invalid value.
func GetBoolEnvStrict(key string, fallback bool) (bool, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback, nil
	}

	value, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
	}
	return value, nil
}
