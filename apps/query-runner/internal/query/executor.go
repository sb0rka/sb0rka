package query

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
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

	response := runner.QueryResponse{
		Columns: columns,
		Rows:    make([][]any, 0),
	}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to read query row", err)
		}
		row := normalizeRow(values)
		if len(response.Rows) >= e.MaxRows {
			response.Truncated = true
			break
		}
		next := response
		next.Rows = append(next.Rows, row)
		next.RowCount = len(next.Rows)
		if exceedsResponseSize(next, e.MaxResponseBytes) {
			response.Truncated = true
			break
		}
		response.Rows = next.Rows
		response.RowCount = next.RowCount
	}
	if err := rows.Err(); err != nil {
		return runner.QueryResponse{}, queryError(err)
	}
	if e.DangerAllowAllQueries {
		if err := tx.Commit(queryCtx); err != nil {
			return runner.QueryResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to commit query transaction", err)
		}
	}

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
		return runner.NewStatusError(http.StatusGatewayTimeout, "Database query timed out", err)
	}
	return runner.NewStatusError(http.StatusBadGateway, "Database query failed", err)
}

func normalizeRow(values []any) []any {
	row := make([]any, len(values))
	for i, value := range values {
		switch typed := value.(type) {
		case []byte:
			row[i] = string(typed)
		default:
			row[i] = typed
		}
	}
	return row
}

func exceedsResponseSize(response runner.QueryResponse, maxBytes int) bool {
	payload, err := json.Marshal(response)
	if err != nil {
		return true
	}
	return len(payload) > maxBytes
}
