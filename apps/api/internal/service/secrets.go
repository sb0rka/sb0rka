package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/pbkdf2"
)

const ()

const (
	dbPasswordLength  = 18
	dbPasswordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	scramIterations = 4096
	scramSaltLen    = 16
)

var secretNameRe = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)

// ValidateSecretName validates a secret name - less then 32 characters.
// Allowed symbols: letters, numbers, '-', '_', '/', '.'
func ValidateSecretName(rawName string) (string, error) {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return "", errors.New("name is empty")
	}

	if utf8.RuneCountInString(name) >= 128 {
		return "", errors.New("secret name must be less than 128 characters")
	}

	if !secretNameRe.MatchString(name) {
		return "", fmt.Errorf("%s: %q", "secret name may contain only letters, numbers, and symbols '-', '_', '/', '.'", name)
	}

	return name, nil
}

func ValidateSecretValue(rawValue string) (string, error) {
	value := rawValue
	if utf8.RuneCountInString(value) >= 4096 {
		return "", errors.New("secret value must be less than 4096 characters")
	}

	return value, nil
}

func GenerateResourceID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

// GenerateAlphaNumPassword creates a cryptographically-random password consisting of
// lowercase letters, uppercase letters and digits only (no symbols).
func GenerateAlphaNumPassword() (string, error) {
	out := make([]byte, dbPasswordLength)

	// 256 % 62 = 8, so we only take bytes < 248
	// to avoid bias in the random distribution.
	const maxrb = 256 - (256 % len(dbPasswordCharset))

	buf := make([]byte, 32)
	i := 0

	for i < dbPasswordLength {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}

		for _, b := range buf {
			if int(b) >= maxrb {
				continue
			}
			out[i] = dbPasswordCharset[int(b)%len(dbPasswordCharset)]
			i++
			if i == dbPasswordLength {
				break
			}
		}
	}

	return string(out), nil
}

func GeneratePostgresSCRAMSHA256Verifier(password string) (string, error) {
	return GeneratePostgresSCRAMSHA256VerifierWithParams(password, scramIterations, scramSaltLen)
}

// PostgreSQL SCRAM-SHA-256 verifier:
// SaltedPassword := Hi(password, salt, iterations)
// ClientKey      := HMAC(SaltedPassword, "Client Key")
// StoredKey      := SHA256(ClientKey)
// ServerKey      := HMAC(SaltedPassword, "Server Key")
func GeneratePostgresSCRAMSHA256VerifierWithParams(password string, iterations int, saltLen int) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password is empty")
	}
	if iterations <= 0 {
		return "", fmt.Errorf("iterations must be greater than zero")
	}
	if saltLen <= 0 {
		return "", fmt.Errorf("salt length must be greater than zero")
	}

	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	saltedPassword := pbkdf2.Key([]byte(password), salt, iterations, sha256.Size, sha256.New)

	clientKey := hmacSHA256(saltedPassword, []byte("Client Key"))

	storedKeyHash := sha256.Sum256(clientKey)
	storedKey := storedKeyHash[:]

	serverKey := hmacSHA256(saltedPassword, []byte("Server Key"))

	enc := base64.StdEncoding

	verifier := fmt.Sprintf(
		"SCRAM-SHA-256$%d:%s$%s:%s",
		iterations,
		enc.EncodeToString(salt),
		enc.EncodeToString(storedKey),
		enc.EncodeToString(serverKey),
	)

	return verifier, nil
}

func hmacSHA256(key []byte, msg []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(msg)
	return mac.Sum(nil)
}
