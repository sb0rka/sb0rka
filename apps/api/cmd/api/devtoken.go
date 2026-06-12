package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Только для разработки: в проде access-токены выдаёт auth-сервис.
func genDevTokenCMD(args []string) error {
	fs := flag.NewFlagSet("gen-dev-token", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	sub := fs.String("sub", "", "subject UUID (по умолчанию случайный)")
	kind := fs.String("kind", "user", "subject kind (claim sk)")
	ttl := fs.Duration("ttl", 24*time.Hour, "время жизни токена")
	if err := fs.Parse(args); err != nil {
		return err
	}

	key, err := config.LoadAccessTokenPrivateKey()
	if err != nil {
		return err
	}

	subjectID := strings.TrimSpace(*sub)
	if subjectID == "" {
		subjectID = uuid.NewString()
	} else if _, err := uuid.Parse(subjectID); err != nil {
		return fmt.Errorf("invalid -sub: %w", err)
	}

	now := time.Now().UTC()
	claims := service.AccessTokenClaims{
		SessionID:   uuid.NewString(),
		SubjectKind: *kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    devEnv("ACCESS_TOKEN_ISSUER", "auth.local"),
			Subject:   subjectID,
			Audience:  jwt.ClaimStrings{devEnv("ACCESS_TOKEN_AUDIENCE", "api.local")},
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(*ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = devEnv("ACCESS_TOKEN_KID", "ed25519-v1")
	token.Header["typ"] = devEnv("ACCESS_TOKEN_TYP", "access+jwt")

	signed, err := token.SignedString(key)
	if err != nil {
		return fmt.Errorf("sign token: %w", err)
	}

	fmt.Fprintln(os.Stderr, "subject_id:", subjectID)
	fmt.Println(signed)
	return nil
}

func devEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
