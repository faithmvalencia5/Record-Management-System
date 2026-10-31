const crypto = require("crypto");
const AdmZip = require("adm-zip");
const supabase = require("../config/supabase");
const { createAuditLogFromRequest } = require("./auditLogController");

const BACKUP_BUCKET = "system-backups";
const SOURCE_BUCKET = "documents";
const BACKUP_VERSION = 1;
const PAGE_SIZE = 1000;
let currentBackupProgress = { active: false, status: "idle", percent: 0, stage: "Waiting to start", updatedAt: null };
let backupCancelRequested = false;

function setBackupProgress(percent, stage, extra = {}) {
  currentBackupProgress = {
    ...currentBackupProgress,
    ...extra,
    active: extra.active !== undefined ? extra.active : true,
    status: extra.status || "running",
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage,
    updatedAt: new Date().toISOString(),
  };
}

async function getSystemBackupProgress(req, res) {
  return res.json({ success: true, progress: currentBackupProgress });
}

async function cancelSystemBackup(req, res) {
  if (!currentBackupProgress.active) {
    return res.status(409).json({ success: false, message: "There is no active backup to cancel." });
  }
  backupCancelRequested = true;
  setBackupProgress(currentBackupProgress.percent, "Cancellation requested. Finishing the current operation safely…", {
    active: true, status: "cancelling"
  });
  return res.json({ success: true, message: "Backup cancellation requested. The current operation will finish safely before temporary backup parts are removed." });
}

function checkBackupCancelled() {
  if (backupCancelRequested) {
    const error = new Error("Backup cancelled by administrator.");
    error.code = "BACKUP_CANCELLED";
    throw error;
  }
}

const TABLES = [
  { name: "applications", conflict: "application_id" },
  { name: "user_accounts", conflict: "id" },
  { name: "application_files", conflict: "application_id" },
  { name: "family_composition", conflict: "id" },
  { name: "personal_background", conflict: "application_id" },
  { name: "problems_needs", conflict: "application_id" },
  { name: "confirmations", conflict: "application_id" },
  { name: "memberships", conflict: "application_id" },
  { name: "application_status_history", conflict: "id" },
  { name: "document_authentications", conflict: "id" },
  { name: "id_maker_queue", conflict: "application_id" },
  { name: "id_requests", conflict: "id" },
  { name: "audit_logs", conflict: "id" },
];

function encryptionKey(salt = Buffer.from("record-management-system-backup-v1")) {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    const error = new Error("BACKUP_ENCRYPTION_KEY is not configured. Add a secret of at least 32 characters to the backend environment before creating or restoring backups.");
    error.status = 503;
    throw error;
  }
  return crypto.scryptSync(secret, salt, 32);
}

function encryptArchive(buffer) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = encryptionKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from("RMSE1"), salt, iv, cipher.getAuthTag(), encrypted]);
}

function decryptArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 49 || buffer.subarray(0, 5).toString() !== "RMSE1") {
    throw new Error("This file is not a supported encrypted system backup.");
  }
  const salt = buffer.subarray(5, 21);
  const iv = buffer.subarray(21, 33);
  const tag = buffer.subarray(33, 49);
  const encrypted = buffer.subarray(49);
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("BACKUP_ENCRYPTION_KEY is not configured on the backend.");
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

async function ensureBucket(name, isPublic = false) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const existing = (buckets || []).find(bucket => bucket.name === name);

  if (existing) {
    // Existing buckets retain their old restrictions. Explicitly configure
    // the backup bucket so the small archive chunks can be uploaded.
    if (name === BACKUP_BUCKET) {
      const { error: updateError } = await supabase.storage.updateBucket(name, {
        public: false,
        fileSizeLimit: "4MB",
      });
      if (updateError) {
        throw new Error(
          "Unable to configure the private system-backups bucket. Check the Supabase global file-size limit and bucket settings: " +
          updateError.message
        );
      }
    }
    return;
  }

  const { error } = await supabase.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit: name === BACKUP_BUCKET ? "4MB" : "2GB",
  });

  if (error && !/already exists|duplicate/i.test(error.message || "")) throw error;
}

