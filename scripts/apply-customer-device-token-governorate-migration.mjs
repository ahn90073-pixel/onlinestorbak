import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to apply the customer device-token governorate migration.');

const sql = neon(databaseUrl);
await sql`ALTER TABLE app.device_tokens ADD COLUMN IF NOT EXISTS governorate TEXT`;
await sql`CREATE INDEX IF NOT EXISTS device_tokens_governorate_idx
  ON app.device_tokens (governorate) WHERE governorate IS NOT NULL`;
await sql`ALTER TABLE public.notification_contacts ADD COLUMN IF NOT EXISTS governorate TEXT`;
await sql`CREATE INDEX IF NOT EXISTS notification_contacts_governorate_idx
  ON public.notification_contacts (audience, governorate) WHERE governorate IS NOT NULL`;

console.log('Customer device-token governorate schema is ready.');
