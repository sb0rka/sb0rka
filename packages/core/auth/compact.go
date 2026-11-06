package auth

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

// The access-token profile uses integer seconds and unambiguous JSON objects.
// Validate these before the JWT library (which accepts numeric strings and
// duplicate, case-insensitive claim names) or an external key resolver runs.
func validateCompactAccessToken(raw string) error {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return ErrUnauthorized
	}
	decoded := make([][]byte, 3)
	for i, part := range parts {
		var err error
		decoded[i], err = base64.RawURLEncoding.Strict().DecodeString(part)
		if err != nil || part == "" || base64.RawURLEncoding.EncodeToString(decoded[i]) != part {
			return ErrUnauthorized
		}
	}
	if len(decoded[2]) != ed25519.SignatureSize {
		return ErrUnauthorized
	}
	for _, document := range decoded[:2] {
		if !utf8.Valid(document) {
			return ErrUnauthorized
		}
		if err := validateJWTObject(document); err != nil {
			return ErrUnauthorized
		}
	}
	var claims map[string]json.RawMessage
	if err := json.Unmarshal(decoded[1], &claims); err != nil {
		return ErrUnauthorized
	}
	for _, name := range []string{"iss", "sub", "aud", "iat", "exp", "jti", "client_id", "sk"} {
		if _, present := claims[name]; !present {
			return ErrUnauthorized
		}
	}
	for _, name := range []string{"exp", "iat", "nbf"} {
		if value, present := claims[name]; present {
			value = bytes.TrimSpace(value)
			var number json.Number
			if len(value) == 0 || value[0] == '"' || bytes.Equal(value, []byte("null")) || json.Unmarshal(value, &number) != nil {
				return ErrUnauthorized
			}
			if _, err := number.Int64(); err != nil {
				return ErrUnauthorized
			}
		}
	}
	return nil
}

func validateJWTObject(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	first, err := decoder.Token()
	if err != nil || first != json.Delim('{') {
		return ErrUnauthorized
	}
	if err := validateJSONContainer(decoder, json.Delim('{'), 0); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return ErrUnauthorized
	}
	return nil
}

func validateJSONContainer(decoder *json.Decoder, opening json.Delim, depth int) error {
	if depth > 16 {
		return ErrUnauthorized
	}
	seen := make(map[string]bool)
	for decoder.More() {
		if opening == '{' {
			key, err := decoder.Token()
			name, ok := key.(string)
			if err != nil || !ok || seen[strings.ToLower(name)] {
				return ErrUnauthorized
			}
			seen[strings.ToLower(name)] = true
		}
		value, err := decoder.Token()
		if err != nil {
			return err
		}
		if delimiter, ok := value.(json.Delim); ok {
			if delimiter != '{' && delimiter != '[' {
				return ErrUnauthorized
			}
			if err := validateJSONContainer(decoder, delimiter, depth+1); err != nil {
				return err
			}
		}
	}
	closing, err := decoder.Token()
	if err != nil || (opening == '{' && closing != json.Delim('}')) || (opening == '[' && closing != json.Delim(']')) {
		return fmt.Errorf("%w: invalid JSON container", ErrUnauthorized)
	}
	return nil
}
