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

type ServerConfig struct {
	Addr string
	Port string

	CORSWhitelist             map[string]bool
	CORSAllowedDefaultMethods string

	AuthConfig AuthConfig
}

type Config struct {
	Logger           LoggerConfig
	PlatformDatabase DatabaseConfig
	Server           ServerConfig
}
