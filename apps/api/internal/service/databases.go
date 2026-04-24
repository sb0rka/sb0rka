package service

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// NormalizeDatabaseName modifies a database name to less then 32 characters, only lowercase letters, numbers and underscores
func NormalizeDatabaseName(rawName string) (string, error) {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return "", errors.New("database name is empty")
	}

	if utf8.RuneCountInString(name) >= 64 {
		return "", errors.New("database name must be less than 64 characters")
	}

	s := strings.ToLower(name)

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
