FROM golang:1.23-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# -tags dev включает dev_server.go (HTTP-обёртку поверх cloud-function Handler)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -tags dev -o /out/proxy .

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/proxy /app/proxy

USER app

EXPOSE 8070

ENTRYPOINT ["/app/proxy"]
