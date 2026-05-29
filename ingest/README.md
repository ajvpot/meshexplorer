# MeshCore Ingest

A Go service that ingests MeshCore MQTT messages into ClickHouse, plus the
ClickHouse image and SQL migrations for the schema.

This directory is normally run as part of the full stack via the
[root `docker compose`](../README.md). The notes below cover running and
developing it on its own.

## Components

- `cmd/meshcoreingest` — the ingest daemon. Subscribes to MeshCore MQTT topics
  and writes raw packets into the `meshcore_packets` table.
- `internal/ingestcommon` — shared MQTT + ClickHouse connection/daemon logic.
- `internal/migrate` — a [goose](https://github.com/pressly/goose) based
  migration runner (ClickHouse dialect).
- `migrations/` — the ClickHouse schema: the `meshcore_packets` table, the decoded
  `meshcore_adverts` / `meshcore_adverts_latest` / `meshcore_public_channel_messages`
  views, and the `unified_latest_nodeinfo` view consumed by the web app.
- `clickhouse/` — a thin ClickHouse server image plus the read-only user used by
  the web app.

## Configuration

All configuration is via environment variables (no credentials are baked into the
source):

| Variable | Description |
|----------|-------------|
| `MQTT_BROKERS` | JSON array of brokers: `[{"url","username","password","topics"}]`. `topics` defaults to `["meshcore/#"]`. Required; the daemon exits if unset. |
| `MQTT_CLIENT_ID` | MQTT client id prefix (default `meshcore-ingest`). |
| `CLICKHOUSE_HOST` / `CLICKHOUSE_PORT` | ClickHouse address (native protocol, default `127.0.0.1:9000`). |
| `CLICKHOUSE_DB` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` | ClickHouse database and read/write credentials. |

## Building

```bash
go build ./...
go test ./...
```

## Running migrations

```bash
go run ./internal/migrate \
  -host localhost -port 9000 \
  -username default -password "$CLICKHOUSE_PASSWORD" \
  -path migrations -action up
```

Actions: `up`, `down`, `reset`, `status`, `version`.

## Running the ingest daemon

```bash
export MQTT_BROKERS='[{"url":"tcp://mqtt.example.com:1883","username":"u","password":"p","topics":["meshcore/#"]}]'
export CLICKHOUSE_HOST=localhost CLICKHOUSE_PORT=9000 CLICKHOUSE_PASSWORD=...
go run ./cmd/meshcoreingest
```
