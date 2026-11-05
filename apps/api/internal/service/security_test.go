package service

import (
	"bytes"
	"github.com/google/uuid"
	"testing"
)

func TestSecuritySecretAADIsolation(t *testing.T) {
	keyJSON, err := GenerateTinkAEADKeysetJSON()
	if err != nil {
		t.Fatal(err)
	}
	resolver, err := NewTinkKeysetResolverFromJSON("audit", []byte(keyJSON))
	if err != nil {
		t.Fatal(err)
	}
	crypto := NewTinkAEADSecretCrypto(resolver)
	project, secret := uuid.New(), uuid.New()
	aad, err := BuildSecretAAD(project, secret, 1, "managed")
	if err != nil {
		t.Fatal(err)
	}
	plaintext := []byte("temporary-audit-fixture")
	ciphertext, err := crypto.Encrypt(t.Context(), plaintext, aad, "audit")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := crypto.Decrypt(t.Context(), ciphertext, aad, "audit"); err != nil || !bytes.Equal(got, plaintext) {
		t.Fatal("control decryption failed")
	}
	for _, tc := range []struct {
		name            string
		project, secret uuid.UUID
		version         int32
		class           string
	}{
		{"project", uuid.New(), secret, 1, "managed"},
		{"secret", project, uuid.New(), 1, "managed"},
		{"version", project, secret, 2, "managed"},
		{"class", project, secret, 1, "other"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			wrong, err := BuildSecretAAD(tc.project, tc.secret, tc.version, tc.class)
			if err != nil {
				t.Fatal(err)
			}
			if got, err := crypto.Decrypt(t.Context(), ciphertext, wrong, "audit"); err == nil || len(got) > 0 {
				t.Fatal("cross-boundary ciphertext accepted")
			}
		})
	}
	if _, err := crypto.Decrypt(t.Context(), ciphertext, aad, "unknown"); err == nil {
		t.Fatal("unknown key reference accepted")
	}
	ciphertext[len(ciphertext)-1] ^= 1
	if got, err := crypto.Decrypt(t.Context(), ciphertext, aad, "audit"); err == nil || len(got) > 0 {
		t.Fatal("tampered ciphertext accepted")
	}
}
