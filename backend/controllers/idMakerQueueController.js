const supabase = require("../config/supabase");

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

    // Allowed queue statuses
    const allowedStatuses = [
      "Queued",
      "In Production",
      "Printed",
      "In Transit",
    ];

    const queueStatus = print_status || "Queued";

    if (!allowedStatuses.includes(queueStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID Maker queue status.",
      });
    }

    // Save / update queue record
    const { data, error } = await supabase
      .from("id_maker_queue")
      .upsert(
        {
          application_id: application_id,
          control_no: control_no || null,
          date_issued: date_issued || null,
          print_status: queueStatus,
          updated_at: new Date().toISOString(),
        },
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
    const {
      data: queueRecords,
      error: queueError,
    } = await supabase
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
      .order("sent_at", {
        ascending: false,
      });

    if (queueError) {
      throw queueError;
    }

    if (!queueRecords || queueRecords.length === 0) {
      return res.status(200).json({
        success: true,
        queue: [],
      });
    }

    // 2. GET ONLY THE APPLICATION FIELDS NEEDED
    const applicationIds =
      queueRecords.map(
        (item) => item.application_id
      );

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

    // 4. BUILD LIGHTWEIGHT QUEUE RESPONSE
    const completeQueue =
      queueRecords.map(
        (queueItem) => {

          const application =
            applicationMap.get(
              String(
                queueItem.application_id
              )
            );

          const fullName = [
            application?.first_name,
            application?.middle_name,
            application?.surname,
          ]
            .filter(Boolean)
            .join(" ");

          return {
            id:
              queueItem.application_id,

            application_id:
              queueItem.application_id,

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
              queueItem.control_no ||
              "",

            dateIssued:
              queueItem.date_issued ||
              "",

            photo:
              "",

            signature:
              "",

            printStatus:
              queueItem.print_status ||
              "Queued",

            sentAt:
              queueItem.sent_at ||
              null,

            updatedAt:
              queueItem.updated_at ||
              null,

            regDate:
              application?.created_at ||
              "",
          };
        }
      );

    return res.status(200).json({
      success: true,
      queue: completeQueue,
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
    ];

    if (
      print_status &&
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

    const { data, error } = await supabase
      .from("id_maker_queue")
      .update(updateData)
      .eq("application_id", applicationId)
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