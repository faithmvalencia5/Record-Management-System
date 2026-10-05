require("dotenv").config({
  path: require("path").join(__dirname, "../.env")
});

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "documents";

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL in .env");
  process.exit(1);
}

if (!SUPABASE_SECRET_KEY) {
  console.error(
    "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in .env"
  );
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const dataFolder = process.argv[2];

if (!dataFolder) {
  console.error(
    'Usage: node upload-dummy-documents.js "path-to-year-folder"'
  );
  process.exit(1);
}

if (!fs.existsSync(dataFolder)) {
  console.error("Folder not found:");
  console.error(dataFolder);
  process.exit(1);
}

const documentsFolder = path.join(dataFolder, "documents");

if (!fs.existsSync(documentsFolder)) {
  console.error("Could not find documents folder:");
  console.error(documentsFolder);
  process.exit(1);
}

async function uploadFile(localPath, storagePath) {
  const buffer = fs.readFileSync(localPath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "3600"
    });

  if (!error) {
    console.log("Uploaded:", storagePath);
    return true;
  }

  const message = String(error.message || error);

  if (
    message.toLowerCase().includes("already exists") ||
    message.toLowerCase().includes("duplicate")
  ) {
    console.log("Already exists:", storagePath);
    return true;
  }

  console.error("FAILED:", storagePath);
  console.error(message);

  return false;
}

async function main() {
  console.log("");
  console.log("======================================");
  console.log("SUPABASE DOCUMENT UPLOADER");
  console.log("======================================");
  console.log("Bucket:", BUCKET);
  console.log("Data folder:", dataFolder);
  console.log("Documents:", documentsFolder);
  console.log("");

  const applicantFolders = fs
    .readdirSync(documentsFolder, {
      withFileTypes: true
    })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        /^OSCA\d{6}$/.test(entry.name)
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );

  console.log(
    `Applicants found: ${applicantFolders.length}`
  );

  if (applicantFolders.length === 0) {
    console.error(
      "No OSCA applicant folders were found."
    );
    process.exit(1);
  }

  let uploaded = 0;
  let failed = 0;

  for (const applicant of applicantFolders) {
    const applicantFolder = path.join(
      documentsFolder,
      applicant.name
    );

    console.log("");
    console.log(
      `========== ${applicant.name} ==========`
    );

    const files = fs
      .readdirSync(applicantFolder)
      .filter((file) =>
        /\.(jpg|jpeg|png|webp)$/i.test(file)
      )
      .sort();

    for (const file of files) {
      const localPath = path.join(
        applicantFolder,
        file
      );

      const storagePath =
        `${applicant.name}/${file}`;

      const success = await uploadFile(
        localPath,
        storagePath
      );

      if (success) {
        uploaded++;
      } else {
        failed++;
      }
    }
  }

  console.log("");
  console.log("======================================");
  console.log("UPLOAD COMPLETE");
  console.log("======================================");
  console.log(
    "Applicants:",
    applicantFolders.length
  );
  console.log(
    "Files uploaded/existing:",
    uploaded
  );
  console.log("Failed:", failed);
  console.log("======================================");
}

main().catch((error) => {
  console.error("");
  console.error("Unexpected error:");
  console.error(error);
  process.exit(1);
});