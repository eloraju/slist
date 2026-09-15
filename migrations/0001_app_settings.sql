-- Server-side settings that must survive a restart but are not worth an env var.
-- Today that is only the auth signing secret, generated on first boot when the operator
-- did not supply one (ADR-0008).
create table app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
