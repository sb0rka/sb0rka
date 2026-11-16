package db

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"
)

// AuthenticationAttempt consumes one attempt in a fixed window shared by all
// Auth replicas. Only a hash of the account/IP bucket is persisted.
func (p *PsqlDB) AuthenticationAttempt(ctx context.Context, bucket string, limit int, window time.Duration) (time.Duration, error) {
	if bucket == "" || len(bucket) > 512 || limit < 1 || limit > 1_000_000 || window < time.Second || window > 24*time.Hour {
		return 0, fmt.Errorf("invalid authentication attempt policy")
	}
	digest := sha256.Sum256([]byte(bucket))
	const query = `
		INSERT INTO authentication_attempts AS a (bucket_hash, attempts, expires_at)
		VALUES ($1, 1, NOW() + make_interval(secs => $3))
		ON CONFLICT (bucket_hash) DO UPDATE SET
			attempts = CASE WHEN a.expires_at <= NOW() THEN 1 ELSE LEAST(a.attempts, $2) + 1 END,
			expires_at = CASE WHEN a.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE a.expires_at END
		RETURNING CASE WHEN attempts <= $2 THEN 0
			ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())))::bigint) END
	`
	var seconds int64
	if err := p.pool.QueryRow(ctx, query, digest[:], limit, window.Seconds()).Scan(&seconds); err != nil {
		return 0, err
	}
	// Finish the counter transaction before garbage collection. Otherwise two
	// requests reusing old buckets can each lock the other's cleanup candidate.
	_, err := p.pool.Exec(ctx, `
		WITH obsolete AS (
			SELECT bucket_hash FROM authentication_attempts
			WHERE expires_at < NOW() - INTERVAL '1 day'
			ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
		)
		DELETE FROM authentication_attempts a USING obsolete o
		WHERE a.bucket_hash = o.bucket_hash
	`)
	if err != nil {
		return 0, err
	}
	return time.Duration(seconds) * time.Second, nil
}
