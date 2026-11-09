package transport

import (
	"net"
	"net/http"
	"strings"
)

// ClientPeer returns the address used for request logs and authentication quotas.
// Forwarded headers are ignored unless the immediate connection comes from a
// configured trusted proxy. In that case the peer is the rightmost
// X-Forwarded-For hop that is not itself a trusted proxy.
func ClientPeer(r *http.Request, trusted []*net.IPNet) string {
	host := hostOnly(r.RemoteAddr)
	if !trustedIP(net.ParseIP(host), trusted) {
		return host
	}
	parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(parts[i])
		parsed := net.ParseIP(candidate)
		if parsed == nil || trustedIP(parsed, trusted) {
			continue
		}
		return candidate
	}
	return host
}

func hostOnly(value string) string {
	if host, _, err := net.SplitHostPort(value); err == nil {
		return host
	}
	return value
}

func trustedIP(ip net.IP, trusted []*net.IPNet) bool {
	if ip == nil {
		return false
	}
	for _, network := range trusted {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}
