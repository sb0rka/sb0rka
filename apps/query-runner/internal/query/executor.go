package query

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

type Executor struct {
	ConnectTimeout        time.Duration
	QueryTimeout          time.Duration
	MaxRows               int
	MaxResponseBytes      int
	DangerAllowAllQueries bool
}

func (e *Executor) Query(ctx context.Context, uri string, sql string) (runner.QueryResponse, error) {
	if err := e.validateSQL(sql); err != nil {
		return runner.QueryResponse{}, err
	}

	connectCtx, cancelConnect := context.WithTimeout(ctx, e.ConnectTimeout)
	defer cancelConnect()

	cfg, err := pgx.ParseConfig(uri)
	if err != nil {
		return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Invalid database connection URI", err)
	}
	conn, err := pgx.ConnectConfig(connectCtx, cfg)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusGatewayTimeout, "Database connect timed out", err)
		}
		return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to connect to database", err)
	}
	defer func() {
		closeCtx, cancelClose := context.WithTimeout(context.Background(), e.ConnectTimeout)
		defer cancelClose()
		_ = conn.Close(closeCtx)
	}()

	queryCtx, cancelQuery := context.WithTimeout(ctx, e.QueryTimeout)
	defer cancelQuery()

	startedAt := time.Now()
	txOptions := pgx.TxOptions{AccessMode: pgx.ReadOnly}
	if e.DangerAllowAllQueries {
		txOptions.AccessMode = pgx.ReadWrite
	}
	tx, err := conn.BeginTx(queryCtx, txOptions)
	if err != nil {
		return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to start query transaction", err)
	}
	defer func() {
		rollbackCtx, cancelRollback := context.WithTimeout(context.Background(), e.ConnectTimeout)
		defer cancelRollback()
		_ = tx.Rollback(rollbackCtx)
	}()

	if _, err := tx.Exec(queryCtx, fmt.Sprintf("SET LOCAL statement_timeout = '%dms'", e.QueryTimeout.Milliseconds())); err != nil {
		return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to configure query timeout", err)
	}

	rows, err := tx.Query(queryCtx, sql)
	if err != nil {
		return runner.QueryResponse{}, queryError(err)
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	columns := make([]string, 0, len(fields))
	for _, field := range fields {
		columns = append(columns, field.Name)
	}

	// Pre-allocate response with reasonable capacity to avoid multiple reallocations
	initialCapacity := e.MaxRows
	if initialCapacity > 1000 {
		initialCapacity = 1000 // Don't pre-allocate too much for very large limits
	}

	response := runner.QueryResponse{
		Columns: columns,
		Rows:    make([][]any, 0, initialCapacity),
	}

	// Estimate initial response size (base structure + columns)
	estimatedSize := estimateResponseJSONSize(response)

	// Check response size every N rows to balance accuracy vs performance
	const sizeCheckInterval = 50

	for rows.Next() {
		if len(response.Rows) >= e.MaxRows {
			response.Truncated = true
			break
		}

		values, err := rows.Values()
		if err != nil {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to read query row", err)
		}
		row, err := normalizeRow(values)
		if err != nil {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to normalize query row", err)
		}

		// Estimate row size to avoid expensive marshaling
		estimatedRowSize := estimateRowJSONSize(row)
		if estimatedSize+estimatedRowSize > e.MaxResponseBytes {
			response.Truncated = true
			break
		}

		// Add the row
		response.Rows = append(response.Rows, row)
		estimatedSize += estimatedRowSize

		// Periodically check exact size to correct estimation drift
		if len(response.Rows)%sizeCheckInterval == 0 {
			exceeds, err := fastExceedsResponseSize(response, e.MaxResponseBytes)
			if err != nil {
				return runner.QueryResponse{}, err
			}
			if exceeds {
				for len(response.Rows) > 0 {
					response.Rows = response.Rows[:len(response.Rows)-1]
					over, err := responseExceedsMaxBytes(response, e.MaxResponseBytes)
					if err != nil {
						return runner.QueryResponse{}, err
					}
					if !over {
						break
					}
				}
				response.Truncated = true
				break
			}
			// Update estimated size with actual size to reduce drift
			estimatedSize = estimateResponseJSONSize(response)
		}
	}
	if err := rows.Err(); err != nil {
		return runner.QueryResponse{}, queryError(err)
	}
	if e.DangerAllowAllQueries {
		if err := tx.Commit(queryCtx); err != nil {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to commit query transaction", err)
		}
	}

	response.RowCount = len(response.Rows)
	response.DurationMS = time.Since(startedAt).Milliseconds()
	return response, nil
}

