## Build context = repository root.
FROM golang:1.26.10-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/contract,github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY --from=contract / ./packages/contract
COPY --from=core / ./packages/core
COPY apps/auth/go.mod apps/auth/go.sum ./apps/auth/

WORKDIR /src/apps/auth

RUN go mod edit -replace=github.com/sb0rka/sb0rka/packages/contract=../../packages/contract \
 && go mod edit -replace=github.com/sb0rka/sb0rka/packages/core=../../packages/core \
 && GOWORK=off go mod download

COPY apps/auth/cmd ./cmd
COPY apps/auth/internal ./internal
COPY apps/auth/pkg ./pkg

ARG BUILD_REVISION=unknown
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOWORK=off \
    go build -trimpath -ldflags="-s -w -X github.com/sb0rka/sb0rka/packages/core/buildinfo.Revision=${BUILD_REVISION}" -o /out/auth ./cmd/auth

FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache wget \
 && addgroup -S app && adduser -S app -G app

COPY --from=builder /out/auth /app/auth

EXPOSE 8020

USER app

CMD ["/app/auth"]
