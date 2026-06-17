package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultLoggerLevel  = "info"
	DefaultLoggerFormat = "text"

	DefaultDatabasePsqlURI         = "postgres://postgres:postgres@localhost:5432/auth"
	DefaultDatabaseMaxConns        = 10
	DefaultDatabaseConnMaxLifetime = 30 * time.Second

	DefaultServerAddr = "localhost"
	DefaultServerPort = 8080
	DefaultCORSAllowedDefaultMethods = "GET,POST,PATCH,PUT,DELETE,OPTIONS"

	DefaultIsPhoneRequired  bool = false
	DefaultIsInviteRequired bool = false

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
	DefaultRefreshTokenCookieDomain        = "localhost"
	DefaultRefreshTokenCookieHttpOnly bool = true
	DefaultRefreshTokenCookieSameSite int  = 2 // 1 = http.SameSiteDefaultMode, 2 = http.SameSiteLaxMode, 3 = http.SameSiteStrictMode, 4 = http.SameSiteNoneMode
)

func getStringEnv(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func getIntEnv(key string, fallback int) int {
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

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}

	if val, err := strconv.Atoi(v); err != nil {
		return fallback
	} else {
		return time.Duration(val) * time.Second
	}
}

func getBoolEnv(key string, fallback bool) bool {
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

func Load() (*Config, error) {
	var cfg Config

	logLevelEnv := getStringEnv("LOG_LEVEL", DefaultLoggerLevel)
	logFormatEnv := getStringEnv("LOG_FORMAT", DefaultLoggerFormat)

	databaseURIEnv := getStringEnv("DATABASE_URI", DefaultDatabasePsqlURI)

	databaseMaxConns := getIntEnv("DATABASE_MAX_OPEN_CONNS", DefaultDatabaseMaxConns)
	databaseConnMaxLifetime := getDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", DefaultDatabaseConnMaxLifetime)

	serverAddr := getStringEnv("SERVER_ADDR", DefaultServerAddr)
	serverPort := getIntEnv("SERVER_PORT", DefaultServerPort)
	isPhoneRequired := getBoolEnv("IS_PHONE_REQUIRED", DefaultIsPhoneRequired)
	isInviteRequired := getBoolEnv("IS_INVITE_REQUIRED", DefaultIsInviteRequired)

	serverCORSWhitelistEnv := os.Getenv("SERVER_CORS_WHITELIST")
	corsWhitelistSls := strings.Split(strings.ReplaceAll(serverCORSWhitelistEnv, " ", ""), ",")
	corsWhitelist := make(map[string]bool, len(corsWhitelistSls))
	for _, uri := range corsWhitelistSls {
		if uri == "*" {
			corsWhitelist = make(map[string]bool, 1)
			corsWhitelist["*"] = true
			break
		}
		valid, err := url.ParseRequestURI(uri)
		if err != nil {
			fmt.Printf("Ignoring incorrect URI %s", uri)
			continue
		}
		corsWhitelist[valid.String()] = true
	}

	serverCORSAllowedDefaultMethodsEnv := getStringEnv("SERVER_CORS_ALLOWED_DEFAULT_METHODS", DefaultCORSAllowedDefaultMethods)

	var accessTokenPrivateKeyRaw []byte
	var err error
	accessTokenPrivateKeyFilePathEnv := getStringEnv("ACCESS_TOKEN_PRIVATE_KEY_FILE_PATH", "")
	if accessTokenPrivateKeyFilePathEnv != "" {
		accessTokenPrivateKeyRaw, err = os.ReadFile(accessTokenPrivateKeyFilePathEnv)
		if err != nil {
			return nil, fmt.Errorf("failed to read access token private key file: %v", err)
		}
	} else {
		accessTokenPrivateKeyEnv := getStringEnv("ACCESS_TOKEN_PRIVATE_KEY", "")
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

	accessSessionTTL := getDurationEnv("ACCESS_SESSION_TTL_SEC", DefaultAccessSessionTTL)
	accessTokenTTL := getDurationEnv("ACCESS_TOKEN_TTL_SEC", DefaultAccessTokenTTL)
	accessTokenIssuer := getStringEnv("ACCESS_TOKEN_ISSUER", DefaultAccessTokenIssuer)
	accessTokenAudience := getStringEnv("ACCESS_TOKEN_AUDIENCE", DefaultAccessTokenAudience)
	accessTokenKid := getStringEnv("ACCESS_TOKEN_KID", DefaultAccessTokenKid)
	accessTokenTyp := getStringEnv("ACCESS_TOKEN_TYP", DefaultAccessTokenTyp)
	refreshTokenLen := getIntEnv("REFRESH_TOKEN_LEN", DefaultRefreshTokenLen)

	refreshTokenCookieName := getStringEnv("REFRESH_TOKEN_COOKIE_NAME", DefaultRefreshTokenCookieName)
	refreshTokenCookieSecure := getBoolEnv("REFRESH_TOKEN_COOKIE_SECURE", DefaultRefreshTokenCookieSecure)
	refreshTokenCookiePath := getStringEnv("REFRESH_TOKEN_COOKIE_PATH", DefaultRefreshTokenCookiePath)
	refreshTokenCookieDomain := getStringEnv("REFRESH_TOKEN_COOKIE_DOMAIN", DefaultRefreshTokenCookieDomain)
	refreshTokenCookieHttpOnly := getBoolEnv("REFRESH_TOKEN_COOKIE_HTTP_ONLY", DefaultRefreshTokenCookieHttpOnly)
	refreshTokenCookieSameSite := getIntEnv("REFRESH_TOKEN_COOKIE_SAMESITE", DefaultRefreshTokenCookieSameSite)

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

			IsPhoneRequired:  isPhoneRequired,
			IsInviteRequired: isInviteRequired,

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
