BEGIN;

ALTER TABLE app.device_tokens
  ADD COLUMN IF NOT EXISTS governorate TEXT;

CREATE INDEX IF NOT EXISTS device_tokens_governorate_idx
  ON app.device_tokens (governorate)
  WHERE governorate IS NOT NULL;

ALTER TABLE public.notification_contacts
  ADD COLUMN IF NOT EXISTS governorate TEXT;

CREATE INDEX IF NOT EXISTS notification_contacts_governorate_idx
  ON public.notification_contacts (audience, governorate)
  WHERE governorate IS NOT NULL;

COMMIT;
