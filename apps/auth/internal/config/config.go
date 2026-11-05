package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
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
	DefaultAccessSessionTTL  time.Duration = 7 * 24 * time.Hour
	DefaultAccessTokenIssuer               = "http://localhost:8020"
	DefaultAccessTokenKid                  = "ed25519-v1" // TODO(kompotkot): Add rotation of access token kid logic
	DefaultRefreshTokenLen   int           = 32

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
	accessTokenTTL, err := coreconfig.GetDurationEnvStrict("ACCESS_TOKEN_TTL_SEC", coreauth.DefaultAccessTokenTTL, time.Second)
	if err != nil {
		return nil, err
	}
	accessTokenPolicy, err := coreauth.AccessTokenPolicyFromEnv()
	if err != nil {
		return nil, err
	}
	if accessTokenTTL <= 0 || accessTokenTTL > accessTokenPolicy.MaxTTL {
		return nil, fmt.Errorf("ACCESS_TOKEN_TTL_SEC must be positive and must not exceed MAX_ACCESS_TOKEN_TTL_SEC")
	}
	accessTokenIssuer := coreconfig.GetStringEnv("JWT_ISSUER", DefaultAccessTokenIssuer)
	accessTokenAudience := coreauth.AudienceAPI
	accessTokenKid := coreconfig.GetStringEnv("ACCESS_TOKEN_KID", DefaultAccessTokenKid)
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

	oidcConfig, err := loadOptionalOIDCConfig()
	if err != nil {
		return nil, fmt.Errorf("load OIDC configuration: %w", err)
	}

	if oidcConfig == nil {
		return nil, fmt.Errorf("OIDC configuration is required for platform Auth")
	}
	if oidcConfig != nil && oidcConfig.Issuer != accessTokenIssuer {
		return nil, fmt.Errorf("OIDC issuer must equal JWT_ISSUER")
	}
	var previousKeys map[string]ed25519.PublicKey
	if !validKeyID(accessTokenKid) || accessTokenKid == oidcConfig.SigningKeyID {
		return nil, fmt.Errorf("access and ID-token kid must be valid and distinct")
	}
	if len(oidcConfig.PreviousAccessJWKS) > 0 {
		var previous struct{ Keys []struct{ KID string } }
		if json.Unmarshal(oidcConfig.PreviousAccessJWKS, &previous) != nil {
			return nil, fmt.Errorf("invalid previous JWKS")
		}
		for _, key := range previous.Keys {
			if key.KID == accessTokenKid || key.KID == oidcConfig.SigningKeyID {
				return nil, fmt.Errorf("previous JWKS duplicates active kid")
			}
		}
		previousKeys, err = coreauth.AccessPublicKeys(oidcConfig.PreviousAccessJWKS)
		if err != nil {
			return nil, fmt.Errorf("invalid previous public JWKS: %w", err)
		}
		if _, exists := previousKeys[accessTokenKid]; exists {
			return nil, fmt.Errorf("previous JWKS duplicates active access kid")
		}
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
			OIDC: oidcConfig,

			IsPhoneRequired: isPhoneRequired,

			CORSWhitelist:             corsWhitelist,
			CORSAllowedDefaultMethods: serverCORSAllowedDefaultMethodsEnv,

			AuthConfig: AuthConfig{
				ArgonTime:    DefaultArgonTime,
				ArgonMemory:  DefaultArgonMemory,
				ArgonThreads: DefaultArgonThreads,
				ArgonKeyLen:  DefaultArgonKeyLen,
				SaltLen:      DefaultSaltLen,

				AccessSessionTTL:         accessSessionTTL,
				AccessTokenPrivateKey:    accessTokenPrivateKey,
				PreviousAccessPublicKeys: previousKeys,
				AccessTokenTTL:           accessTokenTTL,
				AccessTokenPolicy:        accessTokenPolicy,
				AccessTokenIssuer:        accessTokenIssuer,
				AccessTokenAudience:      accessTokenAudience,
				AccessTokenKid:           accessTokenKid,
				RefreshTokenLen:          refreshTokenLen,

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
