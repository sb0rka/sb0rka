## Build context = apps/drones (see docker-compose.dev.yml).
## Build: docker build -f apps/drones/Dockerfile apps/drones
FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY main.go version.txt ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/drone .

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/drone /app/drone

USER app

CMD ["/app/drone"]
