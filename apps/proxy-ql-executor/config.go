package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPlatformTimeout  = 5 * time.Second
	defaultConnectTimeout   = 5 * time.Second
	defaultQueryTimeout     = 15 * time.Second
	defaultMaxRows          = 1000
	defaultMaxResponseBytes = 2 * 1024 * 1024

	maxPlatformTimeout = 30 * time.Second
	maxConnectTimeout  = 30 * time.Second
	maxQueryTimeout    = 60 * time.Second
	maxConfiguredRows  = 10000
	maxConfiguredBytes = 6 * 1024 * 1024
)

type Config struct {
	APIEndpoint           string
	PlatformTimeout       time.Duration
	ConnectTimeout        time.Duration
	QueryTimeout          time.Duration
	MaxRows               int
	MaxResponseBytes      int
	DangerAllowAllQueries bool
}

func LoadConfig() (Config, error) {
	cfg := Config{
		APIEndpoint:           strings.TrimRight(strings.TrimSpace(os.Getenv("API_ENDPOINT")), "/"),
		PlatformTimeout:       envDuration("PLATFORM_TIMEOUT", defaultPlatformTimeout),
		ConnectTimeout:        envDuration("CONNECT_TIMEOUT", defaultConnectTimeout),
		QueryTimeout:          envDuration("QUERY_TIMEOUT", defaultQueryTimeout),
		MaxRows:               envInt("MAX_ROWS", defaultMaxRows),
		MaxResponseBytes:      envInt("MAX_RESPONSE_BYTES", defaultMaxResponseBytes),
		DangerAllowAllQueries: envBool("DANGER_ALLOW_ALL_QUERIES", false),
	}

	if cfg.APIEndpoint == "" {
		return Config{}, fmt.Errorf("API_ENDPOINT is required")
	}
	if cfg.PlatformTimeout <= 0 || cfg.PlatformTimeout > maxPlatformTimeout {
		return Config{}, fmt.Errorf("PLATFORM_TIMEOUT must be greater than 0 and no more than %s", maxPlatformTimeout)
	}
	if cfg.ConnectTimeout <= 0 || cfg.ConnectTimeout > maxConnectTimeout {
		return Config{}, fmt.Errorf("CONNECT_TIMEOUT must be greater than 0 and no more than %s", maxConnectTimeout)
	}
	if cfg.QueryTimeout <= 0 || cfg.QueryTimeout > maxQueryTimeout {
		return Config{}, fmt.Errorf("QUERY_TIMEOUT must be greater than 0 and no more than %s", maxQueryTimeout)
	}
	if cfg.MaxRows < 1 {
		return Config{}, fmt.Errorf("MAX_ROWS must be greater than 0")
	}
	if cfg.MaxRows > maxConfiguredRows {
		return Config{}, fmt.Errorf("MAX_ROWS must be no more than %d", maxConfiguredRows)
	}
	if cfg.MaxResponseBytes < 1024 {
		return Config{}, fmt.Errorf("MAX_RESPONSE_BYTES must be at least 1024")
	}
	if cfg.MaxResponseBytes > maxConfiguredBytes {
		return Config{}, fmt.Errorf("MAX_RESPONSE_BYTES must be no more than %d", maxConfiguredBytes)
	}
	return cfg, nil
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
