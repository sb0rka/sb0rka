package transport

import (
	"net/http"
	"testing"
	"time"
)

func TestServerTimeouts(t *testing.T) {
	server := New("127.0.0.1:0", http.NewServeMux())
	if server.ReadHeaderTimeout != 10*time.Second || server.ReadTimeout != 30*time.Second ||
		server.WriteTimeout != 60*time.Second || server.IdleTimeout != 120*time.Second ||
		server.MaxHeaderBytes != 64<<10 {
		t.Fatalf("unexpected server limits: %+v", server)
	}
}
