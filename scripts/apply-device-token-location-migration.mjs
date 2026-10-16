import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to apply the device-token location migration.');

const sql = neon(databaseUrl);
await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
await sql`ALTER TABLE app.device_tokens
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_region TEXT,
  ADD COLUMN IF NOT EXISTS location_country TEXT,
  ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326)`;
await sql`CREATE INDEX IF NOT EXISTS device_tokens_location_point_gist_idx
  ON app.device_tokens USING GIST (location_point)`;

console.log('PostGIS device-token location schema is ready.');
