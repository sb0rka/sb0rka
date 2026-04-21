package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	DefaultLoggerLevel  = "info"
	DefaultLoggerFormat = "text"

	DefaultPlatformDatabasePsqlURI = "postgres://postgres:postgres@localhost:5432/platform"
	DefaultDatabaseMaxConns        = 10
	DefaultDatabaseConnMaxLifetime = 30 * time.Second

	DefaultServerAddr                = "localhost"
	DefaultServerPort                = 8080
	DefaultCORSAllowedDefaultMethods = "GET,POST,PATCH,PUT,DELETE,OPTIONS"

	// JWT defaults
	DefaultAccessTokenIssuer   = "auth.local"
	DefaultAccessTokenAudience = "api.local"
	DefaultAccessTokenKid      = "ed25519-v1" // TODO(kompotkot): Add rotation of access token kid logic
	DefaultAccessTokenTyp      = "access+jwt"

	// Tenants database defaults
	DefaultTenantsDatabasePublicBaseHost = "localhost.sslip.io"
	DefaultTenantsDatabasePublicPort     = 5432

	// Telemetry defaults
	DefaultTelemetryPrometheusURI          = "http://localhost:9090"
	DefaultTelemetryPrometheusQueryTimeout = 10 * time.Second
	DefaultTelemetryPrometheusUsername     = ""
	DefaultTelemetryPrometheusPassword     = ""
	DefaultTelemetryPrometheusBearerToken  = ""
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

	platformDatabaseURIEnv := getStringEnv("PLATFORM_DATABASE_URI", DefaultPlatformDatabasePsqlURI)

	databaseMaxConns := getIntEnv("DATABASE_MAX_OPEN_CONNS", DefaultDatabaseMaxConns)
	databaseConnMaxLifetime := getDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", DefaultDatabaseConnMaxLifetime)

	serverAddr := getStringEnv("SERVER_ADDR", DefaultServerAddr)
	serverPort := getIntEnv("SERVER_PORT", DefaultServerPort)

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

	accessTokenIssuer := getStringEnv("ACCESS_TOKEN_ISSUER", DefaultAccessTokenIssuer)
	accessTokenAudience := getStringEnv("ACCESS_TOKEN_AUDIENCE", DefaultAccessTokenAudience)
	accessTokenKid := getStringEnv("ACCESS_TOKEN_KID", DefaultAccessTokenKid)
	accessTokenTyp := getStringEnv("ACCESS_TOKEN_TYP", DefaultAccessTokenTyp)

	secretMasterKeyB64 := getStringEnv("SECRET_MASTER_KEY", "")
	if secretMasterKeyB64 == "" {
		return nil, fmt.Errorf("SECRET_MASTER_KEY should be set")
	}
	secretMasterKeyBytes, err := base64.RawStdEncoding.DecodeString(secretMasterKeyB64)
	if err != nil {
		return nil, fmt.Errorf("decode %s error: %w", secretMasterKeyB64, err)
	}

	if len(secretMasterKeyBytes) != chacha20poly1305.KeySize {
		return nil, fmt.Errorf("%s must decode to %d bytes, got %d", secretMasterKeyBytes, chacha20poly1305.KeySize, len(secretMasterKeyBytes))
	}

	secretMasterKey, err := chacha20poly1305.NewX(secretMasterKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("create xchacha20poly1305 error: %w", err)
	}

	tenantsDatabasePublicBaseHost := getStringEnv("TENANTS_DATABASE_PUBLIC_BASE_HOST", DefaultTenantsDatabasePublicBaseHost)
	tenantsDatabasePublicPort := getIntEnv("TENANTS_DATABASE_PUBLIC_PORT", DefaultTenantsDatabasePublicPort)

	telemetryPrometheusURI := getStringEnv("TELEMETRY_PROMETHEUS_URI", DefaultTelemetryPrometheusURI)
	telemetryPrometheusQueryTimeout := getDurationEnv("TELEMETRY_PROMETHEUS_QUERY_TIMEOUT_SEC", DefaultTelemetryPrometheusQueryTimeout)
	telemetryPrometheusUsername := getStringEnv("TELEMETRY_PROMETHEUS_USERNAME", DefaultTelemetryPrometheusUsername)
	telemetryPrometheusPassword := getStringEnv("TELEMETRY_PROMETHEUS_PASSWORD", DefaultTelemetryPrometheusPassword)
	telemetryPrometheusBearerToken := getStringEnv("TELEMETRY_PROMETHEUS_BEARER_TOKEN", DefaultTelemetryPrometheusBearerToken)

	cfg = Config{
		Logger: LoggerConfig{
			Level:  logLevelEnv,
			Format: logFormatEnv,
		},
		PlatformDatabase: DatabaseConfig{
			URI:             platformDatabaseURIEnv,
			MaxConns:        databaseMaxConns,
			ConnMaxLifetime: databaseConnMaxLifetime,
		},
		Server: ServerConfig{
			Addr: serverAddr,
			Port: fmt.Sprintf("%d", serverPort),

			CORSWhitelist:             corsWhitelist,
			CORSAllowedDefaultMethods: serverCORSAllowedDefaultMethodsEnv,

			AuthConfig: AuthConfig{
				AccessTokenPrivateKey: accessTokenPrivateKey,
				AccessTokenIssuer:     accessTokenIssuer,
				AccessTokenAudience:   accessTokenAudience,
				AccessTokenKid:        accessTokenKid,
				AccessTokenTyp:        accessTokenTyp,

				SecretMasterKey: secretMasterKey,
			},

			TenantsDatabasePublicBaseHost: tenantsDatabasePublicBaseHost,
			TenantsDatabasePublicPort:     tenantsDatabasePublicPort,

			Telemetry: TelemetryConfig{
				PrometheusURI:          telemetryPrometheusURI,
				PrometheusQueryTimeout: telemetryPrometheusQueryTimeout,
				PrometheusUsername:     telemetryPrometheusUsername,
				PrometheusPassword:     telemetryPrometheusPassword,
				PrometheusBearerToken:  telemetryPrometheusBearerToken,
			},
		},
	}

	return &cfg, nil
}
