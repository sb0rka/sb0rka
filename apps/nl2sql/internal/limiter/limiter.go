package limiter

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

type Limiter struct {
	mu            sync.Mutex
	ratePerSecond float64
	burst         float64
	buckets       map[string]*bucket
}

type bucket struct {
	tokens   float64
	lastSeen time.Time
}

func New(ratePerSecond float64, burst int) *Limiter {
	return &Limiter{
		ratePerSecond: ratePerSecond,
		burst:         float64(burst),
		buckets:       make(map[string]*bucket),
	}
}

func (l *Limiter) Allow(key string) bool {
	if l == nil {
		return true
	}

	h := hashKey(key)
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[h]
	if !ok {
		l.buckets[h] = &bucket{tokens: l.burst - 1, lastSeen: now}
		return true
	}

	elapsed := now.Sub(b.lastSeen).Seconds()
	b.tokens += elapsed * l.ratePerSecond
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.lastSeen = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func hashKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:8])
}
