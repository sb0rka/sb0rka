package oidc

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

const authorizationCodeRandomBytes = 32

type credentialProtector struct {
	aead    cipher.AEAD
	random  io.Reader
	hmacKey []byte
}

// newCredentialProtector prepares the purpose-bound encryption and hashing used for browser credentials.
func newCredentialProtector(cfg config.OIDCConfig) *credentialProtector {
	block, err := aes.NewCipher(cfg.ProviderCryptoKey)
	if err != nil {
		panic("oidc: validated provider crypto key rejected by AES")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		panic("oidc: initialize provider credential protector")
	}
	return &credentialProtector{
		aead:    aead,
		random:  rand.Reader,
		hmacKey: append([]byte(nil), cfg.CodeHMACKey...),
	}
}

// sealAuthRequestID hides the database request identifier and makes browser-side tampering detectable.
func (p *credentialProtector) sealAuthRequestID(id uuid.UUID) (string, error) {
	return p.seal("auth_request", []byte(id.String()))
}

// openAuthRequestID authenticates an opaque browser value and recovers its database request identifier.
func (p *credentialProtector) openAuthRequestID(value string) (uuid.UUID, error) {
	if len(value) == 0 || len(value) > 2048 {
		return uuid.Nil, db.ErrOIDCAuthRequestNotFound
	}
	plaintext, err := p.open("auth_request", value)
	if err != nil {
		return uuid.Nil, db.ErrOIDCAuthRequestNotFound
	}
	id, err := uuid.Parse(string(plaintext))
	if err != nil {
		return uuid.Nil, db.ErrOIDCAuthRequestNotFound
	}
	return id, nil
}

// newAuthorizationCode creates a random encrypted code and the detached hash stored for one-time lookup.
func (p *credentialProtector) newAuthorizationCode() (string, []byte, error) {
	randomBytes := make([]byte, authorizationCodeRandomBytes)
	if _, err := io.ReadFull(p.random, randomBytes); err != nil {
		return "", nil, fmt.Errorf("generate authorization code: %w", err)
	}
	code, err := p.seal("authorization_code", randomBytes)
	if err != nil {
		return "", nil, fmt.Errorf("seal authorization code: %w", err)
	}
	return code, p.codeHash(code), nil
}

// validateAuthorizationCode rejects malformed or unauthentic codes before any database lookup.
func (p *credentialProtector) validateAuthorizationCode(code string) error {
	if len(code) == 0 || len(code) > 4096 {
		return db.ErrOIDCInvalidGrant
	}
	plaintext, err := p.open("authorization_code", code)
	if err != nil {
		return db.ErrOIDCInvalidGrant
	}
	if len(plaintext) != authorizationCodeRandomBytes {
		return db.ErrOIDCInvalidGrant
	}
	return nil
}

// seal creates a versioned AES-GCM envelope bound to one credential purpose.
func (p *credentialProtector) seal(purpose string, plaintext []byte) (string, error) {
	nonce := make([]byte, p.aead.NonceSize())
	if _, err := io.ReadFull(p.random, nonce); err != nil {
		return "", fmt.Errorf("generate %s nonce: %w", purpose, err)
	}
	sealed := p.aead.Seal(nonce, nonce, plaintext, p.aad(purpose))
	return "v1." + base64.RawURLEncoding.EncodeToString(sealed), nil
}

// open validates a versioned envelope and prevents ciphertext reuse across credential purposes.
func (p *credentialProtector) open(purpose, value string) ([]byte, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 || parts[0] != "v1" {
		return nil, db.ErrOIDCInvalidGrant
	}
	sealed, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(sealed) <= p.aead.NonceSize() {
		return nil, db.ErrOIDCInvalidGrant
	}
	nonce := sealed[:p.aead.NonceSize()]
	plaintext, err := p.aead.Open(nil, nonce, sealed[p.aead.NonceSize():], p.aad(purpose))
	if err != nil {
		return nil, db.ErrOIDCInvalidGrant
	}
	return plaintext, nil
}

// aad namespaces encrypted values so one OIDC credential type cannot be substituted for another.
func (p *credentialProtector) aad(purpose string) []byte {
	return []byte("sb0rka:oidc:" + purpose)
}

// codeHash derives the stable database lookup value without storing the bearer authorization code.
func (p *credentialProtector) codeHash(code string) []byte {
	mac := hmac.New(sha256.New, p.hmacKey)
	_, _ = io.WriteString(mac, code)
	return mac.Sum(nil)
}

// validS256Challenge accepts only canonical unpadded base64url encodings of a SHA-256 digest.
func validS256Challenge(challenge string) bool {
	if len(challenge) != 43 || strings.Contains(challenge, "=") {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(challenge)
	return err == nil && len(decoded) == sha256.Size &&
		base64.RawURLEncoding.EncodeToString(decoded) == challenge
}
