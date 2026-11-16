package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	coreconfig "github.com/sb0rka/sb0rka/packages/core/config"
)

const (
	DefaultLoggerLevel  = "info"
	DefaultLoggerFormat = "text"

	DefaultDatabasePsqlURI = "postgres://postgres:postgres@localhost:5432/platform"

	DefaultServerAddr                = "localhost"
	DefaultServerPort                = 8080
	DefaultCORSAllowedDefaultMethods = "GET,POST,PATCH,PUT,DELETE,OPTIONS"

	DefaultSecretKeyRef = "default"

	// Tenants database defaults
	DefaultTenantsDatabasePublicBaseHost = "localhost.sslip.io"
	DefaultTenantsDatabasePublicPort     = 5432
	DefaultTenantsDatabaseUser           = "root"

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

	databaseURIEnv := getStringEnv("DATABASE_URI", DefaultDatabasePsqlURI)

	databaseMaxConns := getIntEnv("DATABASE_MAX_OPEN_CONNS", coreconfig.DefaultDatabaseMaxConns)
	databaseConnMaxLifetime := getDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", coreconfig.DefaultDatabaseConnMaxLifetime)

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

	accessTokenIssuer := strings.TrimSpace(os.Getenv("AUTH_BASE_URL"))
	if accessTokenIssuer == "" {
		return nil, fmt.Errorf("AUTH_BASE_URL should be set")
	}
	accessTokenPolicy, err := coreauth.AccessTokenPolicyFromEnv()
	if err != nil {
		return nil, err
	}
	accessTokenAudience := getStringEnv("AUTH_AUDIENCE", coreauth.AudienceAPI)
	if accessTokenAudience != coreauth.AudienceAPI {
		return nil, fmt.Errorf("AUTH_AUDIENCE must be %s", coreauth.AudienceAPI)
	}
	allowInsecureHTTP, err := coreconfig.GetBoolEnvStrict("AUTH_ALLOW_INSECURE_HTTP_ISSUER", false)
	if err != nil {
		return nil, err
	}
	if err := coreauth.ValidateServiceOrigin(accessTokenIssuer, allowInsecureHTTP); err != nil {
		return nil, fmt.Errorf("AUTH_BASE_URL: %w", err)
	}
	verificationKeys, err := coreauth.NewJWKSCache(accessTokenIssuer)
	if err != nil {
		return nil, err
	}

	secretKeyRef := getStringEnv("SECRET_KEY_REF", DefaultSecretKeyRef)
	var secretTinkKeysetJSON []byte
	secretTinkKeysetJSONFilePathEnv := getStringEnv("SECRET_TINK_KEYSET_JSON_FILE_PATH", "")
	if secretTinkKeysetJSONFilePathEnv != "" {
		secretTinkKeysetJSON, err = os.ReadFile(secretTinkKeysetJSONFilePathEnv)
		if err != nil {
			return nil, fmt.Errorf("failed to read secret tink keyset json file: %v", err)
		}
	} else {
		secretTinkKeysetJSONEnv := strings.TrimSpace(os.Getenv("SECRET_TINK_KEYSET_JSON"))
		if secretTinkKeysetJSONEnv != "" {
			secretTinkKeysetJSON = []byte(secretTinkKeysetJSONEnv)
		}
	}
	if len(secretTinkKeysetJSON) == 0 {
		return nil, fmt.Errorf("SECRET_TINK_KEYSET_JSON or SECRET_TINK_KEYSET_JSON_FILE_PATH should be set")
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
			URI:             databaseURIEnv,
			MaxConns:        databaseMaxConns,
			ConnMaxLifetime: databaseConnMaxLifetime,
		},
		Server: ServerConfig{
			Addr: serverAddr,
			Port: fmt.Sprintf("%d", serverPort),

			CORSWhitelist:             corsWhitelist,
			CORSAllowedDefaultMethods: serverCORSAllowedDefaultMethodsEnv,

			AuthConfig: AuthConfig{
				VerificationKeys:    verificationKeys,
				AccessTokenPolicy:   accessTokenPolicy,
				AccessTokenIssuer:   accessTokenIssuer,
				AccessTokenAudience: accessTokenAudience,

				SecretKeyRef:         secretKeyRef,
				SecretTinkKeysetJSON: secretTinkKeysetJSON,
			},

			TenantsDatabasePublicBaseHost: tenantsDatabasePublicBaseHost,
			TenantsDatabasePublicPort:     tenantsDatabasePublicPort,
			TenantsDatabaseUser:           DefaultTenantsDatabaseUser,

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
