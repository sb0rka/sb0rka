package config

import (
	"crypto/cipher"
	"crypto/ed25519"
	"time"
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
	AccessTokenPrivateKey ed25519.PrivateKey
	AccessTokenIssuer     string
	AccessTokenAudience   string
	AccessTokenKid        string
	AccessTokenTyp        string
	SecretMasterKey       cipher.AEAD
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

	Telemetry TelemetryConfig
}

type Config struct {
	Logger           LoggerConfig
	PlatformDatabase DatabaseConfig
	Server           ServerConfig
}
