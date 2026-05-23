package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type Executor struct {
	ConnectTimeout        time.Duration
	QueryTimeout          time.Duration
	MaxRows               int
	MaxResponseBytes      int
	DangerAllowAllQueries bool
}

func (e *Executor) Query(ctx context.Context, uri string, sql string) (QueryResponse, error) {
	if err := e.validateSQL(sql); err != nil {
		return QueryResponse{}, err
	}

	connectCtx, cancelConnect := context.WithTimeout(ctx, e.ConnectTimeout)
	defer cancelConnect()

	cfg, err := pgx.ParseConfig(uri)
	if err != nil {
		return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Invalid database connection URI", err)
	}
	conn, err := pgx.ConnectConfig(connectCtx, cfg)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return QueryResponse{}, NewStatusError(http.StatusGatewayTimeout, "Database connect timed out", err)
		}
		return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to connect to database", err)
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
		return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to start query transaction", err)
	}
	defer func() {
		rollbackCtx, cancelRollback := context.WithTimeout(context.Background(), e.ConnectTimeout)
		defer cancelRollback()
		_ = tx.Rollback(rollbackCtx)
	}()

	if _, err := tx.Exec(queryCtx, fmt.Sprintf("SET LOCAL statement_timeout = '%dms'", e.QueryTimeout.Milliseconds())); err != nil {
		return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to configure query timeout", err)
	}

	rows, err := tx.Query(queryCtx, sql)
	if err != nil {
		return QueryResponse{}, queryError(err)
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	columns := make([]string, 0, len(fields))
	for _, field := range fields {
		columns = append(columns, field.Name)
	}

	initialCapacity := e.MaxRows
	if initialCapacity > 1000 {
		initialCapacity = 1000
	}

	response := QueryResponse{
		Columns: columns,
		Rows:    make([][]any, 0, initialCapacity),
	}

	responseSize, err := marshaledResponseSize(response)
	if err != nil {
		return QueryResponse{}, err
	}

	for rows.Next() {
		if len(response.Rows) >= e.MaxRows {
			if err := discardRemainingRows(rows); err != nil {
				return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to read query row", err)
			}
			return QueryResponse{}, rowLimitError(e.MaxRows)
		}

		values, err := rows.Values()
		if err != nil {
			return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to read query row", err)
		}
		row, err := normalizeRow(values)
		if err != nil {
			return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to normalize query row", err)
		}

		rowPayload, err := json.Marshal(row)
		if err != nil {
			return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to serialize query row", err)
		}
		rowDelta := len(rowPayload)
		if len(response.Rows) > 0 {
			rowDelta++
		}
		if responseSize+rowDelta > e.MaxResponseBytes {
			response.Truncated = true
			break
		}

		response.Rows = append(response.Rows, row)
		responseSize += rowDelta
	}
	if err := rows.Err(); err != nil {
		return QueryResponse{}, queryError(err)
	}
	if response.Truncated {
		if err := discardRemainingRows(rows); err != nil {
			return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to read query row", err)
		}
	}
	if e.DangerAllowAllQueries {
		if err := tx.Commit(queryCtx); err != nil {
			return QueryResponse{}, NewStatusError(http.StatusBadGateway, "Failed to commit query transaction", err)
		}
	}

	response.RowCount = len(response.Rows)
	response.DurationMS = time.Since(startedAt).Milliseconds()
	if err := trimResponseToMaxBytes(&response, e.MaxResponseBytes); err != nil {
		return QueryResponse{}, err
	}
	return response, nil
}

func (e *Executor) validateSQL(sql string) error {
	if e.DangerAllowAllQueries {
		return nil
	}
	return ValidateSQL(sql)
}

func rowLimitError(maxRows int) error {
	return NewStatusError(
		http.StatusRequestEntityTooLarge,
		fmt.Sprintf("Query result exceeds row limit (max %d rows)", maxRows),
		nil,
	)
}

func discardRemainingRows(rows pgx.Rows) error {
	for rows.Next() {
		if _, err := rows.Values(); err != nil {
			return err
		}
	}
	return rows.Err()
}

func queryError(err error) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return &SQLQueryFailure{
			StatusError: NewStatusError(http.StatusGatewayTimeout, "Database query timed out", err),
		}
	}
	return &SQLQueryFailure{
		StatusError: NewStatusError(http.StatusBadGateway, "Database query failed", err),
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

func marshaledResponseSize(response QueryResponse) (int, error) {
	payload, err := json.Marshal(response)
	if err != nil {
		return 0, NewStatusError(http.StatusBadGateway, "Failed to serialize query result", err)
	}
	return len(payload), nil
}

func trimResponseToMaxBytes(response *QueryResponse, maxBytes int) error {
	for {
		size, err := marshaledResponseSize(*response)
		if err != nil {
			return err
		}
		if size <= maxBytes {
			return nil
		}
		if len(response.Rows) == 0 {
			return NewStatusError(http.StatusRequestEntityTooLarge, "Query result exceeds response size limit", nil)
		}
		response.Rows = response.Rows[:len(response.Rows)-1]
		response.RowCount = len(response.Rows)
		response.Truncated = true
	}
}
