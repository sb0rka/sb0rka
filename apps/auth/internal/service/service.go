package service

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

// ValidateUsername validates the username
func ValidateUsername(usernameRaw string) (string, error) {
	username := strings.TrimSpace(usernameRaw)
	if len(username) < 3 || len(username) > 32 {
		return "", fmt.Errorf("username must be between 3 and 32 characters")
	}
	return username, nil
}

// ValidatePassword validates the password
func ValidatePassword(passwordRaw string) (string, error) {
	password := strings.TrimSpace(passwordRaw)
	if len(password) < 8 || len(password) > 64 {
		return "", fmt.Errorf("password must be between 8 and 64 characters")
	}
	return password, nil
}

// ValidateEmail validates the email
func ValidateEmail(emailRaw string) (string, error) {
	email := strings.TrimSpace(emailRaw)

	emailAddress, err := mail.ParseAddress(email)
	if err != nil {
		return "", fmt.Errorf("failed to parse email: %w", err)
	}
	return emailAddress.Address, nil
}

// ValidatePhone validates the phone number
func ValidatePhone(phoneRaw string, isPhoneRequired bool) (int, error) {
	// If phone is not required, then empty allowed
	if !isPhoneRequired && phoneRaw == "" {
		return 0, nil
	}

	phone := strings.TrimSpace(phoneRaw)

	if len(phone) < 10 || len(phone) > 15 {
		return 0, fmt.Errorf("phone must be between 10 and 15 characters")
	}

	if phone[0] == '+' {
		phone = phone[1:]
	}

	phoneNumber, err := strconv.Atoi(phone)
	if err != nil {
		return 0, fmt.Errorf("failed to convert phone to number: %w", err)
	}

	return phoneNumber, nil
}

// HashPassword securely hashes a password using Argon2 algorithm
func HashPassword(password string, authConfig config.AuthConfig) (string, error) {
	// Generate a random salt for password hashing
	salt := make([]byte, authConfig.SaltLen)
	_, err := rand.Read(salt)
	if err != nil {
		return "", fmt.Errorf("failed to generate salt: %w", err)
	}

	// Hash the password using Argon2id with the generated salt
	hash := argon2.IDKey([]byte(password), salt, authConfig.ArgonTime, authConfig.ArgonMemory, authConfig.ArgonThreads, authConfig.ArgonKeyLen)

	// Encode salt and hash to base64 for storage
	encodedSalt := base64.RawStdEncoding.EncodeToString(salt)
	encodedHash := base64.RawStdEncoding.EncodeToString(hash)

	// Return the combined salt and hash in a single string as "salt$hash" format
	return fmt.Sprintf("%s$%s", encodedSalt, encodedHash), nil
}

// VerifyPassword checks whether the provided password matches the stored salt$hash value.
func VerifyPassword(password, passwordHash string, authConfig config.AuthConfig) (bool, error) {
	parts := strings.Split(passwordHash, "$")
	if len(parts) != 2 {
		return false, fmt.Errorf("invalid stored password hash format")
	}

	encodedSalt := parts[0]
	encodedHash := parts[1]

	salt, err := base64.RawStdEncoding.DecodeString(encodedSalt)
	if err != nil {
		return false, fmt.Errorf("failed to decode salt: %w", err)
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(encodedHash)
	if err != nil {
		return false, fmt.Errorf("failed to decode hash: %w", err)
	}

	computedHash := argon2.IDKey(
		[]byte(password),
		salt,
		authConfig.ArgonTime,
		authConfig.ArgonMemory,
		authConfig.ArgonThreads,
		uint32(len(expectedHash)),
	)

	match := subtle.ConstantTimeCompare(computedHash, expectedHash) == 1
	return match, nil
}

// AccessTokenClaims contains custom access token claims
type AccessTokenClaims struct {
	SessionID   string `json:"sid"`
	SubjectKind string `json:"sk"`
	jwt.RegisteredClaims
}

// AccessTokenIdentity is a normalized identity extracted from a verified access token.
type AccessTokenIdentity struct {
	SubjectID   string
	SubjectKind string
	SessionID   string
	JTI         string
}

var (
	// ErrUnauthorized marks token/header validation failures that should map to HTTP 401
	ErrUnauthorized = errors.New("unauthorized")
)

// ParseBearerToken extracts a raw JWT from the Authorization header
func ParseBearerToken(authorizationHeader string) (string, error) {
	value := strings.TrimSpace(authorizationHeader)
	if value == "" {
		return "", fmt.Errorf("%w: empty authorization header", ErrUnauthorized)
	}

	parts := strings.Fields(value)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", fmt.Errorf("%w: malformed bearer header", ErrUnauthorized)
	}

	return parts[1], nil
}

