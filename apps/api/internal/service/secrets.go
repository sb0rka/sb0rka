package service

import (
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	dbPasswordLength  = 18
	dbPasswordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
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

// EncryptSecret encrypts plaintext secret using master key
// and returns a single base64 string containing nonce || ciphertext
// TODO(kompotkot): Store nonce separately
func EncryptSecret(plaintext string, secretMasterKey cipher.AEAD) (string, error) {
	nonce := make([]byte, chacha20poly1305.NonceSizeX)
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := secretMasterKey.Seal(nil, nonce, []byte(plaintext), nil)

	combined := make([]byte, 0, len(nonce)+len(ciphertext))
	combined = append(combined, nonce...)
	combined = append(combined, ciphertext...)

	return base64.RawStdEncoding.EncodeToString(combined), nil
}

// DecryptSecret decrypts base64(nonce || ciphertext) using master key.
func DecryptSecret(encoded string, secretMasterKey cipher.AEAD) (string, error) {
	if strings.TrimSpace(encoded) == "" {
		return "", errors.New("encoded secret is required")
	}

	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("decode secret payload: %w", err)
	}

	if len(raw) < chacha20poly1305.NonceSizeX {
		return "", errors.New("invalid secret payload: too short")
	}

	nonce := raw[:chacha20poly1305.NonceSizeX]
	ciphertext := raw[chacha20poly1305.NonceSizeX:]

	plaintext, err := secretMasterKey.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt secret: %w", err)
	}

	return string(plaintext), nil
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
