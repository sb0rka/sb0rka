package runtime

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"unicode/utf8"
)

const MaxIdentityBodyBytes = 16 * 1024

// DecodeIdentityJSON reads exactly one bounded object before credential work.
func DecodeIdentityJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, MaxIdentityBodyBytes)
	raw, err := io.ReadAll(r.Body)
	raw = bytes.TrimSpace(raw)
	if err == nil && (len(raw) == 0 || raw[0] != '{' || !utf8.Valid(raw)) {
		err = errors.New("expected a JSON object")
	}
	if err == nil {
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		err = decoder.Decode(target)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return false
		}
		var extra any
		err = decoder.Decode(&extra)
		if err == io.EOF {
			return true
		}
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
	} else {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
	}
	return false
}
