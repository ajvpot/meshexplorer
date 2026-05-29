# MeshExplorer

A real-time map, chat client, and packet-analysis tool for **MeshCore** mesh
networks. This repository ships the whole stack so it can be brought up with a
single `docker compose up`:

| Component | Path | Description |
|-----------|------|-------------|
| Web app | [`meshexplorer/`](./meshexplorer) | Next.js UI + API (map, chat, stats, packet analysis) |
| Ingest + DB | [`ingest/`](./ingest) | Go MeshCore MQTT→ClickHouse ingest, ClickHouse image, and SQL migrations |
| Discord relay | [`meshexplorer/`](./meshexplorer) (`Dockerfile.bot`) | Optional bot that relays MeshCore channel messages to Discord |

## Architecture

```
                MQTT brokers (you configure)
                          │
                          ▼
   ┌──────────────┐   ┌──────────────┐
   │ meshcoreingest│──▶│  ClickHouse  │◀── migrate (one-shot, applies schema)
   └──────────────┘   └──────┬───────┘
                             │ (readonly user)
                  ┌──────────┴──────────┐
                  ▼                     ▼
            meshexplorer           discord-bot
            (web UI :3001)         (optional --profile bot)
```

## Quick start

Requirements: Docker + Docker Compose.

```bash
cp .env.example .env
# Edit .env — at minimum set:
#   CLICKHOUSE_PASSWORD   (read/write user, used by ingest + migrations)
#   MQTT_BROKERS          (JSON array of meshcore MQTT brokers to ingest from)
# Optional, for the Discord relay: DISCORD_WEBHOOK_URL (+ run with --profile bot)

docker compose up --build
```

Then open <http://localhost:3001>.

Startup order is handled automatically: ClickHouse becomes healthy → `migrate`
applies the schema and exits → `meshcoreingest` and `meshexplorer` start.

To also run the Discord relay:

```bash
docker compose --profile bot up --build
```

## Configuration

All configuration is via environment variables in `.env` (see
[`.env.example`](./.env.example) for the full list and defaults). Highlights:

- **ClickHouse** — two accounts. The read/write `default` user
  (`CLICKHOUSE_PASSWORD`) is used by the ingest daemon and the migration runner;
  the `readonly` user (`CLICKHOUSE_READONLY_PASSWORD`) is used by the web app and
  the Discord bot. ClickHouse is only published to `127.0.0.1` for debugging and
  is otherwise reachable only on the internal `meshnet` network.
- **MQTT_BROKERS** — a JSON array; each entry is
  `{ "url", "username", "password", "topics" }` (`topics` defaults to
  `["meshcore/#"]`). The ingest daemon exits with a clear error if this is unset,
  so configure at least one broker.

## Development

Each component can be run on its own:

- Web app: see [`meshexplorer/README.md`](./meshexplorer/README.md)
  (`npm install && npm run dev`).
- Ingest: see [`ingest/README.md`](./ingest/README.md) (`go build ./...`).

## Security notes

- `.env` is gitignored — keep real credentials out of version control.
- If you previously used the bundled defaults, rotate any secrets before going
  to production.
