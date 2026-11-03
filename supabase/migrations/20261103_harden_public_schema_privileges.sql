-- Security hardening: restrict direct client privileges on the public schema.
-- Reviewed against the November 3, 2026 Supabase permission audit.
--
-- This migration intentionally preserves service_role grants. The application
-- backends use server-side service-role credentials; browser clients should
-- access data only through authenticated backend endpoints.
--
-- IMPORTANT: Review and test in a staging project before applying to production.

BEGIN;

-- Existing application tables: remove direct table privileges from browser roles.
-- RLS remains enabled; this additionally removes non-RLS privileges such as
-- TRUNCATE, TRIGGER, REFERENCES, and MAINTAIN.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Existing sequences: browser roles do not need direct sequence access when
-- inserts are performed by the backend using service_role.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM anon, authenticated;

-- Existing public functions: do not expose function execution to the
-- implicit PUBLIC role or browser roles. Keep service_role grants intact.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

-- Prevent future objects created by postgres in public from receiving
-- broad client-role table privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

-- Prevent future sequences created by postgres in public from receiving
-- browser-role privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Remove that default and any explicit browser-role defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;

-- Expected outcome:
-- * anon/authenticated have no direct table or sequence privileges in public.
-- * anon/authenticated/PUBLIC have no EXECUTE on existing public functions.
-- * service_role privileges are not revoked or rewritten.
-- * existing RLS policies and table data are untouched.
