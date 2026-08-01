package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	coreconfig "github.com/sb0rka/sb0rka/packages/core/config"
)

const (
	DefaultLoggerLevel  = "info"
	DefaultLoggerFormat = "text"

	DefaultDatabasePsqlURI = "postgres://postgres:postgres@localhost:5432/auth"

	DefaultServerAddr                = "localhost"
	DefaultServerPort                = 8080
	DefaultCORSAllowedDefaultMethods = "GET,POST,PATCH,PUT,DELETE,OPTIONS"

	DefaultIsPhoneRequired bool = false

	// Argon defaults
	DefaultArgonTime    uint32 = 1
	DefaultArgonMemory  uint32 = 64 * 1024
	DefaultArgonThreads uint8  = 4
	DefaultArgonKeyLen  uint32 = 32
	DefaultSaltLen      int    = 16

	// JWT defaults
	DefaultAccessSessionTTL    time.Duration = 7 * 24 * time.Hour
	DefaultAccessTokenTTL      time.Duration = 5 * time.Minute
	DefaultAccessTokenIssuer                 = "auth.local"
	DefaultAccessTokenAudience               = "api.local"
	DefaultAccessTokenKid                    = "ed25519-v1" // TODO(kompotkot): Add rotation of access token kid logic
	DefaultAccessTokenTyp                    = "access+jwt"
	DefaultRefreshTokenLen     int           = 32

	DefaultRefreshTokenCookieName          = "__Host-refresh_token"
	DefaultRefreshTokenCookieSecure   bool = true
	DefaultRefreshTokenCookiePath          = "/"
	DefaultRefreshTokenCookieDomain        = ""
	DefaultRefreshTokenCookieHttpOnly bool = true
	DefaultRefreshTokenCookieSameSite int  = 2 // 1 = http.SameSiteDefaultMode, 2 = http.SameSiteLaxMode, 3 = http.SameSiteStrictMode, 4 = http.SameSiteNoneMode
)

