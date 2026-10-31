-- Persistent configuration for the Admin System Settings module.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  system_name text NOT NULL DEFAULT 'Record Management System',
  organization_name text NOT NULL DEFAULT 'Office of the Senior Citizens Affairs',
  allow_public_registration boolean NOT NULL DEFAULT true,
  updated_by bigint NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.system_settings (id, system_name, organization_name, allow_public_registration)
VALUES (1, 'Record Management System', 'Office of the Senior Citizens Affairs', true)
ON CONFLICT (id) DO NOTHING;
