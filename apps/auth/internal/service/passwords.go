package service

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

func ValidatePassword(passwordRaw string) (string, error) {
	password := strings.TrimSpace(passwordRaw)
	if len(password) < 8 || len(password) > 64 {
		return "", fmt.Errorf("password must be between 8 and 64 characters")
	}
	return password, nil
}

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
