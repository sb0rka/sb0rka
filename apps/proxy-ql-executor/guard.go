package main

import (
	"net/http"
	"strings"
	"unicode"
)

func ValidateSQL(sql string) error {
	// UTF-8 BOM не убирается TrimSpace и сбил бы определение первого ключевого слова.
	sql = strings.TrimPrefix(sql, string(rune(0xFEFF)))
	trimmed := strings.TrimSpace(sql)
	if trimmed == "" {
		return NewStatusError(http.StatusBadRequest, "query is required", nil)
	}
	if hasStackedStatements(trimmed) {
		return NewStatusError(http.StatusBadRequest, "Only a single SQL statement is allowed", nil)
	}

	keyword := firstKeyword(trimmed)
	switch keyword {
	case "select", "with", "show", "explain":
		return nil
	default:
		return NewStatusError(http.StatusBadRequest, "Only read-only query statements are allowed", nil)
	}
}

func hasStackedStatements(sql string) bool {
	inSingleQuote := false
	inDoubleQuote := false
	inLineComment := false
	inBlockComment := false

	for i := 0; i < len(sql); i++ {
		ch := sql[i]
		next := byte(0)
		if i+1 < len(sql) {
			next = sql[i+1]
		}

		if inLineComment {
			if ch == '\n' {
				inLineComment = false
			}
			continue
		}
		if inBlockComment {
			if ch == '*' && next == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if inSingleQuote {
			if ch == '\'' {
				if next == '\'' {
					i++
					continue
				}
				inSingleQuote = false
			}
			continue
		}
		if inDoubleQuote {
			if ch == '"' {
				inDoubleQuote = false
			}
			continue
		}

		switch {
		case ch == '-' && next == '-':
			inLineComment = true
			i++
		case ch == '/' && next == '*':
			inBlockComment = true
			i++
		case ch == '\'':
			inSingleQuote = true
		case ch == '"':
			inDoubleQuote = true
		case ch == ';':
			if strings.TrimSpace(sql[i+1:]) != "" {
				return true
			}
		}
	}
	return false
}

func firstKeyword(sql string) string {
	sql = trimLeadingComments(sql)
	var b strings.Builder
	for _, r := range sql {
		if unicode.IsLetter(r) {
			b.WriteRune(unicode.ToLower(r))
			continue
		}
		break
	}
	return b.String()
}

func trimLeadingComments(sql string) string {
	for {
		sql = strings.TrimLeftFunc(sql, unicode.IsSpace)
		if strings.HasPrefix(sql, "--") {
			if idx := strings.IndexByte(sql, '\n'); idx >= 0 {
				sql = sql[idx+1:]
				continue
			}
			return ""
		}
		if strings.HasPrefix(sql, "/*") {
			if idx := strings.Index(sql, "*/"); idx >= 0 {
				sql = sql[idx+2:]
				continue
			}
			return ""
		}
		return sql
	}
}
