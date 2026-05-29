FROM clickhouse/clickhouse-server:latest

# Read-only user used by the web app / discord bot
COPY users.xml /etc/clickhouse-server/users.d/readonly_user.xml

# Access control configuration
COPY config.xml /etc/clickhouse-server/config.d/access_control.xml
