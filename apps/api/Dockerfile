## Build context = repository root.
## Build: docker build -f apps/api/Dockerfile <repo root>
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/contract,github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY apps/api/go.mod apps/api/go.sum ./apps/api/
COPY packages/contract ./packages/contract
COPY packages/core ./packages/core

WORKDIR /src/apps/api

RUN go mod download

COPY apps/api/cmd ./cmd
COPY apps/api/internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/api /app/api

EXPOSE 8080

USER app

CMD ["/app/api"]
