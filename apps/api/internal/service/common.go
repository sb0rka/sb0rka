package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

var databaseNameRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func CleanDatabaseName(rawName string) string {
	s := strings.ToLower(strings.TrimSpace(rawName))
	if s == "" {
		return "unnamed"
	}

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
	return string(out)
}

// ValidateDatabaseName validates a database name - less then 32 characters, only lowercase letters, numbers and underscores are allowed
func ValidateDatabaseName(name string) error {
	if name == "" {
		return errors.New("database name is empty")
	}

	if utf8.RuneCountInString(name) >= 32 {
		return errors.New("database name must be less than 32 characters")
	}

	if !databaseNameRe.MatchString(name) {
		return fmt.Errorf("%w: %q", "database name may contain only lowercase letters, numbers, and underscores", name)
	}

	return nil
}