async function fetchAllTableRows(tableName) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(tableName).select("*").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to back up table " + tableName + ": " + error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function listStorageFiles(bucket, folder = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    // Check before and after every Storage listing request so cancellation
    // does not have to wait for the entire bucket tree to be scanned.
    checkBackupCancelled();
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    checkBackupCancelled();
    if (error) throw new Error("Unable to list uploaded files in " + bucket + ": " + error.message);
    const entries = data || [];
    for (const entry of entries) {
      checkBackupCancelled();
      if (entry.id === null) {
        const child = folder ? folder + "/" + entry.name : entry.name;
        files.push(...await listStorageFiles(bucket, child));
      } else {
        const path = folder ? folder + "/" + entry.name : entry.name;
        files.push({ path, name: entry.name, metadata: entry.metadata || {} });
      }
    }
    if (entries.length < PAGE_SIZE) break;
  }
  return files;
}

async function createSystemBackup(req, res) {
  let archiveParts = [];
  try {
    backupCancelRequested = false;
    setBackupProgress(1, "Preparing secure backup storage", { active: true, status: "running", error: null });
    encryptionKey();
    await ensureBucket(BACKUP_BUCKET, false);
    checkBackupCancelled();
    setBackupProgress(5, "Secure backup storage is ready");

    const zip = new AdmZip();
    const createdAt = new Date().toISOString();
    const backupId = "backup-" + createdAt.replace(/[:.]/g, "-");
    const tableCounts = {};
    let totalRows = 0;

    for (let index = 0; index < TABLES.length; index++) {
      checkBackupCancelled();
      const table = TABLES[index];
      const rows = await fetchAllTableRows(table.name);
      checkBackupCancelled();
      tableCounts[table.name] = rows.length;
      totalRows += rows.length;
      zip.addFile("database/" + table.name + ".json", Buffer.from(JSON.stringify(rows), "utf8"));
      const percent = 8 + ((index + 1) / TABLES.length) * 32;
      setBackupProgress(percent, "Exporting database tables (" + (index + 1) + " of " + TABLES.length + "): " + table.name, {
        completedTables: index + 1, totalTables: TABLES.length, totalRows
      });
    }

    setBackupProgress(43, "Finding uploaded applicant files");
    checkBackupCancelled();
    const sourceFiles = await listStorageFiles(SOURCE_BUCKET);
    checkBackupCancelled();
    const fileManifest = [];
    let fileBytes = 0;
    setBackupProgress(47, sourceFiles.length
      ? "Collecting uploaded applicant files (0 of " + sourceFiles.length + ")"
      : "No uploaded applicant files found", { completedFiles: 0, totalFiles: sourceFiles.length });

    for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
      checkBackupCancelled();
      const file = sourceFiles[fileIndex];
      const { data, error } = await supabase.storage.from(SOURCE_BUCKET).download(file.path);
      checkBackupCancelled();
      if (error || !data) throw new Error("Unable to download uploaded file " + file.path + ": " + (error?.message || "No file data returned."));
      const bytes = Buffer.from(await data.arrayBuffer());
      zip.addFile("storage/" + SOURCE_BUCKET + "/" + file.path, bytes);
      fileBytes += bytes.length;
      fileManifest.push({
        bucket: SOURCE_BUCKET,
        path: file.path,
        size: bytes.length,
        contentType: file.metadata?.mimetype || file.metadata?.contentType || "application/octet-stream",
      });
      const percent = 47 + ((fileIndex + 1) / Math.max(sourceFiles.length, 1)) * 23;
      setBackupProgress(percent, "Collecting uploaded applicant files (" + (fileIndex + 1) + " of " + sourceFiles.length + ")", {
        completedFiles: fileIndex + 1, totalFiles: sourceFiles.length, fileBytes
      });
    }

    const manifest = {
      version: BACKUP_VERSION,
      backupId,
      createdAt,
      createdBy: req.user?.username || req.user?.email || "Administrator",
      database: { tables: tableCounts, totalRows },
      storage: { bucket: SOURCE_BUCKET, fileCount: fileManifest.length, totalBytes: fileBytes, files: fileManifest },
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

    setBackupProgress(73, "Compressing and encrypting backup archive");
    const archiveBuffer = zip.toBuffer();
    setBackupProgress(77, "Encrypting backup archive");
    const encrypted = encryptArchive(archiveBuffer);

    // Keep each Storage object comfortably below the configured 4 MB bucket limit.
    const ARCHIVE_PART_SIZE = 3 * 1024 * 1024;
    const storage = supabase.storage.from(BACKUP_BUCKET);
    const totalParts = Math.ceil(encrypted.length / ARCHIVE_PART_SIZE);
    setBackupProgress(82, "Uploading encrypted archive (0 of " + totalParts + " parts)", { totalParts, completedParts: 0 });

    for (let offset = 0, partNumber = 1; offset < encrypted.length; offset += ARCHIVE_PART_SIZE, partNumber++) {
      checkBackupCancelled();
      const partPath = backupId + ".part-" + String(partNumber).padStart(4, "0");
      const part = encrypted.subarray(offset, Math.min(offset + ARCHIVE_PART_SIZE, encrypted.length));
      const { error: partError } = await storage.upload(partPath, part, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (partError) {
        if (archiveParts.length) await storage.remove(archiveParts);
        throw new Error("Unable to upload backup archive part " + partNumber + ": " + partError.message);
      }
      archiveParts.push(partPath);
      checkBackupCancelled();
      const percent = 82 + (partNumber / totalParts) * 15;
      setBackupProgress(percent, "Uploading encrypted archive (" + partNumber + " of " + totalParts + " parts)", {
        completedParts: partNumber, totalParts
      });
    }

    checkBackupCancelled();
    setBackupProgress(98, "Saving backup manifest and finalizing");
    const metadata = {
      version: BACKUP_VERSION,
      backupId,
      createdAt,
      createdBy: manifest.createdBy,
      archiveParts,
      archiveBytes: encrypted.length,
      totalRows,
      tableCounts,
      fileCount: fileManifest.length,
      fileBytes,
      status: "Verified",
    };
    const { error: metadataError } = await storage.upload(
      backupId + ".json",
      Buffer.from(JSON.stringify(metadata), "utf8"),
      { contentType: "application/json", upsert: false }
    );
    if (metadataError) {
      await storage.remove(archiveParts);
      throw metadataError;
    }

    setBackupProgress(100, "Backup completed successfully", {
      active: false, status: "completed", backupId, totalRows, fileCount: fileManifest.length
    });

    await createAuditLogFromRequest(req, {
      action: "SYSTEM_BACKUP_CREATED",
      entityType: "SYSTEM_BACKUP",
      entityId: backupId,
      details: "Encrypted backup created with " + totalRows + " database rows and " + fileManifest.length + " uploaded files.",
    });

    return res.status(201).json({ success: true, message: "Encrypted system backup created and verified.", backup: metadata });
  } catch (error) {
    console.error("Create system backup error:", error);
    if (archiveParts.length) {
      const { error: cleanupError } = await supabase.storage.from(BACKUP_BUCKET).remove(archiveParts);
      if (cleanupError) console.error("Unable to remove cancelled/partial backup parts:", cleanupError.message);
    }
    const cancelled = error.code === "BACKUP_CANCELLED";
    setBackupProgress(currentBackupProgress.percent, cancelled ? "Backup cancelled. Temporary files were cleaned up." : "Backup failed: " + (error.message || "Unknown error"), {
      active: false, status: cancelled ? "cancelled" : "failed", error: error.message || "Unable to create system backup."
    });
    backupCancelRequested = false;
    return res.status(cancelled ? 409 : (error.status || 500)).json({ success: false, cancelled, message: error.message || "Unable to create system backup." });
  }
}

async function listSystemBackups(req, res) {
  try {
    // Listing an empty backup history must not require encryption setup or
    // attempt to create a bucket as a side effect. The private bucket is
    // created when the first backup is requested.
    const { data, error } = await supabase.storage.from(BACKUP_BUCKET).list("", {
      limit: 1000,
      sortBy: { column: "name", order: "desc" },
    });

    if (error) {
      // A missing bucket means that no backup has been created yet.
      // Return an empty history instead of failing the whole admin page.
      if (/bucket not found|not found/i.test(error.message || "")) {
        return res.json({ success: true, backups: [] });
      }
      throw error;
    }

    const metadataFiles = (data || []).filter(item =>
      item && typeof item.name === "string" && item.name.endsWith(".json")
    );
    const backups = [];

    for (const item of metadataFiles) {
      const { data: file, error: downloadError } =
        await supabase.storage.from(BACKUP_BUCKET).download(item.name);

      if (downloadError || !file) {
        console.warn("[Backups] Skipping unreadable backup metadata:", item.name, downloadError?.message);
        continue;
      }

      try {
        const metadata = JSON.parse(await file.text());
        // Only list metadata entries that point to a plausible archive.
        if (
          metadata &&
          typeof metadata.backupId === "string" &&
          typeof metadata.createdAt === "string" &&
          (
            typeof metadata.archivePath === "string" ||
            (Array.isArray(metadata.archiveParts) && metadata.archiveParts.length > 0)
          )
        ) {
          backups.push(metadata);
        }
      } catch (parseError) {
        console.warn("[Backups] Skipping invalid metadata file:", item.name, parseError.message);
      }
    }

    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json({ success: true, backups });
  } catch (error) {
    console.error("List system backups error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load backup history from Supabase Storage.",
      error: error.message || "Unknown storage error.",
    });
  }
}

