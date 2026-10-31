# Automatic applicant Storage cleanup

This feature keeps the application deletion use case out of the portal. Whenever an application row is deleted directly from PostgreSQL (including the Supabase Table Editor), a database trigger snapshots the exact object paths under `documents/<application_id>/` into a private queue. A Supabase Database Webhook invokes the Edge Function to remove those objects through the Storage API.

## 1. Apply the SQL migration

Run the contents of `supabase/migrations/20261031_application_storage_cleanup.sql` in Supabase SQL Editor.

The trigger does not delete Storage files from PostgreSQL. It only queues the paths before the application row and its cascading child rows are removed.

## 2. Deploy the Edge Function

From the repository root, with the Supabase CLI linked to the correct project:

```bash
supabase functions deploy cleanup-application-storage --no-verify-jwt
```

Set the function secret (use a newly generated random value; do not commit it):

```bash
supabase secrets set STORAGE_CLEANUP_WEBHOOK_SECRET=YOUR_RANDOM_WEBHOOK_SECRET
```

Set the Edge Function's `SUPABASE_SECRET_KEY` using the same project secret key already used by your backend. The function also accepts the legacy `SUPABASE_SERVICE_ROLE_KEY` variable. Never put either secret key in frontend code.

## 3. Configure the Database Webhook

In Supabase Dashboard, open **Database → Webhooks** and create a webhook:

- Name: `cleanup-application-storage`
- Table: `public.application_storage_cleanup_queue`
- Events: **Insert** only
- Type: HTTP Request
- Method: POST
- URL: `https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-application-storage`
- Header: `x-cleanup-secret: <the same STORAGE_CLEANUP_WEBHOOK_SECRET value>`
- Payload: include the webhook's standard record payload (the Edge Function reads `record.id`).

## 4. Verify

Delete only a test application after confirming it is safe to remove. Check:

- Its row is removed from `applications`.
- Its related database rows are removed by the existing ON DELETE CASCADE constraints.
- A row appears in `application_storage_cleanup_queue`.
- That queue row reaches `completed`.
- Its files are gone from the `documents` bucket.

If Storage deletion fails, the queue row remains with status `failed` and an error message. The queue is retained for audit/troubleshooting; it is not automatically discarded.

## Important

- This trigger applies to direct database deletes as well as deletes performed by backend code.
- No delete button or delete permission is added to the staff/admin portal.
- Only objects whose names begin with the exact application ID followed by `/` are queued.
- Audit logs and the `system-backups` bucket are not touched.
