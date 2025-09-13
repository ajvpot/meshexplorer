# MeshCore Discord Bot

This directory contains scripts for running long-running background processes alongside the Next.js server.

## Discord Bot

The Discord bot (`discord-bot.ts`) subscribes to the ClickHouse message stream with decryption enabled for the Seattle region and posts new messages to Discord via webhook.

### Features

- **Real-time streaming**: Subscribes to ClickHouse chat message stream
- **Message decryption**: Automatically decrypts messages using known keys
- **Discord integration**: Posts messages to Discord via webhook
- **Message updates**: Messages with the same ID update existing Discord messages instead of posting new ones
- **Error handling**: Graceful error handling with Discord error notifications
- **Skip initial messages**: Only processes new messages, not historical ones

### Configuration

The bot is configured via environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | - | Yes |
| `MESH_REGION` | Mesh region to monitor | `seattle` | No |
| `POLL_INTERVAL` | Polling interval in milliseconds | `1000` | No |
| `MAX_ROWS_PER_POLL` | Maximum rows to fetch per poll | `50` | No |
| `PRIVATE_KEYS` | Comma-separated list of private keys | - | No |

### Usage

#### Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run discord-bot:dev
```

#### Production

```bash
# Run the bot
npm run discord-bot
```

#### Environment Setup

Create a `.env.local` file in the project root:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
MESH_REGION=seattle
POLL_INTERVAL=1000
MAX_ROWS_PER_POLL=50
PRIVATE_KEYS=key1,key2,key3
```

### Discord Webhook Setup

1. Go to your Discord server settings
2. Navigate to Integrations > Webhooks
3. Create a new webhook
4. Copy the webhook URL
5. Set it as the `DISCORD_WEBHOOK_URL` environment variable

### Message Format

Messages are posted to Discord with the following format:

- **Username**: MeshCore Chat
- **Avatar**: Meshtastic logo
- **Embed**: Rich embed with message details including:
  - Sender and message text
  - Channel hash
  - Message ID
  - Region
  - Timestamps

### Error Handling

- Decryption failures are logged and skipped
- Network errors are retried automatically
- Critical errors are posted to Discord
- Graceful shutdown on SIGINT/SIGTERM

### Architecture

The bot consists of several components:

- **`discord-bot.ts`**: Main bot script with message processing logic
- **`lib/discord.ts`**: Discord webhook client and message formatting utilities
- **ClickHouse streaming**: Uses existing streaming infrastructure from the main app
- **Message decryption**: Leverages existing meshcore decryption utilities

### Docker Deployment

The project includes Docker support for easy deployment with both the Next.js server and Discord bot.

#### Prerequisites

- Docker and Docker Compose installed
- ClickHouse running on the Docker host (default port 8123)
- External Docker network `shared-network` must exist

#### Setup

1. **Create the required external network:**
   ```bash
   docker network create shared-network
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the example file
   cp scripts/docker.env.example .env
   
   # Edit .env with your configuration
   nano .env
   ```

3. **Build and start services:**
   ```bash
   # Start both Next.js server and Discord bot
   docker-compose up --build
   
   # Or run in background
   docker-compose up -d --build
   ```

4. **Access the application:**
   - Next.js server: http://localhost:3001
   - Discord bot: Runs in background, check logs with `docker-compose logs discord-bot`

#### Docker Services

- **meshexplorer**: Next.js web application (uses `Dockerfile`)
- **discord-bot**: Discord bot for chat message streaming (uses `Dockerfile.bot`)

#### Docker Images

The project uses two separate Dockerfiles for optimal image sizes:

- **`Dockerfile`**: Optimized for Next.js standalone output (smaller, faster)
- **`Dockerfile.bot`**: Optimized for TypeScript execution with tsx (includes source files)

#### Environment Variables

All configuration is loaded from environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CLICKHOUSE_HOST` | ClickHouse server hostname | `clickhouse` | No |
| `CLICKHOUSE_PORT` | ClickHouse server port | `8123` | No |
| `CLICKHOUSE_USER` | ClickHouse username | `default` | No |
| `CLICKHOUSE_PASSWORD` | ClickHouse password | `password` | No |
| `NEXT_PUBLIC_API_URL` | Override API base URL | - | No |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | - | Yes |
| `MESH_REGION` | Mesh region to monitor | `seattle` | No |
| `POLL_INTERVAL` | Polling interval in milliseconds | `1000` | No |
| `MAX_ROWS_PER_POLL` | Maximum rows to fetch per poll | `50` | No |
| `PRIVATE_KEYS` | Comma-separated private keys | - | No |

#### Docker Commands

```bash
# View logs
docker-compose logs -f discord-bot
docker-compose logs -f meshexplorer

# Restart services
docker-compose restart discord-bot
docker-compose restart meshexplorer

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build --force-recreate

# Build individual services
docker-compose build meshexplorer
docker-compose build discord-bot

# Run only specific service
docker-compose up meshexplorer
docker-compose up discord-bot

# Build and run Discord bot only
docker build -f Dockerfile.bot -t meshexplorer-bot .
docker run --env-file .env meshexplorer-bot
```

### Monitoring

The bot logs important events:

- Message processing status
- Decryption success/failure
- Discord API calls
- Error conditions

Check the console output for real-time monitoring of bot activity.
