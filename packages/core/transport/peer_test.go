package transport

import (
	"net"
	"net/http"
	"testing"
)

func TestClientPeerIgnoresForwardedHeadersFromUntrustedConnections(t *testing.T) {
	request := requestFrom("203.0.113.8:1234", "198.51.100.9")
	if got := ClientPeer(request, mustCIDRs(t, "10.0.0.0/8")); got != "203.0.113.8" {
		t.Fatalf("got %s", got)
	}
}

func TestClientPeerUsesRightmostUntrustedForwardedHop(t *testing.T) {
	request := requestFrom("10.0.0.8:443", "203.0.113.4, 10.0.0.2")
	if got := ClientPeer(request, mustCIDRs(t, "10.0.0.0/8")); got != "203.0.113.4" {
		t.Fatalf("got %s", got)
	}
}

func requestFrom(remote, forwarded string) *http.Request {
	request, _ := http.NewRequest(http.MethodPost, "http://auth.internal/v1/auth/login", nil)
	request.RemoteAddr = remote
	if forwarded != "" {
		request.Header.Set("X-Forwarded-For", forwarded)
	}
	return request
}

func mustCIDRs(t *testing.T, values ...string) []*net.IPNet {
	t.Helper()
	var parsed []*net.IPNet
	for _, value := range values {
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			t.Fatal(err)
		}
		parsed = append(parsed, network)
	}
	return parsed
}
