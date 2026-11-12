package runtime

import (
	"encoding/hex"
	"fmt"
	"strings"
)

func ParsePublicID(raw, name string) (string, error) {
	length := 12
	if name == "project_id" {
		length = 10
	}
	if len(raw) != length || raw != strings.ToLower(raw) {
		return "", fmt.Errorf("%s must be %d lowercase hex characters", name, length)
	}
	if _, err := hex.DecodeString(raw); err != nil {
		return "", fmt.Errorf("%s must be %d lowercase hex characters", name, length)
	}
	return raw, nil
}
