## Build context = repository root.
## Build: docker build -f apps/drones/Dockerfile <repo root>
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git
ENV GONOSUMDB=github.com/sb0rka/sb0rka/packages/core

WORKDIR /src

COPY apps/drones/go.mod apps/drones/go.sum ./apps/drones/

WORKDIR /src/apps/drones

RUN go mod download

COPY apps/drones/main.go ./
COPY apps/drones/pkg ./pkg

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/drone .

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/drone /app/drone

USER app

CMD ["/app/drone"]
