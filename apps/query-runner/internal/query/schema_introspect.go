package query

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

const schemaIntrospectionSQL = `
SELECT
	c.table_schema,
	c.table_name,
	c.column_name,
	c.data_type,
	c.is_nullable,
	EXISTS (
		SELECT 1
		FROM information_schema.table_constraints tc
		INNER JOIN information_schema.key_column_usage kcu
			ON tc.constraint_catalog = kcu.constraint_catalog
			AND tc.constraint_schema = kcu.constraint_schema
			AND tc.constraint_name = kcu.constraint_name
		WHERE tc.table_schema = c.table_schema
			AND tc.table_name = c.table_name
			AND tc.constraint_type = 'PRIMARY KEY'
			AND kcu.column_name = c.column_name
	) AS is_pk
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`

// IntrospectSchema returns base tables and columns from PostgreSQL information_schema (read-only).
func (e *Executor) IntrospectSchema(ctx context.Context, uri string) (runner.SchemaResponse, error) {
	startedAt := time.Now()

	connectCtx, cancelConnect := context.WithTimeout(ctx, e.ConnectTimeout)
	defer cancelConnect()

	cfg, err := pgx.ParseConfig(uri)
	if err != nil {
		return runner.SchemaResponse{}, runner.NewStatusError(http.StatusBadGateway, "Invalid database connection URI", err)
	}
	conn, err := pgx.ConnectConfig(connectCtx, cfg)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return runner.SchemaResponse{}, runner.NewStatusError(http.StatusGatewayTimeout, "Database connect timed out", err)
		}
		return runner.SchemaResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to connect to database", err)
	}
	defer func() {
		closeCtx, cancelClose := context.WithTimeout(context.Background(), e.ConnectTimeout)
		defer cancelClose()
		_ = conn.Close(closeCtx)
	}()

	queryCtx, cancelQuery := context.WithTimeout(ctx, e.QueryTimeout)
	defer cancelQuery()

	tx, err := conn.BeginTx(queryCtx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return runner.SchemaResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to start read transaction", err)
	}
	defer func() {
		rollbackCtx, cancelRollback := context.WithTimeout(context.Background(), e.ConnectTimeout)
		defer cancelRollback()
		_ = tx.Rollback(rollbackCtx)
	}()

	if _, err := tx.Exec(queryCtx, fmt.Sprintf("SET LOCAL statement_timeout = '%dms'", e.QueryTimeout.Milliseconds())); err != nil {
		return runner.SchemaResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to configure query timeout", err)
	}

	rows, err := tx.Query(queryCtx, schemaIntrospectionSQL)
	if err != nil {
		return runner.SchemaResponse{}, queryError(err)
	}
	defer rows.Close()

	type tableKey struct {
		schema string
		name   string
	}
	order := make([]tableKey, 0)
	seen := make(map[tableKey]int)
	tablesMap := make(map[tableKey][]runner.SchemaColumn)

	for rows.Next() {
		var tableSchema, tableName, columnName, dataType, isNullable string
		var isPK bool
		if err := rows.Scan(&tableSchema, &tableName, &columnName, &dataType, &isNullable, &isPK); err != nil {
			return runner.SchemaResponse{}, runner.NewStatusError(http.StatusBadGateway, "Failed to read schema row", err)
		}
		key := tableKey{schema: tableSchema, name: tableName}
		if _, ok := seen[key]; !ok {
			seen[key] = len(order)
			order = append(order, key)
		}
		nullable := isNullable == "YES"
		tablesMap[key] = append(tablesMap[key], runner.SchemaColumn{
			Name:       columnName,
			DataType:   dataType,
			IsNullable: nullable,
			IsPK:       isPK,
		})
	}
	if err := rows.Err(); err != nil {
		return runner.SchemaResponse{}, queryError(err)
	}

	out := make([]runner.SchemaTable, 0, len(order))
	for _, key := range order {
		out = append(out, runner.SchemaTable{
			Schema:  key.schema,
			Name:    key.name,
			Columns: tablesMap[key],
		})
	}

	return runner.SchemaResponse{
		Tables:     out,
		DurationMS: time.Since(startedAt).Milliseconds(),
	}, nil
}
