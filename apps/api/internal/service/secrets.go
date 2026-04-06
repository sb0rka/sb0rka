package service

import (
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	dbPasswordLength  = 18
	dbPasswordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// EncryptSecret encrypts plaintext secret using master key
// and returns a single base64 string containing nonce || ciphertext
// TODO(kompotkot): Store nonce separately
func EncryptSecret(plaintext string, secretMasterKey cipher.AEAD) (string, error) {
	if strings.TrimSpace(plaintext) == "" {
		return "", errors.New("plaintext secret is required")
	}

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
