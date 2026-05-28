package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tink-crypto/tink-go/v2/aead"
	"github.com/tink-crypto/tink-go/v2/insecurecleartextkeyset"
	"github.com/tink-crypto/tink-go/v2/keyset"
	"github.com/tink-crypto/tink-go/v2/tink"
)

const InfraSecretAADPurpose = "sb0rka.infra_secret"

type SecretAAD struct {
	Purpose         string `json:"purpose"`
	ProjectID       string `json:"project_id"`
	SecretID        string `json:"secret_id"`
	VersionNo       int    `json:"version_no"`
	ProtectionClass string `json:"protection_class"`
}

func BuildSecretAAD(projectID string, secretID string, versionNo int, protectionClass string) ([]byte, error) {
	return json.Marshal(SecretAAD{
		Purpose:         InfraSecretAADPurpose,
		ProjectID:       projectID,
		SecretID:        secretID,
		VersionNo:       versionNo,
		ProtectionClass: protectionClass,
	})
}

type SecretCrypto interface {
	Encrypt(ctx context.Context, plaintext []byte, aad []byte, keyRef string) ([]byte, error)
	Decrypt(ctx context.Context, encryptedMessage []byte, aad []byte, keyRef string) ([]byte, error)
}

type TinkAEADKeyResolver interface {
	Resolve(ctx context.Context, keyRef string) (tink.AEAD, error)
}

type TinkKeysetResolver struct {
	keys map[string]tink.AEAD
}

func NewTinkKeysetResolverFromJSON(defaultKeyRef string, keysetJSON []byte) (*TinkKeysetResolver, error) {
	keyRef := strings.TrimSpace(defaultKeyRef)
	if keyRef == "" {
		return nil, fmt.Errorf("secret key_ref is required")
	}
	if len(bytes.TrimSpace(keysetJSON)) == 0 {
		return nil, fmt.Errorf("tink keyset json is required")
	}
	reader := keyset.NewJSONReader(bytes.NewReader(keysetJSON))
	handle, err := insecurecleartextkeyset.Read(reader)
	if err != nil {
		return nil, fmt.Errorf("read tink keyset: %w", err)
	}
	primitive, err := aead.New(handle)
	if err != nil {
		return nil, fmt.Errorf("create tink aead primitive: %w", err)
	}
	return &TinkKeysetResolver{keys: map[string]tink.AEAD{keyRef: primitive}}, nil
}

func GenerateTinkAEADKeysetJSON() (string, error) {
	handle, err := keyset.NewHandle(aead.AES256GCMKeyTemplate())
	if err != nil {
		return "", fmt.Errorf("create tink keyset: %w", err)
	}
	var buf bytes.Buffer
	if err := insecurecleartextkeyset.Write(handle, keyset.NewJSONWriter(&buf)); err != nil {
		return "", fmt.Errorf("write tink keyset: %w", err)
	}
	return buf.String(), nil
}

func (r *TinkKeysetResolver) Resolve(_ context.Context, keyRef string) (tink.AEAD, error) {
	key, ok := r.keys[strings.TrimSpace(keyRef)]
	if !ok || key == nil {
		return nil, fmt.Errorf("secret key material not found for key_ref %q", keyRef)
	}
	return key, nil
}

type TinkAEADSecretCrypto struct {
	resolver TinkAEADKeyResolver
}

func NewTinkAEADSecretCrypto(resolver TinkAEADKeyResolver) *TinkAEADSecretCrypto {
	return &TinkAEADSecretCrypto{resolver: resolver}
}

func (c *TinkAEADSecretCrypto) Encrypt(ctx context.Context, plaintext []byte, aad []byte, keyRef string) ([]byte, error) {
	primitive, err := c.resolver.Resolve(ctx, keyRef)
	if err != nil {
		return nil, err
	}
	return primitive.Encrypt(plaintext, aad)
}

func (c *TinkAEADSecretCrypto) Decrypt(ctx context.Context, encryptedMessage []byte, aad []byte, keyRef string) ([]byte, error) {
	primitive, err := c.resolver.Resolve(ctx, keyRef)
	if err != nil {
		return nil, err
	}
	plaintext, err := primitive.Decrypt(encryptedMessage, aad)
	if err != nil {
		return nil, fmt.Errorf("decrypt secret material: %w", err)
	}
	return plaintext, nil
}
