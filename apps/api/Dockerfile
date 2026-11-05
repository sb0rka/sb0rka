## Build context = repository root.
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/contract,github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY --from=contract / ./packages/contract
COPY --from=core / ./packages/core
COPY apps/api/go.mod apps/api/go.sum ./apps/api/

WORKDIR /src/apps/api

RUN go mod edit -replace=github.com/sb0rka/sb0rka/packages/contract=../../packages/contract \
 && go mod edit -replace=github.com/sb0rka/sb0rka/packages/core=../../packages/core \
 && GOWORK=off go mod download

COPY apps/api/cmd ./cmd
COPY apps/api/internal ./internal
COPY apps/api/pkg ./pkg

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOWORK=off \
    go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/api /app/api

EXPOSE 8080

USER app

CMD ["/app/api"]
