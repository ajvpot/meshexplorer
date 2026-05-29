# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Set working directory
WORKDIR /app

# Copy go mod files for dependency caching
COPY go.mod go.sum ./

# Download dependencies (cached by BuildKit)
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source code
COPY . .

# Build the meshcore ingest daemon
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o meshcoreingest ./cmd/meshcoreingest

# Build the migration runner
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o migrate ./internal/migrate

# Final stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy binaries from builder stage
COPY --from=builder /app/meshcoreingest .
COPY --from=builder /app/migrate .

# Bundle migrations so the migrate service can apply them on startup
COPY --from=builder /app/migrations ./migrations

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Run the meshcore ingest daemon by default; the migrate service overrides this.
CMD ["./meshcoreingest"]
