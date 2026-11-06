//go:build securityintegration

package db

import (
	"context"
	"crypto/sha256"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAuthenticationAttemptsAreAtomicAcrossReplicas(t *testing.T) {
	if os.Getenv("VULN_CHECK_ISOLATED_DB") != "1" {
		t.Fatal("requires an isolated database")
	}
	uri := os.Getenv("VULN_CHECK_DATABASE_URI")
	first, err := NewPsqlDB(uri, 2, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := NewPsqlDB(uri, 2, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	bucket := "test:" + uuid.NewString()
	digest := sha256.Sum256([]byte(bucket))
	defer func() {
		if _, err := first.pool.Exec(context.Background(), "DELETE FROM authentication_attempts WHERE bucket_hash=$1", digest[:]); err != nil {
			t.Error(err)
		}
	}()
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			db := first
			if i%2 == 1 {
				db = second
			}
			retry, err := db.AuthenticationAttempt(context.Background(), bucket, 10, time.Minute)
			if err != nil {
				t.Error(err)
				return
			}
			if retry == 0 {
				accepted.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if accepted.Load() != 10 {
		t.Fatalf("accepted=%d, want 10", accepted.Load())
	}
	var before time.Time
	if err := first.pool.QueryRow(t.Context(), "SELECT expires_at FROM authentication_attempts WHERE bucket_hash=$1", digest[:]).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if retry, err := second.AuthenticationAttempt(t.Context(), bucket, 10, time.Minute); err != nil || retry <= 0 {
		t.Fatal("denial did not survive across replicas")
	}
	var after time.Time
	if err := first.pool.QueryRow(t.Context(), "SELECT expires_at FROM authentication_attempts WHERE bucket_hash=$1", digest[:]).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if !before.Equal(after) {
		t.Fatal("denial extended lockout")
	}
	if _, err := first.pool.Exec(t.Context(), "UPDATE authentication_attempts SET expires_at=now()-interval '1 second' WHERE bucket_hash=$1", digest[:]); err != nil {
		t.Fatal(err)
	}
	if retry, err := second.AuthenticationAttempt(t.Context(), bucket, 10, time.Minute); err != nil || retry != 0 {
		t.Fatal("expired window did not reset")
	}
}
