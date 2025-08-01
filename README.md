# MeshExplorer

MeshExplorer is a real-time map, chat client, and packet analysis tool for mesh networks using MeshCore and Meshtastic. It enables users to visualize mesh nodes on a map, communicate via chat, and analyze packet data in real time.

## Features
- Real-time map of mesh network nodes (MeshCore and Meshtastic)
- Integrated chat client for mesh channels
- Packet analysis and inspection tools
- Customizable map layers and clustering
- Modern, responsive UI

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Variables

### ClickHouse Database Configuration

The application connects to ClickHouse using the following environment variables:

- `CLICKHOUSE_HOST` - ClickHouse server hostname (default: `localhost`)
- `CLICKHOUSE_PORT` - ClickHouse server port (default: `8123`)
- `CLICKHOUSE_USER` - ClickHouse username (default: `default`)
- `CLICKHOUSE_PASSWORD` - ClickHouse password (default: `password`)

### `NEXT_PUBLIC_API_URL`

This environment variable allows you to override the API base URL for frontend development purposes. When set, all API calls will be made to the specified URL instead of using relative URLs.

**Use case**: This is useful when you want to develop the frontend without direct access to the ClickHouse database, by pointing to a remote API endpoint.

**Example**:
```bash
NEXT_PUBLIC_API_URL=https://map.w0z.is
```

**Important**: When this environment variable is set, the local API routes (`/api/*`) will not work. Make sure the remote API endpoint provides the same API structure and endpoints.

**Default behavior**: If not set, the application uses relative URLs and works with the local Next.js API routes.

### CORS Support

The application includes middleware (`middleware.ts`) that automatically adds CORS headers to all API routes. This allows:

- Cross-origin requests from localhost to production APIs
- Cross-protocol requests (HTTP on localhost to HTTPS in production)
- Preflight OPTIONS requests are handled automatically

The middleware applies the following CORS headers to all `/api/*` routes:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`
- `Access-Control-Allow-Credentials: true`

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [MeshCore](https://github.com/your-org/meshcore) - mesh network backend
- [Meshtastic](https://meshtastic.org/) - open source mesh communication project

## Docker Deployment

The application includes Docker support for easy deployment. The Docker configuration is set up to connect to ClickHouse running on the Docker host.

### Prerequisites

- Docker and Docker Compose installed
- ClickHouse running on the Docker host (default port 8123)
- External Docker network `shared-network` must exist (see setup instructions below)

### External Network Setup

The application requires an external Docker network called `shared-network` to communicate with ClickHouse. You must create this network before running the application:

```bash
docker network create shared-network
```

**Note**: If the network already exists, this command will show an error but can be safely ignored.

### Running with Docker Compose

1. **Create the required external network (if not already created):**
   ```bash
   docker network create shared-network
   ```

2. **Build and start the application:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   Open [http://localhost:3001](http://localhost:3001) in your browser.

### Docker Configuration

The `docker-compose.yml` file is configured with:
- **Port mapping**: Container port 3000 → Host port 3001
- **ClickHouse connection**: Uses `clickhouse` hostname to connect to ClickHouse via the shared network
- **External network**: Requires `shared-network` to be created externally
- **Environment variables**: Pre-configured for typical ClickHouse setup

### Customizing ClickHouse Connection

You can customize the ClickHouse connection by modifying the environment variables in `docker-compose.yml`:

```yaml
environment:
  - CLICKHOUSE_HOST=your-clickhouse-host
  - CLICKHOUSE_PORT=8123
  - CLICKHOUSE_USER=your-username
  - CLICKHOUSE_PASSWORD=your-password
```

### Building with BuildKit

For faster builds with caching, enable BuildKit:

```bash
DOCKER_BUILDKIT=1 docker-compose up --build
```

## Deploy

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
