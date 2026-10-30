const supabase = require("../config/supabase");

const ALLOWED_STATUSES = [
  "Queued",
  "In Production",
  "Printed",
  "In Transit",
  "Completed",
];

const normalizeControlNo = (value, applicationId) => {
  const controlNo = String(value || "").trim();
  if (!controlNo) return "";

  if (/^CTRL-\d{2}-\d{4}$/i.test(controlNo)) return controlNo.toUpperCase();
  if (/^CTL-\d{2}-\d{4}$/i.test(controlNo)) {
    return controlNo.replace(/^CTL-/i, "CTRL-").toUpperCase();
  }

  if (/OSCA/i.test(controlNo)) {
    const digits = String(applicationId || controlNo).replace(/\D/g, "");
    if (digits.length >= 6) {
      return `CTRL-${digits.slice(0, 2)}-${digits.slice(-4)}`;
    }
  }

  return controlNo;
};

const isMissingCompletedAtColumn = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return Boolean(error) && (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("completed_at") && (message.includes("column") || message.includes("schema cache")))
  );
};

const createSignedFileUrlMap = async (filePaths) => {
  const paths = Array.from(new Set(filePaths.filter(Boolean)));
  if (!paths.length) return new Map();

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrls(paths, 60 * 30);

  if (error) {
    console.error("Unable to create ID Maker media URLs:", error);
    return new Map();
  }

  return new Map((data || []).map((item) => [
    item.path,
    item.signedUrl || "",
  ]));
};

// Keep request URLs small: .in() with hundreds of ids can exceed URL limits.
const chunk = (arr, size = 100) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchByApplicationIds = async (table, columns, ids) => {
  const results = await Promise.all(
    chunk(ids).map((part) =>
      supabase.from(table).select(columns).in("application_id", part)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return results.flatMap((r) => r.data || []);
};

// ============================================
// CREATE / ADD APPLICANT TO ID MAKER QUEUE
// ============================================
const addToIdMakerQueue = async (req, res) => {
  try {
    const {
      application_id,
      control_no,
      date_issued,
      print_status,
    } = req.body;

    if (!application_id) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("application_id")
      .eq("application_id", application_id)
      .maybeSingle();

    if (applicationError) throw applicationError;

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    let { data: existingQueueItem, error: existingQueueError } = await supabase
      .from("id_maker_queue")
      .select("completed_at")
      .eq("application_id", application_id)
      .limit(1)
      .maybeSingle();

    let completionTimestampAvailable = true;
    if (isMissingCompletedAtColumn(existingQueueError)) {
      completionTimestampAvailable = false;
      existingQueueItem = null;
      existingQueueError = null;
    }
    if (existingQueueError) throw existingQueueError;

    const queueStatus = print_status || "Queued";

    if (!ALLOWED_STATUSES.includes(queueStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID Maker queue status.",
      });
    }

    const queuePayload = {
      application_id: application_id,
      control_no: normalizeControlNo(control_no, application_id) || null,
      date_issued: date_issued || null,
      print_status: queueStatus,
      updated_at: new Date().toISOString(),
    };
    if (completionTimestampAvailable) {
      queuePayload.completed_at = queueStatus === "Completed"
        ? (existingQueueItem?.completed_at || new Date().toISOString())
        : (existingQueueItem?.completed_at ?? null);
    }

    const { data, error } = await supabase
      .from("id_maker_queue")
      .upsert(queuePayload, { onConflict: "application_id" })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Applicant added to ID Maker queue successfully.",
      queue: data,
    });
  } catch (error) {
    console.error("Error adding applicant to ID Maker queue:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add applicant to ID Maker queue.",
      error: error.message,
    });
  }
};