async function restoreSystemBackup(req, res) {
  try {
    encryptionKey();
    const backupId = String(req.params.backupId || "");
    if (!/^backup-[0-9T-]+Z$/.test(backupId)) {
      return res.status(400).json({ success: false, message: "Invalid backup identifier." });
    }
    await ensureBucket(BACKUP_BUCKET, false);

    const storage = supabase.storage.from(BACKUP_BUCKET);
    const { data: metadataBlob, error: metadataError } = await storage.download(backupId + ".json");
    if (metadataError || !metadataBlob) {
      return res.status(404).json({ success: false, message: "Backup metadata was not found." });
    }

    const metadata = JSON.parse(await metadataBlob.text());
    let encryptedArchive;

    if (Array.isArray(metadata.archiveParts) && metadata.archiveParts.length > 0) {
      const parts = [];
      for (const partPath of metadata.archiveParts) {
        if (typeof partPath !== "string" || !partPath.startsWith(backupId + ".part-")) {
          throw new Error("Backup archive contains an invalid part reference.");
        }
        const { data: partBlob, error: partError } = await storage.download(partPath);
        if (partError || !partBlob) {
          throw new Error("Backup archive part is missing: " + partPath);
        }
        parts.push(Buffer.from(await partBlob.arrayBuffer()));
      }
      encryptedArchive = Buffer.concat(parts);
    } else if (typeof metadata.archivePath === "string") {
      // Backward compatibility for backups created before archive chunking.
      const { data: archiveBlob, error: archiveError } = await storage.download(metadata.archivePath);
      if (archiveError || !archiveBlob) {
        return res.status(404).json({ success: false, message: "Backup archive was not found." });
      }
      encryptedArchive = Buffer.from(await archiveBlob.arrayBuffer());
    } else {
      throw new Error("Backup archive information is missing from its metadata.");
    }

    if (metadata.archiveBytes && encryptedArchive.length !== Number(metadata.archiveBytes)) {
      throw new Error("Backup archive is incomplete. The downloaded size does not match its metadata.");
    }

    const archiveBuffer = decryptArchive(encryptedArchive);
    const zip = new AdmZip(archiveBuffer);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) throw new Error("Backup manifest is missing.");
    const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    if (manifest.version !== BACKUP_VERSION || manifest.backupId !== backupId) throw new Error("Backup manifest is invalid or uses an unsupported version.");

    const restored = {};
    const skipped = {};
    const failed = [];
    const tableData = manifest.database?.tables || {};

    for (const table of TABLES) {
      const entry = zip.getEntry("database/" + table.name + ".json");
      if (!entry) {
        failed.push({ item: table.name, reason: "Table data is missing from the archive." });
        continue;
      }
      const rows = JSON.parse(entry.getData().toString("utf8"));
      let inserted = 0;
      let ignored = 0;
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        if (!batch.length) continue;
        const { data, error } = await supabase.from(table.name).upsert(batch, {
          onConflict: table.conflict,
          ignoreDuplicates: true,
        }).select(table.conflict);
        if (error) {
          failed.push({ item: table.name, reason: error.message });
          break;
        }
        inserted += (data || []).length;
        ignored += batch.length - (data || []).length;
      }
      restored[table.name] = inserted;
      skipped[table.name] = ignored;
    }

    let filesRestored = 0;
    let filesSkipped = 0;
    for (const file of manifest.storage?.files || []) {
      if (file.bucket !== SOURCE_BUCKET || !file.path || file.path.startsWith("/") || file.path.split("/").includes("..")) {
        failed.push({ item: file.path || "unknown file", reason: "Unsafe or unsupported file path." });
        continue;
      }
      const archiveEntry = zip.getEntry("storage/" + SOURCE_BUCKET + "/" + file.path);
      if (!archiveEntry) {
        failed.push({ item: file.path, reason: "Uploaded file is missing from the archive." });
        continue;
      }

      const segments = file.path.split("/");
      const filename = segments.pop();
      const folder = segments.join("/");
      const { data: existing, error: listError } = await supabase.storage.from(SOURCE_BUCKET).list(folder, {
        limit: 1000,
        search: filename,
      });
      if (listError) {
        failed.push({ item: file.path, reason: listError.message });
        continue;
      }
      if ((existing || []).some(item => item.name === filename && item.id !== null)) {
        filesSkipped++;
        continue;
      }

      const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(
        file.path,
        archiveEntry.getData(),
        { contentType: file.contentType || "application/octet-stream", upsert: false }
      );
      if (uploadError) {
        if (/already exists|duplicate/i.test(uploadError.message || "")) filesSkipped++;
        else failed.push({ item: file.path, reason: uploadError.message });
      } else {
        filesRestored++;
      }
    }

    const summary = {
      backupId,
      tables: restored,
      skippedExistingRows: skipped,
      filesRestored,
      filesSkipped,
      failures: failed,
    };

    await createAuditLogFromRequest(req, {
      action: "SYSTEM_BACKUP_RESTORED",
      entityType: "SYSTEM_BACKUP",
      entityId: backupId,
      details: "Non-destructive recovery completed. Restored " + Object.values(restored).reduce((a, b) => a + b, 0) + " rows and " + filesRestored + " files; " + failed.length + " issues.",
    });

    return res.json({
      success: failed.length === 0,
      message: failed.length ? "Recovery finished with some items that need attention. Existing records and files were not overwritten." : "Recovery completed. Missing records and files were restored; existing records and files were preserved.",
      summary,
    });
  } catch (error) {
    console.error("Restore system backup error:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to restore this backup." });
  }
}

module.exports = {
  createSystemBackup,
  getSystemBackupProgress,
  cancelSystemBackup,
  listSystemBackups,
  restoreSystemBackup,
};
