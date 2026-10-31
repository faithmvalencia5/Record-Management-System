import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const BUCKET = 'documents';
const DELETE = process.argv.includes('--delete');

async function getAll(path = '') {
  const results = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(path, { limit: 1000, offset });

    if (error) throw error;
    results.push(...data);

    if (data.length < 1000) break;
    offset += 1000;
  }

  return results;
}

async function exists(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select('application_id')
    .eq('application_id', id)
    .limit(1);

  if (error) throw error;
  return data.length > 0;
}

async function main() {
  if (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing Supabase environment variables.');
  }

  const folders = await getAll();
  let deleted = 0;
  let skipped = 0;

  for (const folder of folders) {
    const id = folder.name;

    if (!/^OSCA\d+$/.test(id) || folder.id !== null) continue;

    // Recheck both tables immediately before deletion.
    if (
      await exists('applications', id) ||
      await exists('application_files', id)
    ) {
      skipped++;
      continue;
    }

    const files = await getAll(id);

    // Only remove folders matching the verified six-file pattern.
    if (files.length !== 6 || files.some(file => !file.id)) {
      console.log(`SKIPPED ${id}: unexpected contents`);
      skipped++;
      continue;
    }

    const paths = files.map(file => `${id}/${file.name}`);

    if (!DELETE) {
      console.log(`PREVIEW ${id}: ${paths.length} files`);
      continue;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .remove(paths);

    if (error) {
      console.error(`FAILED ${id}:`, error.message);
      continue;
    }

    deleted += data.length;
    console.log(`DELETED ${id}: ${data.length} files`);
  }

  console.log('\nCleanup finished.');
  console.log('Deleted files:', deleted);
  console.log('Skipped folders:', skipped);
  console.log('Mode:', DELETE ? 'DELETE' : 'PREVIEW');
}

main().catch(console.error);