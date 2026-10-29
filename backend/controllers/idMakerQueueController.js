const supabase = require("../config/supabase");

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

    // Check if application exists
    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("application_id")
      .eq("application_id", application_id)
      .maybeSingle();

    if (applicationError) {
      throw applicationError;
    }

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
    if (existingQueueError) {
      throw existingQueueError;
    }

    // Allowed queue statuses
    const allowedStatuses = [
      "Queued",
      "In Production",
      "Printed",
      "In Transit",
      "Completed",
    ];

    const queueStatus = print_status || "Queued";

    if (!allowedStatuses.includes(queueStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID Maker queue status.",
      });
    }

    // Save / update queue record
    const queuePayload = {
      application_id: application_id,
      control_no: control_no || null,
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
      .upsert(
        queuePayload,
        {
          onConflict: "application_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

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


// GET ID MAKER QUEUE
const getIdMakerQueue = async (req, res) => {
  try {
    // 1. GET ONLY THE QUEUE FIELDS WE NEED
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
      .order("sent_at", {
        ascending: false,
      });

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
        .order("sent_at", { ascending: false });
    }

    if (queueResult.error) {
      throw queueResult.error;
    }
    const queueRecords = queueResult.data;

    // Show every database application in the ID Maker table, including older
    const applicationIds = Array.from(
      new Set(
        (queueRecords || []).map(
          (item) => String(item.application_id)
        )
      )
    );

    if (applicationIds.length === 0) {
      return res.status(200).json({
        success: true,
        queue: [],
        completion_timestamp_available: completionTimestampAvailable,
      });
    }

    // 2. GET ONLY THE APPLICATION FIELDS NEEDED

    const {
      data: applications,
      error: applicationsError,
    } = await supabase
      .from("applications")
      .select(`
        application_id,
        first_name,
        middle_name,
        surname,
        house_street,
        barangay_district,
        date_of_birth,
        sex,
        age,
        created_at
      `)
      .in(
        "application_id",
        applicationIds
      );

    if (applicationsError) {
      throw applicationsError;
    }

    const { data: applicationFiles, error: filesError } = await supabase
      .from("application_files")
      .select("application_id, latest_photo_url, signature_url")
      .in("application_id", applicationIds);

    if (filesError) throw filesError;
    const fileMap = new Map((applicationFiles || []).map(file => [
      String(file.application_id), file
    ]));

    // Sign every photo and signature in one Storage request instead of
    // issuing up to two requests per applicant before returning the queue.
    const signedUrls = await createSignedFileUrlMap(
      (applicationFiles || []).flatMap((file) => [
        file.latest_photo_url,
        file.signature_url,
      ])
    );

    // 3. CREATE A FAST LOOKUP MAP
    const applicationMap =
      new Map(
        (applications || []).map(
          (application) => [
            String(
              application.application_id
            ),
            application,
          ]
        )
      );

    const queueMap = new Map((queueRecords || []).map((item) => [
      String(item.application_id), item,
    ]));

    const queueEntries = applicationIds
      .map((applicationId) => ({
        applicationId,
        queueItem: queueMap.get(applicationId),
        application: applicationMap.get(applicationId),
      }))
      .filter(({ queueItem, application }) => queueItem || application);

    // 4. BUILD LIGHTWEIGHT QUEUE RESPONSE
    const completeQueue =
      await Promise.all(queueEntries.map(
        async ({ applicationId, queueItem, application }) => {
          const files = fileMap.get(applicationId) || {};
          const photo = signedUrls.get(files.latest_photo_url) || "";
          const signature = signedUrls.get(files.signature_url) || "";

          const fullName = [
            application?.first_name,
            application?.middle_name,
            application?.surname,
          ]
            .filter(Boolean)
            .join(" ");

          return {
            id:
              applicationId,

            application_id:
              applicationId,

            inPrintQueue:
              Boolean(queueItem),

            name:
              fullName,

            firstName:
              application?.first_name ||
              "",

            middleName:
              application?.middle_name ||
              "",

            surname:
              application?.surname ||
              "",

            address:
              application?.house_street ||
              "",

            barangay:
              application?.barangay_district ||
              "",

            dob:
              application?.date_of_birth ||
              "",

            gender:
              application?.sex ||
              "",

            age:
              application?.age ||
              "",

            controlNo:
              queueItem?.control_no ||
              "",

            dateIssued:
              queueItem?.date_issued ||
              "",

            photo:
              photo,

            signature:
              signature,

            printStatus:
              queueItem?.print_status || "Queued",

            applicationStatus:
              application?.status ||
              "",

            sentAt:
              queueItem?.sent_at ||
              null,

            updatedAt:
              queueItem?.updated_at ||
              null,

            completedAt:
              queueItem?.completed_at ||
              null,

            regDate:
              application?.created_at ||
              "",
          };
        }
      ));

    return res.status(200).json({
      success: true,
      queue: completeQueue,
      completion_timestamp_available: completionTimestampAvailable,
    });

  } catch (error) {

    console.error(
      "Error fetching ID Maker queue:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to retrieve ID Maker queue.",
      error:
        error.message,
    });
  }
};


// UPDATE ID MAKER QUEUE STATUS
const updateIdMakerQueue = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;

    const {
      print_status,
      control_no,
      date_issued,
    } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    const allowedStatuses = [
      "Queued",
      "In Production",
      "Printed",
      "In Transit",
      "Completed",
    ];

    if (
      print_status !== undefined &&
      !allowedStatuses.includes(print_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID Maker queue status.",
      });
    }

    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (print_status !== undefined) {
      updateData.print_status = print_status;
    }

    if (control_no !== undefined) {
      updateData.control_no = control_no;
    }

    if (date_issued !== undefined) {
      updateData.date_issued = date_issued;
    }

    // Queue rows may not exist yet for applications shown from local state.
    // Confirm the parent record, then use one conflict-safe write path.
    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("application_id")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (applicationError) {
      throw applicationError;
    }

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

    if (lookupError) {
      throw lookupError;
    }

    const queuePayload = {
      application_id: applicationId,
      print_status: print_status ?? existingQueueItem?.print_status ?? "Queued",
      control_no: control_no ?? existingQueueItem?.control_no ?? null,
      date_issued: date_issued ?? existingQueueItem?.date_issued ?? null,
      updated_at: updateData.updated_at,
    };
    if (completionTimestampAvailable) {
      queuePayload.completed_at = print_status === "Completed"
        ? (existingQueueItem?.completed_at || updateData.updated_at)
        : (existingQueueItem?.completed_at ?? null);
    }

    const { data, error } = await supabase
      .from("id_maker_queue")
      .upsert(
        queuePayload,
        { onConflict: "application_id" }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "ID Maker queue updated successfully.",
      queue: data,
    });
  } catch (error) {
    console.error(
      "Error updating ID Maker queue:",
      error
    );

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
