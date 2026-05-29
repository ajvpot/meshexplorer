FROM clickhouse/clickhouse-server:25.6.2.5

# Read-only user used by the web app / discord bot
COPY users.xml /etc/clickhouse-server/users.d/readonly_user.xml

# Access control configuration
COPY config.xml /etc/clickhouse-server/config.d/access_control.xml
