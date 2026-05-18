//go:build dev

package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
)

const defaultLocalHTTPPort = 8080

func main() {
	addr := localListenAddr()

	http.HandleFunc("/", serveHTTP)
	log.Printf("proxy-sql local server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func localListenAddr() string {
	raw := strings.TrimSpace(os.Getenv("LOCAL_HTTP_ADDR"))
	if raw == "" {
		return fmt.Sprintf(":%d", defaultLocalHTTPPort)
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65535 {
		log.Fatalf("LOCAL_HTTP_ADDR must be a port number 1-65535, got %q", raw)
	}
	return fmt.Sprintf(":%d", port)
}

func serveHTTP(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}

	headers := make(map[string]string, len(r.Header))
	for key, values := range r.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	resp, err := Handler(r.Context(), Request{
		Method:  r.Method,
		Path:    r.URL.Path,
		Headers: headers,
		Body:    string(body),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for key, value := range resp.Headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write([]byte(resp.Body))
}
