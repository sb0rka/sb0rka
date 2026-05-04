package query

import "testing"

func TestValidateSQLAllowsReadOnlyQueries(t *testing.T) {
	tests := []string{
		"SELECT 1",
		"with rows as (select 1) select * from rows",
		"SHOW search_path",
		"EXPLAIN SELECT 1",
		"-- comment\nSELECT 1;",
		"/* comment */ SELECT 1",
		"SELECT ';' AS semicolon",
	}

	for _, sql := range tests {
		t.Run(sql, func(t *testing.T) {
			if err := ValidateSQL(sql); err != nil {
				t.Fatalf("expected query to be allowed: %v", err)
			}
		})
	}
}

func TestValidateSQLRejectsUnsafeQueries(t *testing.T) {
	tests := []string{
		"",
		"INSERT INTO things VALUES (1)",
		"UPDATE things SET name = 'x'",
		"DELETE FROM things",
		"SELECT 1; SELECT 2",
		"SELECT 1; DROP TABLE things",
	}

	for _, sql := range tests {
		t.Run(sql, func(t *testing.T) {
			if err := ValidateSQL(sql); err == nil {
				t.Fatal("expected query to be rejected")
			}
		})
	}
}