// ============================================
// GET ID MAKER QUEUE
// ============================================
const getIdMakerQueue = async (req, res) => {
  try {
    // 1. Queue records
    let queueResult = await supabase
      .from("id_maker_queue")
      .select(`
        id,
        application_id,
        control_no,
        date_issued,
        print_status,
        sent_at,
        updated_at,
        completed_at
      `)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("sent_at", { ascending: false, nullsFirst: false });

    let completionTimestampAvailable = true;
    if (isMissingCompletedAtColumn(queueResult.error)) {
      completionTimestampAvailable = false;
      queueResult = await supabase
        .from("id_maker_queue")
        .select(`
          id,
          application_id,
          control_no,
          date_issued,
          print_status,
          sent_at,
          updated_at
        `)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("sent_at", { ascending: false, nullsFirst: false });
    }

    if (queueResult.error) throw queueResult.error;
    const queueRecords = queueResult.data;

    const applicationIds = Array.from(
      new Set(
        (queueRecords || [])
          .map((item) => String(item.application_id || "").trim())
          .filter(Boolean)
      )
    );

    if (applicationIds.length === 0) {
      return res.status(200).json({
        success: true,
        queue: [],
        completion_timestamp_available: completionTimestampAvailable,
      });
    }

    // 2. Application + file records (chunked)
    const applications = await fetchByApplicationIds(
      "applications",
      "*",
      applicationIds
    );

    const applicationFiles = await fetchByApplicationIds(
      "application_files",
      "application_id, latest_photo_url, signature_url",
      applicationIds
    );

    const fileMap = new Map(
      applicationFiles.map((file) => [
        String(file.application_id || "").trim(),
        file,
      ])
    );

    // Sign every photo and signature in one Storage request.
    const signedUrls = await createSignedFileUrlMap(
      applicationFiles.flatMap((file) => [
        file.latest_photo_url,
        file.signature_url,
      ])
    );

    // 3. Lookup maps
    const applicationMap = new Map(
      applications.map((application) => [
        String(application.application_id || "").trim(),
        application,
      ])
    );

    // Keep the newest record per application (results are newest-first).
    const queueMap = new Map();
    for (const item of queueRecords || []) {
      const key = String(item.application_id || "").trim();
      if (key && !queueMap.has(key)) queueMap.set(key, item);
    }

    const queueEntries = applicationIds
      .map((applicationId) => ({
        applicationId,
        queueItem: queueMap.get(applicationId),
        application: applicationMap.get(applicationId),
      }))
      .filter(({ queueItem }) => Boolean(queueItem));

    // 4. Build response
    const completeQueue = queueEntries.map(
      ({ applicationId, queueItem, application }) => {
        const files = fileMap.get(applicationId) || {};
        const photo = signedUrls.get(files.latest_photo_url) || "";
        const signature = signedUrls.get(files.signature_url) || "";

        const firstName = application?.first_name || application?.firstName || "";
        const middleName = application?.middle_name || application?.middleName || "";
        const surname = application?.surname || application?.last_name || application?.lastName || "";
        const fullName = application?.name || application?.full_name || application?.applicant_name || [
          firstName,
          middleName,
          surname,
        ]
          .map((part) => String(part || "").trim())
          .filter(Boolean)
          .join(" ");

        return {
          id: applicationId,
          application_id: applicationId,
          inPrintQueue: Boolean(queueItem),

          name: fullName,
          firstName,
          middleName,
          surname,
          address: application?.house_street || application?.houseStreet || application?.address || "",
          barangay: String(application?.barangay_district || application?.barangayDistrict || application?.barangay || "").trim(),
          dob: application?.date_of_birth || application?.dateOfBirth || application?.dob || "",
          gender: application?.sex || application?.gender || "",
          age: application?.age || "",

          controlNo: normalizeControlNo(queueItem?.control_no, applicationId),
          dateIssued: queueItem?.date_issued || "",

          photo,
          signature,

          printStatus: queueItem?.print_status || "Queued",
          linkedToApplication: Boolean(application),

          sentAt: queueItem?.sent_at || null,
          updatedAt: queueItem?.updated_at || null,
          completedAt: queueItem?.completed_at || null,
          regDate: application?.created_at || "",
        };
      }
    );

    return res.status(200).json({
      success: true,
      queue: completeQueue,
      completion_timestamp_available: completionTimestampAvailable,
    });
  } catch (error) {
    console.error("Error fetching ID Maker queue:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve ID Maker queue.",
      error: error.message,
    });
  }
};

// ============================================
// UPDATE ID MAKER QUEUE STATUS
// ============================================
const updateIdMakerQueue = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;

    const { print_status, control_no, date_issued } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    if (
      print_status !== undefined &&
      !ALLOWED_STATUSES.includes(print_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID Maker queue status.",
      });
    }

    const updatedAt = new Date().toISOString();

    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("application_id")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (applicationError) throw applicationError;

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found; cannot update its ID Maker queue status.",
      });
    }

    let { data: existingQueueItem, error: lookupError } = await supabase
      .from("id_maker_queue")
      .select("control_no, date_issued, completed_at, print_status")
      .eq("application_id", applicationId)
      .limit(1)
      .maybeSingle();

    let completionTimestampAvailable = true;
    if (isMissingCompletedAtColumn(lookupError)) {
      completionTimestampAvailable = false;
      const fallbackLookup = await supabase
        .from("id_maker_queue")
        .select("control_no, date_issued, print_status")
        .eq("application_id", applicationId)
        .limit(1)
        .maybeSingle();
      existingQueueItem = fallbackLookup.data;
      lookupError = fallbackLookup.error;
    }

    if (lookupError) throw lookupError;

    const queuePayload = {
      application_id: applicationId,
      print_status: print_status ?? existingQueueItem?.print_status ?? "Queued",
      control_no: normalizeControlNo(
        control_no ?? existingQueueItem?.control_no,
        applicationId
      ) || null,
      date_issued: date_issued ?? existingQueueItem?.date_issued ?? null,
      updated_at: updatedAt,
    };
    if (completionTimestampAvailable) {
      queuePayload.completed_at = print_status === "Completed"
        ? (existingQueueItem?.completed_at || updatedAt)
        : (existingQueueItem?.completed_at ?? null);
    }

    const { data, error } = await supabase
      .from("id_maker_queue")
      .upsert(queuePayload, { onConflict: "application_id" })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "ID Maker queue updated successfully.",
      queue: data,
    });
  } catch (error) {
    console.error("Error updating ID Maker queue:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update ID Maker queue.",
      error: error.message,
    });
  }
};

module.exports = {
  addToIdMakerQueue,
  getIdMakerQueue,
  updateIdMakerQueue,
};
