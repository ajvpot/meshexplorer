FROM clickhouse/clickhouse-server:latest as builder

RUN apt-get update && \
    apt-get install -y build-essential libssl-dev libmsgpack-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY meshcore_decrypt_udf.c ./
RUN gcc -O2 -o meshcore_decrypt_udf meshcore_decrypt_udf.c -lssl -lcrypto -lmsgpackc

FROM clickhouse/clickhouse-server:latest

# Copy UDF binary to /usr/local/share/clickhouse-udf-bins
COPY --from=builder /build/meshcore_decrypt_udf /usr/local/share/clickhouse-udf-bins/meshcore_decrypt_udf

# Copy UDF XML config directly to the location and name matching ClickHouse config pattern
COPY meshcore_decrypt_udf.xml /etc/clickhouse-server/meshcore_decrypt_function.xml

# Copy users configuration file
COPY users.xml /etc/clickhouse-server/users.d/readonly_user.xml

# Copy access control configuration
COPY config.xml /etc/clickhouse-server/config.d/access_control.xml

RUN chmod +x /usr/local/share/clickhouse-udf-bins/meshcore_decrypt_udf
# Remove custom entrypoint, use default 