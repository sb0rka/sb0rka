FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY . .

RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/auth ./cmd/auth

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/auth /app/auth

EXPOSE 8080

USER app

CMD ["/app/auth"]