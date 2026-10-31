package service

import (
	"fmt"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func ValidateUsername(usernameRaw string) (string, error) {
	username := strings.TrimSpace(usernameRaw)
	if len(username) < 3 || len(username) > 32 {
		return "", fmt.Errorf("username must be between 3 and 32 characters")
	}
	if !usernamePattern.MatchString(username) {
		return "", fmt.Errorf("username may only contain Latin letters, digits, underscores, and hyphens")
	}
	return username, nil
}

func ValidateEmail(emailRaw string) (string, error) {
	email := strings.TrimSpace(emailRaw)

	emailAddress, err := mail.ParseAddress(email)
	if err != nil {
		return "", fmt.Errorf("failed to parse email: %w", err)
	}
	return emailAddress.Address, nil
}

func ValidatePhone(phoneRaw string, isPhoneRequired bool) (int, error) {
	// If phone is not required, then empty allowed
	if !isPhoneRequired && phoneRaw == "" {
		return 0, nil
	}

	phone := strings.TrimSpace(phoneRaw)

	if len(phone) < 10 || len(phone) > 15 {
		return 0, fmt.Errorf("phone must be between 10 and 15 characters")
	}

	if phone[0] == '+' {
		phone = phone[1:]
	}

	// phone column is INTEGER (max 2147483647); parse as 32-bit so an oversized
	// number fails validation (400) instead of blowing up on INSERT (500).
	phoneNumber, err := strconv.ParseInt(phone, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("phone must be a number within the allowed range")
	}

	return int(phoneNumber), nil
}
