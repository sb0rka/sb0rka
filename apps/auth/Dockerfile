## Build context = repository root.
## Build: docker build -f apps/auth/Dockerfile <repo root>
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/contract,github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY apps/auth/go.mod apps/auth/go.sum ./apps/auth/
COPY packages/contract ./packages/contract
COPY packages/core ./packages/core

WORKDIR /src/apps/auth

RUN go mod download

COPY apps/auth/cmd ./cmd
COPY apps/auth/internal ./internal
COPY apps/auth/pkg ./pkg

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/auth ./cmd/auth

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/auth /app/auth

EXPOSE 8020

USER app

CMD ["/app/auth"]
