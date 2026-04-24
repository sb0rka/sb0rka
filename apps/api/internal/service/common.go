package service

import (
	"errors"
	"strings"
	"unicode/utf8"
)

func ValidateCommonName(rawName string) (string, error) {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return "", errors.New("name is empty")
	}

	if utf8.RuneCountInString(name) >= 32 {
		return "", errors.New("name must be less than 32 characters")
	}

	return name, nil
}

func ValidateCommonDescription(rawDescription *string) (*string, error) {
	if rawDescription == nil {
		return nil, nil
	}

	description := strings.TrimSpace(*rawDescription)
	if description == "" {
		return nil, nil
	}

	if utf8.RuneCountInString(description) >= 512 {
		return nil, errors.New("description must be less than 512 characters")
	}

	return &description, nil
}
