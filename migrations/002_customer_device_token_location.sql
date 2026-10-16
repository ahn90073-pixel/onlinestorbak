BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE app.device_tokens
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_region TEXT,
  ADD COLUMN IF NOT EXISTS location_country TEXT,
  ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326);

CREATE INDEX IF NOT EXISTS device_tokens_location_point_gist_idx
  ON app.device_tokens USING GIST (location_point);

COMMIT;
