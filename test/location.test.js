import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCloudflareLocation } from '../src/location.js';

test('accepts bounded Cloudflare city-level metadata and validated coordinates', () => {
  assert.deepEqual(getCloudflareLocation({ cf: {
    city: ' Cairo ', region: 'Cairo Governorate', country: 'eg', latitude: '30.0', longitude: '31.2', ip: '203.0.113.1',
  } }), {
    locationCity: 'Cairo',
    locationRegion: 'Cairo Governorate',
    locationCountry: 'EG',
    locationLatitude: 30,
    locationLongitude: 31.2,
  });
});

test('rejects malformed labels and out-of-range coordinates', () => {
  assert.deepEqual(getCloudflareLocation({ cf: {
    city: `  ${'x'.repeat(120)}  `, country: 'Egypt', latitude: '91', longitude: '-181',
  } }), {
    locationCity: 'x'.repeat(100),
    locationRegion: null,
    locationCountry: null,
    locationLatitude: null,
    locationLongitude: null,
  });
});

test('returns null location when Cloudflare metadata is absent', () => {
  assert.deepEqual(getCloudflareLocation({}), {
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    locationLatitude: null,
    locationLongitude: null,
  });
});

test('PostGIS migration and deploy script add a geography point and GiST index idempotently', () => {
  const migration = readFileSync(new URL('../migrations/002_customer_device_token_location.sql', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../scripts/apply-device-token-location-migration.mjs', import.meta.url), 'utf8');
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS postgis/i);
  assert.match(migration, /location_point geography\(Point, 4326\)/i);
  assert.match(migration, /USING GIST \(location_point\)/i);
  assert.match(script, /app\.device_tokens/);
  assert.match(script, /CREATE INDEX IF NOT EXISTS/);
});
