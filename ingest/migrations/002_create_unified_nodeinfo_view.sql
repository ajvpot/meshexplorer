-- +goose Up
-- Unified latest node info view.
-- MeshCore is the only supported protocol, so this is a thin projection over
-- meshcore_adverts_latest that the web app (getNodePositions) reads from.
CREATE OR REPLACE VIEW unified_latest_nodeinfo AS
SELECT
    public_key AS node_id,
    node_name AS name,
    substringUTF8(node_name, 1, 1) AS short_name,
    latitude AS latitude,
    longitude AS longitude,
    first_heard AS first_seen,
    last_seen,
    'meshcore' AS type
FROM meshcore_adverts_latest
ORDER BY last_seen DESC;

-- +goose Down
DROP VIEW IF EXISTS unified_latest_nodeinfo;
