package service

import (
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/chacha20poly1305"
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
