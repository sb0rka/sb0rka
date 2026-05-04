package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultHTTPListenAddr = ":8083"
	// DefaultOpenAIBaseURL targets a local Ollama OpenAI-compatible endpoint (/v1/chat/completions).
	// Override with OPENAI_BASE_URL, e.g. http://192.168.0.159:11434/v1 for a LAN host.
	DefaultOpenAIBaseURL = "http://127.0.0.1:11434/v1"
	DefaultOpenAIModel   = "llama3.2"
	DefaultLLMTimeout         = 60 * time.Second
	DefaultMaxRequestBytes    = 256 * 1024
	DefaultMaxQuestionRunes   = 8000
	DefaultMaxSchemaRunes     = 200_000
	DefaultRateLimitRPS       = 2.0
	DefaultRateLimitBurst     = 5
	DefaultLLMTemperature     = 0.2
)

type Config struct {
	HTTPListenAddr string

	OpenAIBaseURL string
	OpenAIAPIKey  string
	OpenAIModel   string
	LLMTimeout    time.Duration
	LLMTemp       float64

	MaxRequestBytes  int64
	MaxQuestionRunes int
	MaxSchemaRunes   int

	RateLimitRPS   float64
	RateLimitBurst int

	SharedSecret string

	IncludeRawMessage bool
}

func Load() (Config, error) {
	cfg := Config{
		HTTPListenAddr:   envString("HTTP_LISTEN_ADDR", DefaultHTTPListenAddr),
		OpenAIBaseURL:    strings.TrimRight(strings.TrimSpace(envString("OPENAI_BASE_URL", DefaultOpenAIBaseURL)), "/"),
		OpenAIAPIKey:     strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		OpenAIModel:      envString("OPENAI_MODEL", DefaultOpenAIModel),
		LLMTimeout:       envDuration("LLM_TIMEOUT", DefaultLLMTimeout),
		LLMTemp:          envFloat("LLM_TEMPERATURE", DefaultLLMTemperature),
		MaxRequestBytes:  envInt64("MAX_REQUEST_BYTES", DefaultMaxRequestBytes),
		MaxQuestionRunes: envInt("MAX_QUESTION_RUNES", DefaultMaxQuestionRunes),
		MaxSchemaRunes:   envInt("MAX_SCHEMA_RUNES", DefaultMaxSchemaRunes),
		RateLimitRPS:     envFloat("RATE_LIMIT_RPS", DefaultRateLimitRPS),
		RateLimitBurst:   envInt("RATE_LIMIT_BURST", DefaultRateLimitBurst),
		SharedSecret:     strings.TrimSpace(os.Getenv("NL2SQL_SHARED_SECRET")),
		IncludeRawMessage: envBool("NL2SQL_INCLUDE_RAW_MESSAGE", false),
	}

	if cfg.MaxRequestBytes < 1024 {
		return Config{}, fmt.Errorf("MAX_REQUEST_BYTES must be at least 1024")
	}
	if cfg.MaxQuestionRunes < 1 {
		return Config{}, fmt.Errorf("MAX_QUESTION_RUNES must be greater than 0")
	}
	if cfg.MaxSchemaRunes < 1 {
		return Config{}, fmt.Errorf("MAX_SCHEMA_RUNES must be greater than 0")
	}
	if cfg.RateLimitRPS <= 0 {
		return Config{}, fmt.Errorf("RATE_LIMIT_RPS must be greater than 0")
	}
	if cfg.RateLimitBurst < 1 {
		return Config{}, fmt.Errorf("RATE_LIMIT_BURST must be greater than 0")
	}
	if cfg.LLMTemp < 0 || cfg.LLMTemp > 2 {
		return Config{}, fmt.Errorf("LLM_TEMPERATURE must be between 0 and 2")
	}
	return cfg, nil
}

func envString(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func envFloat(key string, fallback float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