func (e *Executor) validateSQL(sql string) error {
	if e.DangerAllowAllQueries {
		return nil
	}
	return ValidateSQL(sql)
}

func queryError(err error) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return &runner.SQLQueryFailure{
			StatusError: runner.NewStatusError(http.StatusGatewayTimeout, "Database query timed out", err),
		}
	}
	return &runner.SQLQueryFailure{
		StatusError: runner.NewStatusError(http.StatusBadGateway, "Database query failed", err),
	}
}

func normalizeRow(values []any) ([]any, error) {
	row := make([]any, len(values))
	for i, value := range values {
		nv, err := normalizeValue(value)
		if err != nil {
			return nil, err
		}
		row[i] = nv
	}
	return row, nil
}

func normalizeValue(value any) (any, error) {
	switch v := value.(type) {
	case nil:
		return nil, nil
	case []byte:
		return string(v), nil
	case float32:
		f := float64(v)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, nil
		}
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, nil
		}
		return v, nil
	default:
		if _, err := json.Marshal(v); err != nil {
			return nil, fmt.Errorf("value not JSON-serializable: %w", err)
		}
		return v, nil
	}
}

// estimateValueJSONSize estimates the JSON serialized size of a value without marshaling
func estimateValueJSONSize(value any) int {
	switch v := value.(type) {
	case nil:
		return 4 // "null"
	case bool:
		if v {
			return 4 // "true"
		}
		return 5 // "false"
	case string:
		// Add 2 for quotes, minimal escape overhead for typical data
		return len(v) + 2
	case int:
		return len(strconv.Itoa(v))
	case int8:
		return len(strconv.Itoa(int(v)))
	case int16:
		return len(strconv.Itoa(int(v)))
	case int32:
		return len(strconv.Itoa(int(v)))
	case int64:
		return len(strconv.FormatInt(v, 10))
	case uint:
		return len(strconv.FormatUint(uint64(v), 10))
	case uint8:
		return len(strconv.FormatUint(uint64(v), 10))
	case uint16:
		return len(strconv.FormatUint(uint64(v), 10))
	case uint32:
		return len(strconv.FormatUint(uint64(v), 10))
	case uint64:
		return len(strconv.FormatUint(v, 10))
	case float32:
		f := float64(v)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return 4
		}
		return len(strconv.FormatFloat(f, 'g', -1, 32))
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 4 // "null" for NaN/Inf
		}
		return len(strconv.FormatFloat(v, 'g', -1, 64))
	default:
		// Fallback to JSON marshaling for complex types (arrays, objects, etc.)
		b, err := json.Marshal(value)
		if err != nil {
			return 10 // rough estimate for unknown types
		}
		return len(b)
	}
}

// estimateRowJSONSize estimates the JSON size of a row without full marshaling
func estimateRowJSONSize(row []any) int {
	size := 2 // for [ ]
	for i, value := range row {
		if i > 0 {
			size += 1 // comma separator
		}
		size += estimateValueJSONSize(value)
	}
	return size
}

// estimateResponseJSONSize estimates the total response size without full marshaling
func estimateResponseJSONSize(response runner.QueryResponse) int {
	// Start with base structure size
	size := 80 // {"columns":[],"rows":[],"duration_ms":0,"row_count":0,"truncated":false}

	// Estimate columns size
	for i, col := range response.Columns {
		if i > 0 {
			size += 1 // comma
		}
		size += len(col) + 2 // quotes
	}

	// Estimate rows size
	for i, row := range response.Rows {
		if i > 0 {
			size += 1 // comma between rows
		}
		size += estimateRowJSONSize(row)
	}

	// Add space for numeric fields (duration_ms, row_count)
	size += 20

	return size
}

// responseExceedsMaxBytes checks if marshaled response is larger than maxBytes.
func responseExceedsMaxBytes(response runner.QueryResponse, maxBytes int) (bool, error) {
	payload, err := json.Marshal(response)
	if err != nil {
		return false, runner.NewStatusError(http.StatusBadGateway, "Failed to serialize query result", err)
	}
	return len(payload) > maxBytes, nil
}

// fastExceedsResponseSize uses estimation for quick size checks, falls back to exact if close to limit
func fastExceedsResponseSize(response runner.QueryResponse, maxBytes int) (bool, error) {
	estimated := estimateResponseJSONSize(response)

	// If estimation shows we're well under the limit (with safety margin), no need for exact check
	if estimated < int(float64(maxBytes)*0.7) {
		return false, nil
	}

	// If estimation shows we're well over the limit, no need for exact check
	if estimated > int(float64(maxBytes)*1.3) {
		return true, nil
	}

	// Close to limit or uncertain - use exact marshaling
	return responseExceedsMaxBytes(response, maxBytes)
}
