package service

import (
	"strings"
	"testing"
)

func TestEmailFitsStorageWithoutTruncation(t *testing.T) {
	if got, err := ValidateEmail("user@example.test"); err != nil || got != "user@example.test" {
		t.Fatal("normal email rejected")
	}
	if _, err := ValidateEmail("user@" + strings.Repeat("d", 124) + ".test"); err == nil {
		t.Fatal("email beyond storage limit accepted")
	}
}
