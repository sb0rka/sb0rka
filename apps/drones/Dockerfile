FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/drones .

FROM alpine:3.21

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/drones /app/drones

USER app

ENTRYPOINT ["/app/drones"]
CMD ["version"]