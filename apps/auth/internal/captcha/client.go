// Package captcha verifies single-use registration tokens with DDoS-Guard.
package captcha

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"syscall"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

type Client struct {
	privateKey  string
	passOnError bool
	http        *http.Client
}

func New(cfg config.CaptchaConfig) *Client {
	client := &http.Client{
		Timeout: 3 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return &Client{
		privateKey:  cfg.PrivateKey,
		passOnError: cfg.PassOnError,
		http:        client,
	}
}

type Outcome string

const (
	Verified       Outcome = "verified"
	AllowedOnError Outcome = "allowed_on_error"
	Invalid        Outcome = "invalid"
	Temporary      Outcome = "temporary_failure"
	Unavailable    Outcome = "unavailable"
	Canceled       Outcome = "canceled"
)

type Result struct {
	Outcome        Outcome
	Reason         string
	ProviderStatus int
}

func (c *Client) Verify(ctx context.Context, token string) Result {
	outcome, reason, status := c.verifyToken(ctx, token)
	if ctx.Err() != nil {
		outcome, reason = Canceled, "request_canceled"
	} else if outcome == Temporary && c.passOnError {
		outcome = AllowedOnError
	}
	return Result{Outcome: outcome, Reason: reason, ProviderStatus: status}
}

func (c *Client) verifyToken(ctx context.Context, token string) (Outcome, string, int) {
	body, err := json.Marshal(map[string]string{"response": token, "private_key": c.privateKey})
	if err != nil {
		return Unavailable, "request_encoding", 0
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://captcha.ddos-guard.net/siteverify", bytes.NewReader(body))
	if err != nil {
		return Unavailable, "request_creation", 0
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		result, reason := networkFailure(ctx, err)
		return result, reason, 0
	}
	defer res.Body.Close()
	status := res.StatusCode
	if status >= 500 && status <= 599 {
		return Temporary, "provider_5xx", status
	}
	if status != http.StatusOK {
		return Unavailable, "unexpected_status", status
	}
	const limit = 16 << 10
	raw, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		result, reason := networkFailure(ctx, err)
		return result, reason, status
	}
	var reply struct {
		Success *bool    `json:"success"`
		Codes   []string `json:"error-codes"`
	}
	if len(raw) > limit || json.Unmarshal(raw, &reply) != nil || reply.Success == nil {
		return Unavailable, "invalid_reply", status
	}
	if *reply.Success {
		if len(reply.Codes) > 0 {
			return Unavailable, "inconsistent_reply", status
		}
		return Verified, "success", status
	}
	for _, code := range reply.Codes {
		switch code {
		case "missing-input-response", "invalid-input-response", "timeout-or-duplicate":
		case "missing-input-secret", "invalid-input-secret", "bad-request":
			return Unavailable, code, status
		default:
			return Unavailable, "unknown_provider_error", status
		}
	}
	return Invalid, "token_rejected", status
}

func networkFailure(ctx context.Context, err error) (Outcome, string) {
	if ctx.Err() != nil {
		return Canceled, "request_canceled"
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return Temporary, "timeout"
	}
	if errors.Is(err, syscall.ECONNREFUSED) || errors.Is(err, syscall.ECONNRESET) || errors.Is(err, syscall.ENETUNREACH) || errors.Is(err, syscall.EHOSTUNREACH) {
		return Temporary, "connection_unavailable"
	}
	var dns *net.DNSError
	if errors.As(err, &dns) && dns.IsTemporary {
		return Temporary, "dns_unavailable"
	}
	return Unavailable, "transport_error"
}
