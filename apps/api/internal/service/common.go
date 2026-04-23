package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

var secretNameRe = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)

// ValidateSecretName validates a secret name - less then 32 characters.
// Allowed symbols: letters, numbers, '-', '_', '/', '.'
func ValidateSecretName(name string) error {
	if name == "" {
		return errors.New("secret name is empty")
	}

	if utf8.RuneCountInString(name) >= 32 {
		return errors.New("secret name must be less than 32 characters")
	}

	if !secretNameRe.MatchString(name) {
		return fmt.Errorf("%s: %q", "secret name may contain only letters, numbers, and symbols '-', '_', '/', '.'", name)
	}

	return nil
}

// NormalizeDatabaseName modifies a database name to less then 32 characters, only lowercase letters, numbers and underscores
func NormalizeDatabaseName(name string) (string, error) {
	if name == "" {
		return "", errors.New("database name is empty")
	}

	if utf8.RuneCountInString(name) >= 32 {
		return "", errors.New("database name must be less than 32 characters")
	}

	s := strings.ToLower(strings.TrimSpace(name))

	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			out = append(out, r)
		case r >= '0' && r <= '9':
			out = append(out, r)
		case r == '_':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}

	return string(out), nil
}
