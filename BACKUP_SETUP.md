# System Backup and Recovery Setup

The Admin Portal backup module creates an encrypted application-level backup containing supported database tables and every object in the private Supabase Storage bucket named \`documents\`.

## Required backend environment variable

Add this variable to the Render backend service:

- Name: \`BACKUP_ENCRYPTION_KEY\`
- Value: a newly generated random secret with at least 32 characters (64 hexadecimal characters recommended).

Generate a value locally with Node.js:

\`\`\`bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

Copy the generated value directly into Render's Environment settings. Do not commit it to GitHub, place it in frontend code, or share it in chat. Keep a secure copy in your organization's password manager. **Do not rotate or replace this key after backups have been created**, because older archives cannot be decrypted with a different key.

## Supabase requirements

The backend must use a Supabase secret/service-role key with permission to:
- Read the configured application and administration tables.
- List and download objects from the private \`documents\` bucket.
- Create and write to a private \`system-backups\` bucket.
- Read backup archives and upload missing objects during recovery.

The API creates the private \`system-backups\` bucket on first use. The original \`documents\` bucket must already exist.

## How it works

- Create Backup exports the configured database tables, downloads all objects from \`documents\`, packages them with a manifest, encrypts the archive with AES-256-GCM, and stores it in \`system-backups\`.
- Backup History lists the encrypted archives and summary metadata.
- Recover validates and decrypts the selected archive, inserts missing database rows, and uploads missing files. Existing rows and files are not intentionally overwritten.
- The recovery process does not recreate database schemas or SQL functions. It restores data into the existing schema.

## Important operational notes

- This is an application-level data and file backup, not a native PostgreSQL point-in-time recovery snapshot.
- Create a backup before making major database or storage changes.
- A successful deployment does not mean the first backup has been created; use the Admin Portal and confirm an archive appears in Backup History.
- Keep the encryption key secure and retain a separate copy of critical backups outside the production project where organizational policy permits.
