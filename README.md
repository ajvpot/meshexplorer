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

## Deploy

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
