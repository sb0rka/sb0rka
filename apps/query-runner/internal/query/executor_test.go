package query

import (
	"net/http"
	"testing"

	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

func TestExceedsResponseSize(t *testing.T) {
	response := runner.QueryResponse{
		Columns:  []string{"value"},
		Rows:     [][]any{{"a large value"}},
		RowCount: 1,
	}

	if !exceedsResponseSize(response, 16) {
		t.Fatal("expected response to exceed tiny byte cap")
	}
	if exceedsResponseSize(response, 1024) {
		t.Fatal("expected response to fit larger byte cap")
	}
}

func TestNormalizeRowConvertsBytesToString(t *testing.T) {
	row := normalizeRow([]any{[]byte("hello"), int64(1)})
	if row[0] != "hello" {
		t.Fatalf("expected byte slice to become string, got %#v", row[0])
	}
	if row[1] != int64(1) {
		t.Fatalf("unexpected second value %#v", row[1])
	}
}

func TestExecutorValidateSQLBlocksWritesByDefault(t *testing.T) {
	executor := &Executor{}

	err := executor.validateSQL("DROP TABLE users")
	if err == nil {
		t.Fatal("expected write query to be rejected")
	}

	status, message := runner.ErrorStatus(err)
	if status != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, status)
	}
	if message != "Only read-only query statements are allowed" {
		t.Fatalf("unexpected error message %q", message)
	}
}

func TestExecutorValidateSQLAllowsWritesInDangerMode(t *testing.T) {
	executor := &Executor{DangerAllowAllQueries: true}

	if err := executor.validateSQL("DROP TABLE users"); err != nil {
		t.Fatalf("expected danger mode to allow write query, got %v", err)
	}
}
