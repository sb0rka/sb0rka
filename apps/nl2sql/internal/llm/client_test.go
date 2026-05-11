package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClient_ChatCompletion_success(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Method != http.MethodPost {
			t.Errorf("method %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_ = json.NewEncoder(w).Encode(chatCompletionResponse{
			Choices: []struct {
				Message Message `json:"message"`
			}{
				{Message: Message{Role: "assistant", Content: "SELECT 1;"}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		BaseURL:    srv.URL + "/v1",
		APIKey:     "test-key",
		HTTPClient: srv.Client(),
	}
	out, err := c.ChatCompletion(context.Background(), "m", 0.1, []Message{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatalf("ChatCompletion: %v", err)
	}
	if out != "SELECT 1;" {
		t.Fatalf("got %q", out)
	}
}

func TestClient_ChatCompletion_apiError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"bad model"}}`))
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		BaseURL:    srv.URL + "/v1",
		APIKey:     "k",
		HTTPClient: srv.Client(),
	}
	_, err := c.ChatCompletion(context.Background(), "m", 0, nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestClient_ChatCompletion_omitsAuthWithoutAPIKey(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("expected no Authorization header for Ollama-style empty key")
		}
		_ = json.NewEncoder(w).Encode(chatCompletionResponse{
			Choices: []struct {
				Message Message `json:"message"`
			}{{Message: Message{Content: "SELECT 1"}}},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		BaseURL:    srv.URL + "/v1",
		APIKey:     "",
		HTTPClient: srv.Client(),
	}
	if _, err := c.ChatCompletion(context.Background(), "llama3.2", 0, []Message{{Role: "user", Content: "x"}}); err != nil {
		t.Fatal(err)
	}
}

func TestClient_ChatCompletion_emptyChoices(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(chatCompletionResponse{Choices: nil})
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		BaseURL:    srv.URL + "/v1",
		APIKey:     "k",
		HTTPClient: srv.Client(),
	}
	_, err := c.ChatCompletion(context.Background(), "m", 0, nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestClient_ChatCompletionAllowEmpty_accepts_empty_content(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": ""}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		BaseURL:    srv.URL + "/v1",
		APIKey:     "k",
		HTTPClient: srv.Client(),
	}
	out, err := c.ChatCompletionAllowEmpty(context.Background(), "m", 0, []Message{{Role: "user", Content: "x"}})
	if err != nil {
		t.Fatal(err)
	}
	if out != "" {
		t.Fatalf("got %q", out)
	}
}
