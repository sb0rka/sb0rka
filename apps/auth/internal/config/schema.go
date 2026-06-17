package config

import (
	"crypto/ed25519"
	"net/http"
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
	// Argon configuration
	ArgonTime    uint32
	ArgonMemory  uint32
	ArgonThreads uint8
	ArgonKeyLen  uint32
	SaltLen      int

	// JWT configuration
	AccessSessionTTL      time.Duration
	AccessTokenPrivateKey ed25519.PrivateKey
	AccessTokenTTL        time.Duration
	AccessTokenIssuer     string
	AccessTokenAudience   string
	AccessTokenKid        string
	AccessTokenTyp        string
	RefreshTokenLen       int

	// Cookie configuration
	RefreshTokenCookieName     string
	RefreshTokenCookieSecure   bool
	RefreshTokenCookiePath     string
	RefreshTokenCookieDomain   string
	RefreshTokenCookieHttpOnly bool
	RefreshTokenCookieSameSite http.SameSite
}

type ServerConfig struct {
	Addr string
	Port string

	IsPhoneRequired  bool
	IsInviteRequired bool

	CORSWhitelist             map[string]bool
	CORSAllowedDefaultMethods string

	AuthConfig AuthConfig
}

type Config struct {
	Logger   LoggerConfig
	Database DatabaseConfig
	Server   ServerConfig
}
