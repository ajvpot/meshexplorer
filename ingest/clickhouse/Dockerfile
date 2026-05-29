FROM clickhouse/clickhouse-server:26.5.1.882

# Read-only user used by the web app / discord bot
COPY users.xml /etc/clickhouse-server/users.d/readonly_user.xml

# Access control configuration
COPY config.xml /etc/clickhouse-server/config.d/access_control.xml

# System log retention (TTLs + tame text_log) so diagnostics don't grow unbounded
COPY system-logs.xml /etc/clickhouse-server/config.d/system-logs.xml
