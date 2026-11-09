## Build context = repository root.
FROM golang:1.26.10-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY --from=core / ./packages/core
COPY apps/drones/go.mod apps/drones/go.sum ./apps/drones/

WORKDIR /src/apps/drones

RUN go mod edit -replace=github.com/sb0rka/sb0rka/packages/core=../../packages/core \
 && GOWORK=off go mod download

COPY apps/drones/main.go ./
COPY apps/drones/pkg ./pkg

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOWORK=off \
    go build -trimpath -ldflags="-s -w" -o /out/drone .

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/drone /app/drone

USER app

CMD ["/app/drone"]
