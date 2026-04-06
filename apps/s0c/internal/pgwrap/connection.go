package pgwrap

import (
	"fmt"
	"net/url"
	"strings"
)

type PassfileEntry struct {
	Host     string
	Port     string
	Database string
	Username string
	Password string
}

// BuildTarget parses a PostgreSQL URI and returns a password-free connection URI.
// If the input URI contained a password, it also returns a passfile entry.
func BuildTarget(rawURI string) (string, *PassfileEntry, error) {
	rawURI = strings.TrimSpace(rawURI)
	if rawURI == "" {
		return "", nil, fmt.Errorf("database URI is empty")
	}

	parsed, err := url.Parse(rawURI)
	if err != nil {
		return "", nil, fmt.Errorf("parse database URI: %w", err)
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return "", nil, fmt.Errorf("unsupported database URI scheme %q", parsed.Scheme)
	}

	var passfileEntry *PassfileEntry

	username := ""
	password, hasPassword := "", false
	if parsed.User != nil {
		username = parsed.User.Username()
		password, hasPassword = parsed.User.Password()
	}

	if hasPassword {
		passfileEntry = &PassfileEntry{
			Host:     fallbackValue(parsed.Hostname(), "*"),
			Port:     fallbackValue(parsed.Port(), "*"),
			Database: fallbackValue(strings.TrimPrefix(parsed.Path, "/"), "*"),
			Username: fallbackValue(username, "*"),
			Password: password,
		}
	}

	if username == "" {
		parsed.User = nil
	} else {
		parsed.User = url.User(username)
	}

	return parsed.String(), passfileEntry, nil
}

func (e PassfileEntry) Line() string {
	return strings.Join([]string{
		escapePassfileField(e.Host),
		escapePassfileField(e.Port),
		escapePassfileField(e.Database),
		escapePassfileField(e.Username),
		escapePassfileField(e.Password),
	}, ":")
}

func fallbackValue(v string, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	return v
}

func escapePassfileField(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	return strings.ReplaceAll(s, ":", `\:`)
}
