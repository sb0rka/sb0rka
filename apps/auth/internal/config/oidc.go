package config

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"slices"
	"strings"

	coreconfig "github.com/sb0rka/sb0rka/packages/core/config"
)

const (
	maximumOIDCClientIDLen     = 128
	minimumOIDCClientSecretLen = 32
	oidcCryptoKeyLen           = 32
	minimumOIDCCodeHMACKeyLen  = 32
)

// OIDCConfig contains issuer-wide keys and the immutable deployment registry.
type OIDCConfig struct {
	Registry                ClientRegistry
	Issuer                  string
	LoginURL                string
	AllowInsecureHTTPIssuer bool
	SigningPrivateKey       *rsa.PrivateKey
	SigningKeyID            string
	ProviderCryptoKey       []byte
	CodeHMACKey             []byte
	PlatformAPIBaseURL      string
	PreviousAccessJWKS      []byte
}

func (c OIDCConfig) Clone() OIDCConfig {
	c.Registry = c.Registry.Clone()
	c.ProviderCryptoKey = append([]byte(nil), c.ProviderCryptoKey...)
	c.CodeHMACKey = append([]byte(nil), c.CodeHMACKey...)
	c.PreviousAccessJWKS = append([]byte(nil), c.PreviousAccessJWKS...)
	return c
}

func loadOptionalOIDCConfig() (*OIDCConfig, error) {
	names := []string{
		"OIDC_LOGIN_URL", "OIDC_SIGNING_PRIVATE_KEY_FILE_PATH", "OIDC_SIGNING_KID",
		"OIDC_PROVIDER_CRYPTO_KEY_FILE_PATH", "OIDC_CODE_HMAC_KEY_FILE_PATH",
		"OIDC_ALLOW_INSECURE_HTTP_ISSUER",
	}
	configured := false
	for _, name := range names {
		if strings.TrimSpace(os.Getenv(name)) != "" {
			configured = true
			break
		}
	}
	if !configured {
		return nil, nil
	}
	cfg, err := loadOIDCConfig()
	if err != nil {
		return nil, err
	}
	cloned := cfg.Clone()
	return &cloned, nil
}

func loadOIDCConfig() (OIDCConfig, error) {
	allowHTTP, err := coreconfig.GetBoolEnvStrict("OIDC_ALLOW_INSECURE_HTTP_ISSUER", false)
	if err != nil {
		return OIDCConfig{}, err
	}

	issuer := strings.TrimSuffix(
		strings.TrimSpace(coreconfig.GetStringEnv("JWT_ISSUER", DefaultAccessTokenIssuer)),
		"/",
	)
	signingPEM, err := readBinarySecret("OIDC_SIGNING_PRIVATE_KEY_FILE_PATH")
	if err != nil {
		return OIDCConfig{}, err
	}
	signingKey, err := parsePKCS8RSAKey(signingPEM)
	if err != nil {
		return OIDCConfig{}, fmt.Errorf("OIDC signing private key must contain an RSA PKCS#8 PEM key: %w", err)
	}
	providerKey, err := readBinarySecret("OIDC_PROVIDER_CRYPTO_KEY_FILE_PATH")
	if err != nil {
		return OIDCConfig{}, err
	}
	hmacKey, err := readBinarySecret("OIDC_CODE_HMAC_KEY_FILE_PATH")
	if err != nil {
		return OIDCConfig{}, err
	}

	var previous []byte
	if path := strings.TrimSpace(os.Getenv("ACCESS_TOKEN_PREVIOUS_JWKS_FILE_PATH")); path != "" {
		previous, err = os.ReadFile(path)
		if err != nil {
			return OIDCConfig{}, err
		}
	}
	cfg := OIDCConfig{
		PlatformAPIBaseURL: coreconfig.GetStringEnv(
			"PLATFORM_API_BASE_URL",
			"http://localhost:8080",
		), PreviousAccessJWKS: previous,
		Issuer:                  issuer,
		LoginURL:                strings.TrimSpace(os.Getenv("OIDC_LOGIN_URL")),
		AllowInsecureHTTPIssuer: allowHTTP,
		SigningPrivateKey:       signingKey,
		SigningKeyID:            strings.TrimSpace(os.Getenv("OIDC_SIGNING_KID")),
		ProviderCryptoKey:       providerKey,
		CodeHMACKey:             hmacKey,
	}
	if err := cfg.validate(); err != nil {
		return OIDCConfig{}, err
	}
	return cfg, nil
}