func Load() (*Config, error) {
	var cfg Config

	logLevelEnv := coreconfig.GetStringEnv("LOG_LEVEL", DefaultLoggerLevel)
	logFormatEnv := coreconfig.GetStringEnv("LOG_FORMAT", DefaultLoggerFormat)

	databaseURIEnv := coreconfig.GetStringEnv("DATABASE_URI", DefaultDatabasePsqlURI)

	databaseMaxConns := coreconfig.GetIntEnv("DATABASE_MAX_OPEN_CONNS", coreconfig.DefaultDatabaseMaxConns)
	databaseConnMaxLifetime := coreconfig.GetDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", coreconfig.DefaultDatabaseConnMaxLifetime, time.Second)

	serverAddr := coreconfig.GetStringEnv("SERVER_ADDR", DefaultServerAddr)
	serverPort := coreconfig.GetIntEnv("SERVER_PORT", DefaultServerPort)
	isPhoneRequired := coreconfig.GetBoolEnv("IS_PHONE_REQUIRED", DefaultIsPhoneRequired)

	corsWhitelist := coreconfig.ParseCORSWhitelist(os.Getenv("SERVER_CORS_WHITELIST"))

	serverCORSAllowedDefaultMethodsEnv := coreconfig.GetStringEnv("SERVER_CORS_ALLOWED_DEFAULT_METHODS", DefaultCORSAllowedDefaultMethods)

	var accessTokenPrivateKeyRaw []byte
	var err error
	accessTokenPrivateKeyFilePathEnv := coreconfig.GetStringEnv("ACCESS_TOKEN_PRIVATE_KEY_FILE_PATH", "")
	if accessTokenPrivateKeyFilePathEnv != "" {
		accessTokenPrivateKeyRaw, err = os.ReadFile(accessTokenPrivateKeyFilePathEnv)
		if err != nil {
			return nil, fmt.Errorf("failed to read access token private key file: %v", err)
		}
	} else {
		accessTokenPrivateKeyEnv := coreconfig.GetStringEnv("ACCESS_TOKEN_PRIVATE_KEY", "")
		if accessTokenPrivateKeyEnv != "" {
			accessTokenPrivateKeyRaw, err = base64.StdEncoding.DecodeString(accessTokenPrivateKeyEnv)
			if err != nil {
				return nil, fmt.Errorf("failed to decode base64 access token private key: %v", err)
			}
		}
	}

	if len(accessTokenPrivateKeyRaw) == 0 {
		return nil, fmt.Errorf("access token private key is not set")
	}

	block, _ := pem.Decode(accessTokenPrivateKeyRaw)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM access token private key")
	}
	parsedPrivateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PKCS#8 access token private key: %v", err)
	}

	accessTokenPrivateKey, ok := parsedPrivateKey.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("access token private key is not ed25519")
	}

	accessSessionTTL := coreconfig.GetDurationEnv("ACCESS_SESSION_TTL_SEC", DefaultAccessSessionTTL, time.Second)
	accessTokenTTL := coreconfig.GetDurationEnv("ACCESS_TOKEN_TTL_SEC", DefaultAccessTokenTTL, time.Second)
	accessTokenIssuer := coreconfig.GetStringEnv("ACCESS_TOKEN_ISSUER", DefaultAccessTokenIssuer)
	accessTokenAudience := coreconfig.GetStringEnv("ACCESS_TOKEN_AUDIENCE", DefaultAccessTokenAudience)
	accessTokenKid := coreconfig.GetStringEnv("ACCESS_TOKEN_KID", DefaultAccessTokenKid)
	accessTokenTyp := coreconfig.GetStringEnv("ACCESS_TOKEN_TYP", DefaultAccessTokenTyp)
	refreshTokenLen := coreconfig.GetIntEnv("REFRESH_TOKEN_LEN", DefaultRefreshTokenLen)

	refreshTokenCookieName := coreconfig.GetStringEnv("REFRESH_TOKEN_COOKIE_NAME", DefaultRefreshTokenCookieName)
	refreshTokenCookieSecure := coreconfig.GetBoolEnv("REFRESH_TOKEN_COOKIE_SECURE", DefaultRefreshTokenCookieSecure)
	refreshTokenCookiePath := coreconfig.GetStringEnv("REFRESH_TOKEN_COOKIE_PATH", DefaultRefreshTokenCookiePath)
	refreshTokenCookieDomain := coreconfig.GetStringEnv("REFRESH_TOKEN_COOKIE_DOMAIN", DefaultRefreshTokenCookieDomain)
	refreshTokenCookieHttpOnly := coreconfig.GetBoolEnv("REFRESH_TOKEN_COOKIE_HTTP_ONLY", DefaultRefreshTokenCookieHttpOnly)
	refreshTokenCookieSameSite := coreconfig.GetIntEnv("REFRESH_TOKEN_COOKIE_SAMESITE", DefaultRefreshTokenCookieSameSite)

	if strings.HasPrefix(refreshTokenCookieName, "__Host-") &&
		(!refreshTokenCookieSecure || refreshTokenCookiePath != "/" || refreshTokenCookieDomain != "") {
		return nil, fmt.Errorf("refresh token cookie with __Host- prefix requires Secure, Path=/, and an empty Domain")
	}

	cfg = Config{
		Logger: LoggerConfig{
			Level:  logLevelEnv,
			Format: logFormatEnv,
		},
		Database: DatabaseConfig{
			URI:             databaseURIEnv,
			MaxConns:        databaseMaxConns,
			ConnMaxLifetime: databaseConnMaxLifetime,
		},
		Server: ServerConfig{
			Addr: serverAddr,
			Port: fmt.Sprintf("%d", serverPort),

			IsPhoneRequired: isPhoneRequired,

			CORSWhitelist:             corsWhitelist,
			CORSAllowedDefaultMethods: serverCORSAllowedDefaultMethodsEnv,

			AuthConfig: AuthConfig{
				ArgonTime:    DefaultArgonTime,
				ArgonMemory:  DefaultArgonMemory,
				ArgonThreads: DefaultArgonThreads,
				ArgonKeyLen:  DefaultArgonKeyLen,
				SaltLen:      DefaultSaltLen,

				AccessSessionTTL:      accessSessionTTL,
				AccessTokenPrivateKey: accessTokenPrivateKey,
				AccessTokenTTL:        accessTokenTTL,
				AccessTokenIssuer:     accessTokenIssuer,
				AccessTokenAudience:   accessTokenAudience,
				AccessTokenKid:        accessTokenKid,
				AccessTokenTyp:        accessTokenTyp,
				RefreshTokenLen:       refreshTokenLen,

				RefreshTokenCookieName:     refreshTokenCookieName,
				RefreshTokenCookieSecure:   refreshTokenCookieSecure,
				RefreshTokenCookiePath:     refreshTokenCookiePath,
				RefreshTokenCookieDomain:   refreshTokenCookieDomain,
				RefreshTokenCookieHttpOnly: refreshTokenCookieHttpOnly,
				RefreshTokenCookieSameSite: http.SameSite(refreshTokenCookieSameSite),
			},
		},
	}

	return &cfg, nil
}
