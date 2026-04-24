package service

import (
	"errors"
	"strings"
	"unicode/utf8"
)

func ValidateTagKey(rawKey string) (string, error) {
	key := strings.TrimSpace(rawKey)
	if key == "" {
		return "", errors.New("key is empty")
	}

	if utf8.RuneCountInString(key) >= 32 {
		return "", errors.New("key must be less than 32 characters")
	}

	return key, nil
}

func ValidateTagValue(rawValue string) (string, error) {
	value := strings.TrimSpace(rawValue)
	if value == "" {
		return "", errors.New("value is empty")
	}

	if utf8.RuneCountInString(value) >= 64 {
		return "", errors.New("value must be less than 64 characters")
	}

	return value, nil
}

func ValidateTagColor(rawColor *string) (*string, error) {
	if rawColor == nil {
		return nil, nil
	}

	color := strings.TrimSpace(*rawColor)
	if color == "" {
		return nil, nil
	}
	if len(color) != 7 || color[0] != '#' {
		return nil, errors.New("color must be a hex value in format #RRGGBB")
	}
	for _, r := range color[1:] {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return nil, errors.New("color must be a hex value in format #RRGGBB")
		}
	}

	return &color, nil
}
