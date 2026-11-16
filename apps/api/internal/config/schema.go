package config

import (
	"time"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type LoggerConfig struct {
	Level  string
	Format string
}

type DatabaseConfig struct {
	URI             string
	MaxConns        int
	ConnMaxLifetime time.Duration
}

type AuthConfig struct {
	VerificationKeys     *coreauth.JWKSCache
	AccessTokenPolicy    *coreauth.AccessTokenPolicy
	AccessTokenIssuer    string
	AccessTokenAudience  string
	SecretKeyRef         string
	SecretTinkKeysetJSON []byte
}

type TelemetryConfig struct {
	PrometheusURI          string
	PrometheusQueryTimeout time.Duration
	PrometheusUsername     string
	PrometheusPassword     string
	PrometheusBearerToken  string
}

type ServerConfig struct {
	Addr string
	Port string

	CORSWhitelist             map[string]bool
	CORSAllowedDefaultMethods string

	AuthConfig AuthConfig

	TenantsDatabasePublicBaseHost string
	TenantsDatabasePublicPort     int
	TenantsDatabaseUser           string

	Telemetry TelemetryConfig
}

type Config struct {
	Logger           LoggerConfig
	PlatformDatabase DatabaseConfig
	Server           ServerConfig
}
