-- Admin approval workflow for public account registration.
-- Existing personnel accounts default to Approved to preserve their access.
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'Approved';

ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.user_accounts
SET approval_status = 'Approved'
WHERE approval_status IS NULL OR btrim(approval_status) = '';

ALTER TABLE public.user_accounts
  DROP CONSTRAINT IF EXISTS user_accounts_approval_status_check;

ALTER TABLE public.user_accounts
  ADD CONSTRAINT user_accounts_approval_status_check
  CHECK (approval_status IN ('Pending', 'Approved', 'Rejected'));

CREATE INDEX IF NOT EXISTS idx_user_accounts_approval_status
  ON public.user_accounts (approval_status);
