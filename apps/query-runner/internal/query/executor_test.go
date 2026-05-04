package query

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"testing"
	"time"

	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

// testMarshalFail is used to force json.Marshal to fail in tests.
type testMarshalFail struct{}

func (testMarshalFail) MarshalJSON() ([]byte, error) {
	return nil, errors.New("marshal failed")
}

func TestResponseExceedsMaxBytes(t *testing.T) {
	response := runner.QueryResponse{
		Columns:  []string{"value"},
		Rows:     [][]any{{"a large value"}},
		RowCount: 1,
	}

	over, err := responseExceedsMaxBytes(response, 16)
	if err != nil {
		t.Fatal(err)
	}
	if !over {
		t.Fatal("expected response to exceed tiny byte cap")
	}
	over, err = responseExceedsMaxBytes(response, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if over {
		t.Fatal("expected response to fit larger byte cap")
	}
}

func TestResponseExceedsMaxBytesMarshalError(t *testing.T) {
	_, err := responseExceedsMaxBytes(runner.QueryResponse{
		Columns: []string{"x"},
		Rows:    [][]any{{testMarshalFail{}}},
	}, 100)
	if err == nil {
		t.Fatal("expected marshal error")
	}
	var se *runner.StatusError
	if !errors.As(err, &se) || se.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected StatusBadGateway StatusError, got %v", err)
	}
	if se.Message != "Failed to serialize query result" {
		t.Fatalf("unexpected message %q", se.Message)
	}
}

func TestNormalizeRowConvertsBytesToString(t *testing.T) {
	row, err := normalizeRow([]any{[]byte("hello"), int64(1)})
	if err != nil {
		t.Fatal(err)
	}
	if row[0] != "hello" {
		t.Fatalf("expected byte slice to become string, got %#v", row[0])
	}
	if row[1] != int64(1) {
		t.Fatalf("unexpected second value %#v", row[1])
	}
}

func TestNormalizeRowFloatNaNInfToNull(t *testing.T) {
	row, err := normalizeRow([]any{math.NaN(), math.Inf(1), float32(math.NaN())})
	if err != nil {
		t.Fatal(err)
	}
	if row[0] != nil || row[1] != nil || row[2] != nil {
		t.Fatalf("expected nil for NaN/Inf, got %#v %#v %#v", row[0], row[1], row[2])
	}
}

func TestNormalizeRowMarshalsTimeAndPrimitives(t *testing.T) {
	ts := time.Date(2024, 3, 15, 12, 30, 0, 0, time.UTC)
	row, err := normalizeRow([]any{ts, true, "x"})
	if err != nil {
		t.Fatal(err)
	}
	resp := runner.QueryResponse{Columns: []string{"a", "b", "c"}, Rows: [][]any{row}}
	if _, err := json.Marshal(resp); err != nil {
		t.Fatalf("expected marshalable response: %v", err)
	}
}

func TestNormalizeRowRejectsNonSerializable(t *testing.T) {
	_, err := normalizeRow([]any{make(chan int)})
	if err == nil {
		t.Fatal("expected error for chan value")
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

func TestEstimateValueJSONSize(t *testing.T) {
	tests := []struct {
		name     string
		value    any
		expected int
	}{
		{"nil", nil, 4},               // "null"
		{"bool true", true, 4},        // "true"
		{"bool false", false, 5},      // "false"
		{"empty string", "", 2},       // ""
		{"simple string", "hello", 7}, // "hello" + quotes
		{"int", 123, 3},
		{"int64", int64(123456), 6},
		{"float64", 123.456, 7}, // approximate
		{"negative int", -42, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := estimateValueJSONSize(tt.value)
			// Allow some tolerance for string escape estimates and float formatting
			tolerance := 2
			if actual < tt.expected-tolerance || actual > tt.expected+tolerance {
				t.Errorf("estimateValueJSONSize(%v) = %d, expected ~%d", tt.value, actual, tt.expected)
			}
		})
	}
}

func TestEstimateRowJSONSize(t *testing.T) {
	tests := []struct {
		name string
		row  []any
		min  int // minimum expected size
		max  int // maximum expected size
	}{
		{"empty row", []any{}, 2, 2},                        // []
		{"single value", []any{"hello"}, 8, 10},             // ["hello"]
		{"multiple values", []any{1, "test", true}, 12, 16}, // [1,"test",true]
		{"mixed types", []any{nil, 42, false, "world"}, 20, 25},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := estimateRowJSONSize(tt.row)
			if actual < tt.min || actual > tt.max {
				t.Errorf("estimateRowJSONSize(%v) = %d, expected between %d and %d", tt.row, actual, tt.min, tt.max)
			}
		})
	}
}

