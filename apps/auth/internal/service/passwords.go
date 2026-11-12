package service

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

func ValidatePassword(passwordRaw string) (string, error) {
	// Passwords are opaque: whitespace is part of the credential. Never trim
	// or truncate a value to make it fit the accepted length.
	if !utf8.ValidString(passwordRaw) || len(passwordRaw) < 8 || len(passwordRaw) > 64 {
		return "", fmt.Errorf("password must be between 8 and 64 UTF-8 bytes")
	}
	return passwordRaw, nil
}

func HashPassword(password string, authConfig config.AuthConfig) (string, error) {
	if authConfig.SaltLen < 8 || authConfig.SaltLen > 64 || authConfig.ArgonKeyLen < 16 || authConfig.ArgonKeyLen > 64 || authConfig.ArgonTime == 0 || authConfig.ArgonThreads == 0 || authConfig.ArgonMemory < 8*uint32(authConfig.ArgonThreads) {
		return "", fmt.Errorf("invalid password hashing configuration")
	}
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
	// Stored lengths are bounded independently of the policy used for new
	// hashes so previous salt/output lengths remain verifiable.
	if len(salt) < 8 || len(salt) > 64 || len(expectedHash) < 16 || len(expectedHash) > 64 || authConfig.ArgonTime == 0 || authConfig.ArgonThreads == 0 || authConfig.ArgonMemory < 8*uint32(authConfig.ArgonThreads) {
		return false, fmt.Errorf("invalid stored password hash lengths")
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
