package auth

import (
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// CORS controls response access; cookie writes also need a request-side guard.
func (h *Handler) cookieRequest(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	origins := r.Header.Values("Origin")
	if len(origins) > 0 {
		origin, ok := browserOrigin(origins[0])
		allowed := false
		if len(origins) == 1 && ok {
			for raw, enabled := range h.deps.Cfg.CORSWhitelist {
				trusted, valid := browserOrigin(raw)
				allowed = allowed || (enabled && valid && trusted == origin)
			}
		}
		if !allowed {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return false
		}
	} else {
		for key := range r.Header {
			if strings.HasPrefix(strings.ToLower(key), "sec-fetch-") {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return false
			}
		}
	}
	media, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if len(r.Header.Values("Content-Type")) != 1 || err != nil || media != "application/json" ||
		(params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8")) {
		http.Error(w, "Unsupported media type", http.StatusUnsupportedMediaType)
		return false
	}
	return true
}

func browserOrigin(raw string) (string, bool) {
	if strings.ContainsAny(raw, "?# \t\r\n") {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.Opaque != "" {
		return "", false
	}
	scheme, host, port := strings.ToLower(u.Scheme), strings.ToLower(u.Hostname()), u.Port()
	if strings.HasSuffix(u.Host, ":") {
		return "", false
	}
	if port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return "", false
		}
	}
	if (scheme != "http" && scheme != "https") || host == "" {
		return "", false
	}
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	if port != "" {
		host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return scheme + "://" + host, true
}
