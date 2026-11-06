package service

import (
	"strings"
	"testing"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

func TestPasswordIsPreservedAndNeverTruncated(t *testing.T) {
	for _, raw := range []string{" password ", "12345678", strings.Repeat("x", 64), "пароль-пароль"} {
		got, err := ValidatePassword(raw)
		if err != nil || got != raw {
			t.Fatalf("credential changed: %v", err)
		}
	}
	for _, raw := range []string{"1234567", strings.Repeat("x", 65), strings.Repeat(" ", 100) + "password", string([]byte{255}) + "password"} {
		if _, err := ValidatePassword(raw); err == nil {
			t.Fatal("invalid length or encoding accepted")
		}
	}
	cfg := config.AuthConfig{SaltLen: 16, ArgonMemory: 8, ArgonTime: 1, ArgonThreads: 1, ArgonKeyLen: 16}
	hash, err := HashPassword(" password ", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := VerifyPassword(" password ", hash, cfg); err != nil || !ok {
		t.Fatal("original credential rejected")
	}
	if ok, err := VerifyPassword("password", hash, cfg); err != nil || ok {
		t.Fatal("trimmed credential matched")
	}
	for _, hash := range []string{"$", "c2FsdA$", "c2FsdA$aGFzaA"} {
		if _, err := VerifyPassword("password", hash, cfg); err == nil {
			t.Fatal("invalid stored hash accepted")
		}
	}
	previous := cfg
	previous.SaltLen, previous.ArgonKeyLen = 32, 32
	oldHash, err := HashPassword("password", previous)
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := VerifyPassword("password", oldHash, cfg); err != nil || !ok {
		t.Fatal("safe previous hash lengths stopped working")
	}
	if _, err := HashPassword("password", config.AuthConfig{}); err == nil {
		t.Fatal("invalid Argon2 configuration accepted")
	}
}