func TestEstimateResponseJSONSize(t *testing.T) {
	response := runner.QueryResponse{
		Columns:    []string{"id", "name"},
		Rows:       [][]any{{1, "Alice"}, {2, "Bob"}},
		RowCount:   2,
		DurationMS: 100,
		Truncated:  false,
	}

	estimated := estimateResponseJSONSize(response)
	if estimated < 50 || estimated > 150 {
		t.Errorf("estimateResponseJSONSize() = %d, expected reasonable size between 50-150", estimated)
	}

	// Test empty response
	emptyResponse := runner.QueryResponse{
		Columns: []string{},
		Rows:    [][]any{},
	}
	emptyEstimated := estimateResponseJSONSize(emptyResponse)
	if emptyEstimated < 50 || emptyEstimated > 120 {
		t.Errorf("empty response size estimate = %d, expected between 50-120", emptyEstimated)
	}
}

func TestFastExceedsResponseSize(t *testing.T) {
	// Create a response with known size
	response := runner.QueryResponse{
		Columns:  []string{"value"},
		Rows:     [][]any{{"test"}},
		RowCount: 1,
	}

	// Test with very small limit - should exceed
	exceeds, err := fastExceedsResponseSize(response, 10)
	if err != nil {
		t.Fatal(err)
	}
	if !exceeds {
		t.Error("expected response to exceed 10 bytes")
	}

	// Test with very large limit - should not exceed
	exceeds, err = fastExceedsResponseSize(response, 10000)
	if err != nil {
		t.Fatal(err)
	}
	if exceeds {
		t.Error("expected response to fit in 10000 bytes")
	}

	// Test with medium limit to trigger exact check path
	actualJSON, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	actualSize := len(actualJSON)

	testLimit := actualSize + 5
	result, err := fastExceedsResponseSize(response, testLimit)
	if err != nil {
		t.Fatal(err)
	}
	exactResult, err := responseExceedsMaxBytes(response, testLimit)
	if err != nil {
		t.Fatal(err)
	}
	if result != exactResult {
		t.Errorf("fastExceedsResponseSize() = %t, but responseExceedsMaxBytes() = %t for limit %d (actual size: %d)",
			result, exactResult, testLimit, actualSize)
	}
}

func TestMemoryOptimizationAccuracy(t *testing.T) {
	// Test that our estimation is reasonably accurate compared to actual JSON marshaling
	testCases := []runner.QueryResponse{
		{
			Columns: []string{"id", "name", "email"},
			Rows: [][]any{
				{1, "John Doe", "john@example.com"},
				{2, "Jane Smith", "jane@example.com"},
				{3, "Bob Johnson", "bob@example.com"},
			},
			RowCount:   3,
			DurationMS: 50,
		},
		{
			Columns: []string{"data"},
			Rows: [][]any{
				{"short"},
				{"a much longer string with more content"},
				{nil},
				{true},
				{123456789},
			},
			RowCount:   5,
			DurationMS: 25,
		},
	}

	for i, response := range testCases {
		t.Run(fmt.Sprintf("case_%d", i), func(t *testing.T) {
			estimated := estimateResponseJSONSize(response)

			// Get actual size
			actual, err := json.Marshal(response)
			if err != nil {
				t.Fatalf("failed to marshal response: %v", err)
			}
			actualSize := len(actual)

			// Allow up to 40% difference between estimate and actual (estimation is conservative)
			tolerance := float64(actualSize) * 0.4
			diff := float64(abs(estimated - actualSize))

			if diff > tolerance {
				t.Errorf("estimation accuracy: estimated=%d, actual=%d, diff=%d (%.1f%%), tolerance=%.1f",
					estimated, actualSize, abs(estimated-actualSize),
					(diff/float64(actualSize))*100, tolerance)
			}
		})
	}
}

// Helper function for absolute difference
func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
