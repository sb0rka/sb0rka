module github.com/sb0rka/sb0rka/apps/s0c

go 1.25.5

require (
	github.com/sb0rka/sb0rka/packages/contract v0.0.1
	github.com/spf13/cobra v1.10.2
	golang.org/x/term v0.45.0
)

require (
	github.com/google/uuid v1.6.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	golang.org/x/sys v0.47.0 // indirect
)

replace github.com/sb0rka/sb0rka/packages/contract => ../../packages/contract

replace github.com/sb0rka/sb0rka/packages/core => ../../packages/core