func (c OIDCConfig) validate() error {
	issuer, err := url.Parse(c.Issuer)
	if err != nil || issuer.Scheme == "" || issuer.Host == "" {
		return errors.New("JWT_ISSUER must be an absolute URL")
	}
	if issuer.User != nil || issuer.ForceQuery || issuer.RawQuery != "" ||
		issuer.Fragment != "" || strings.Contains(c.Issuer, "#") {
		return errors.New("JWT_ISSUER must not contain userinfo, query, or fragment")
	}
	if issuer.Path != "" {
		return errors.New("JWT_ISSUER must not contain a path or trailing slash")
	}
	switch issuer.Scheme {
	case "https":
	case "http":
		if !c.AllowInsecureHTTPIssuer || !isLocalDevHTTPHost(issuer.Hostname()) {
			return errors.New(
				"HTTP JWT_ISSUER requires OIDC_ALLOW_INSECURE_HTTP_ISSUER=true and a loopback or private-network hostname",
			)
		}
	default:
		return errors.New("JWT_ISSUER scheme must be https")
	}
	if err := validateLoginURL(c.LoginURL); err != nil {
		return fmt.Errorf("invalid OIDC_LOGIN_URL: %w", err)
	}
	api, err := url.Parse(c.PlatformAPIBaseURL)
	if err != nil || api.Host == "" || api.User != nil || api.Path != "" || api.RawQuery != "" || api.Fragment != "" ||
		(api.Scheme != "https" && api.Scheme != "http") {
		return errors.New("PLATFORM_API_BASE_URL must be an HTTP(S) origin")
	}
	if c.SigningPrivateKey == nil {
		return errors.New("OIDC signing private key is required")
	}
	if err := c.SigningPrivateKey.Validate(); err != nil {
		return fmt.Errorf("OIDC signing private key is invalid: %w", err)
	}
	if c.SigningPrivateKey.N.BitLen() < 2048 {
		return errors.New("OIDC signing RSA key must be at least 2048 bits")
	}
	if !validKeyID(c.SigningKeyID) {
		return errors.New("OIDC_SIGNING_KID must contain 1-128 URL-safe characters")
	}
	if len(c.ProviderCryptoKey) != oidcCryptoKeyLen {
		return fmt.Errorf("OIDC provider crypto key must be exactly %d bytes", oidcCryptoKeyLen)
	}
	if len(c.CodeHMACKey) < minimumOIDCCodeHMACKeyLen {
		return fmt.Errorf("OIDC code HMAC key must be at least %d bytes", minimumOIDCCodeHMACKeyLen)
	}
	if slices.Equal(c.ProviderCryptoKey, c.CodeHMACKey) {
		return errors.New("OIDC provider crypto key and code HMAC key must be separate keys")
	}
	return nil
}

func validateLoginURL(raw string) error {
	loginURL, err := url.Parse(raw)
	if err != nil || loginURL.Scheme == "" || loginURL.Host == "" {
		return errors.New("must be an absolute URL")
	}
	if loginURL.User != nil || loginURL.ForceQuery || loginURL.RawQuery != "" ||
		loginURL.Fragment != "" || strings.Contains(raw, "#") {
		return errors.New("must not contain userinfo, query, or fragment")
	}
	if loginURL.Path != "/login" {
		return errors.New("path must be /login")
	}
	if loginURL.Scheme == "https" || (loginURL.Scheme == "http" && isLoopbackHost(loginURL.Hostname())) {
		return nil
	}
	return errors.New("must use HTTPS, except for loopback development")
}

func readBinarySecret(fileEnvName string) ([]byte, error) {
	filePath := strings.TrimSpace(os.Getenv(fileEnvName))
	if filePath == "" {
		return nil, fmt.Errorf("%s is required", fileEnvName)
	}
	secret, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", fileEnvName, err)
	}
	if len(secret) == 0 {
		return nil, fmt.Errorf("%s points to an empty file", fileEnvName)
	}
	return secret, nil
}

func parsePKCS8RSAKey(data []byte) (*rsa.PrivateKey, error) {
	block, rest := pem.Decode(data)
	if block == nil || block.Type != "PRIVATE KEY" || len(strings.TrimSpace(string(rest))) != 0 {
		return nil, errors.New("invalid PEM envelope")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("key is not RSA")
	}
	return key, nil
}

func validateRedirectURI(raw string) error {
	if len(raw) > 2048 {
		return errors.New("redirect URI is too long")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return errors.New("redirect URI must be absolute")
	}
	if u.User != nil || u.Fragment != "" || strings.Contains(raw, "#") {
		return errors.New("redirect URI must not contain userinfo or fragment")
	}
	if u.Scheme == "https" || (u.Scheme == "http" && isLoopbackHost(u.Hostname())) {
		return nil
	}
	return errors.New("redirect URI must use HTTPS, except for loopback development")
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isLocalDevHTTPHost(host string) bool {
	if isLoopbackHost(host) {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsPrivate()
}

func validKeyID(kid string) bool {
	if len(kid) == 0 || len(kid) > 128 {
		return false
	}
	for _, r := range kid {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			continue
		}
		return false
	}
	return true
}
