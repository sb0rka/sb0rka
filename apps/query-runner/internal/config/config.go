package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultHTTPListenAddr   = ":8080"
	DefaultPlatformTimeout  = 5 * time.Second
	DefaultConnectTimeout   = 5 * time.Second
	DefaultQueryTimeout     = 15 * time.Second
	DefaultMaxRows          = 1000
	DefaultMaxResponseBytes = 2 * 1024 * 1024
	DefaultRateLimitRPS     = 2
	DefaultRateLimitBurst   = 5
)

type Config struct {
	PlatformAPIBaseURL   string
	HTTPListenAddr       string
	PlatformTimeout      time.Duration
	ConnectTimeout       time.Duration
	QueryTimeout         time.Duration
	MaxRows              int
	MaxResponseBytes     int
	RateLimitRPS         float64
	RateLimitBurst       int
	DangerAllowAllQueries bool
}

func Load() (Config, error) {
	cfg := Config{
		PlatformAPIBaseURL:   strings.TrimRight(strings.TrimSpace(os.Getenv("PLATFORM_API_BASE_URL")), "/"),
		HTTPListenAddr:       envString("HTTP_LISTEN_ADDR", DefaultHTTPListenAddr),
		PlatformTimeout:      envDuration("PLATFORM_TIMEOUT", DefaultPlatformTimeout),
		ConnectTimeout:       envDuration("CONNECT_TIMEOUT", DefaultConnectTimeout),
		QueryTimeout:         envDuration("QUERY_TIMEOUT", DefaultQueryTimeout),
		MaxRows:              envInt("MAX_ROWS", DefaultMaxRows),
		MaxResponseBytes:     envInt("MAX_RESPONSE_BYTES", DefaultMaxResponseBytes),
		RateLimitRPS:         envFloat("RATE_LIMIT_RPS", DefaultRateLimitRPS),
		RateLimitBurst:       envInt("RATE_LIMIT_BURST", DefaultRateLimitBurst),
		DangerAllowAllQueries: envBool("DANGER_ALLOW_ALL_QUERIES", false),
	}

	if cfg.PlatformAPIBaseURL == "" {
		return Config{}, fmt.Errorf("PLATFORM_API_BASE_URL is required")
	}
	if cfg.MaxRows < 1 {
		return Config{}, fmt.Errorf("MAX_ROWS must be greater than 0")
	}
	if cfg.MaxResponseBytes < 1024 {
		return Config{}, fmt.Errorf("MAX_RESPONSE_BYTES must be at least 1024")
	}
	if cfg.RateLimitRPS <= 0 {
		return Config{}, fmt.Errorf("RATE_LIMIT_RPS must be greater than 0")
	}
	if cfg.RateLimitBurst < 1 {
		return Config{}, fmt.Errorf("RATE_LIMIT_BURST must be greater than 0")
	}
	return cfg, nil
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
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

func envFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
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
