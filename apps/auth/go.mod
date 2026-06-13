module github.com/sb0rka/sb0rka/apps/auth

go 1.25.5

require (
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.6
	github.com/sb0rka/sb0rka/packages/contract v0.0.8
	golang.org/x/crypto v0.37.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.13.0 // indirect
	golang.org/x/sys v0.32.0 // indirect
	golang.org/x/text v0.24.0 // indirect
)

replace github.com/sb0rka/sb0rka/packages/contract => /home/ubuntu/wk/sb0rka/gh/sb0rka/packages/contract