// VerifyAccessToken verifies signature, header fields, and required claims for access JWT
func VerifyAccessToken(rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	if strings.TrimSpace(rawToken) == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: empty access token", ErrUnauthorized)
	}

	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	trustedKeysByKid := map[string]ed25519.PublicKey{
		authConfig.AccessTokenKid: publicKey,
	}

	claims := &AccessTokenClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrUnauthorized)
		}

		kidRaw, ok := token.Header["kid"]
		if !ok {
			return nil, fmt.Errorf("%w: missing kid header", ErrUnauthorized)
		}
		kid, ok := kidRaw.(string)
		if !ok || kid == "" {
			return nil, fmt.Errorf("%w: invalid kid header", ErrUnauthorized)
		}

		key, ok := trustedKeysByKid[kid]
		if !ok {
			return nil, fmt.Errorf("%w: untrusted kid", ErrUnauthorized)
		}
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}))
	if err != nil {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token parse/verify failed: %v", ErrUnauthorized, err)
	}
	if !token.Valid {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token is not valid", ErrUnauthorized)
	}

	typRaw, ok := token.Header["typ"]
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing typ header", ErrUnauthorized)
	}
	typ, ok := typRaw.(string)
	if !ok || typ != authConfig.AccessTokenTyp {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token typ", ErrUnauthorized)
	}

	if claims.Issuer != authConfig.AccessTokenIssuer {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token issuer", ErrUnauthorized)
	}
	hasExpectedAudience := false
	for _, aud := range claims.Audience {
		if aud == authConfig.AccessTokenAudience {
			hasExpectedAudience = true
			break
		}
	}
	if !hasExpectedAudience {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token audience", ErrUnauthorized)
	}
	if claims.ExpiresAt == nil || !claims.ExpiresAt.After(time.Now().UTC()) {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token expired", ErrUnauthorized)
	}
	if claims.Subject == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing sub claim", ErrUnauthorized)
	}
	if claims.SessionID == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing sid claim", ErrUnauthorized)
	}
	if claims.SubjectKind == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing sk claim", ErrUnauthorized)
	}
	if claims.ID == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing jti claim", ErrUnauthorized)
	}

	return AccessTokenIdentity{
		SubjectID:   claims.Subject,
		SubjectKind: claims.SubjectKind,
		SessionID:   claims.SessionID,
		JTI:         claims.ID,
	}, nil
}

// ParseAndVerifyAccessTokenFromAuthHeader validates Authorization header and JWT
func ParseAndVerifyAccessTokenFromAuthHeader(authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	rawToken, err := ParseBearerToken(authorizationHeader)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return VerifyAccessToken(rawToken, authConfig)
}

// ValidateLengthOfRefreshToken validates an opaque refresh token received from cookie
func ValidateLengthOfRefreshToken(refreshTokenRaw string, authConfig config.AuthConfig) (string, error) {
	refreshToken := strings.TrimSpace(refreshTokenRaw)
	if refreshToken == "" {
		return "", fmt.Errorf("%w: empty refresh token", ErrUnauthorized)
	}

	expectedLen := base64.RawURLEncoding.EncodedLen(authConfig.RefreshTokenLen)
	if len(refreshToken) != expectedLen {
		return "", fmt.Errorf("%w: invalid refresh token length", ErrUnauthorized)
	}

	decoded, err := base64.RawURLEncoding.DecodeString(refreshToken)
	if err != nil {
		return "", fmt.Errorf("%w: invalid refresh token encoding", ErrUnauthorized)
	}
	if len(decoded) != authConfig.RefreshTokenLen {
		return "", fmt.Errorf("%w: invalid refresh token payload length", ErrUnauthorized)
	}

	return refreshToken, nil
}

// HashRefreshToken computes DB-safe SHA-256 hash of an opaque refresh token
func HashRefreshToken(refreshToken string) string {
	sum := sha256.Sum256([]byte(refreshToken))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// CreateAccessToken creates and signs a short-lived JWT access token.
func CreateAccessToken(subjectID, sessionID uuid.UUID, subjectKind string, authConfig config.AuthConfig) (string, error) {
	now := time.Now().UTC()
	claims := AccessTokenClaims{
		SessionID:   sessionID.String(),
		SubjectKind: subjectKind,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subjectID.String(),
			Issuer:    authConfig.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{authConfig.AccessTokenAudience},
			ExpiresAt: jwt.NewNumericDate(now.Add(authConfig.AccessTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = authConfig.AccessTokenKid
	token.Header["typ"] = authConfig.AccessTokenTyp

	signedToken, err := token.SignedString(authConfig.AccessTokenPrivateKey)
	if err != nil {
		return "", fmt.Errorf("sign access token error: %w", err)
	}
	return signedToken, nil
}

// CreateRefreshTokenPair creates an opaque refresh token and its DB-safe hash
func CreateRefreshTokenPair(authConfig config.AuthConfig) (refreshToken string, refreshTokenHash string, err error) {
	raw := make([]byte, authConfig.RefreshTokenLen)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate refresh token error: %w", err)
	}

	refreshToken = base64.RawURLEncoding.EncodeToString(raw)
	refreshTokenHash = HashRefreshToken(refreshToken)
	return refreshToken, refreshTokenHash, nil
}
