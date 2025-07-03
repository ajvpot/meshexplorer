import { ClickHouse } from 'clickhouse';

const host = process.env.CLICKHOUSE_HOST || 'localhost';
const port = process.env.CLICKHOUSE_PORT || '8123';
const user = process.env.CLICKHOUSE_USER || 'default';
const password = process.env.CLICKHOUSE_PASSWORD || 'password';

export const clickhouse = new ClickHouse({
  url: `http://${host}`,
  port: Number(port),
  basicAuth: { username: user, password },
  isUseGzip: false,
  format: 'json',
});