
const supabase = require("../config/supabase");

// GET ALL ID REQUESTS
// Includes every reason: Lost, Damaged, and others.
const getReplacementRequests = async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from("id_requests")
      .select(`
        id,
        application_id,
        reason,
        other_reason,
        request_status,
        requested_at
      `)
      .order("requested_at", { ascending: false });

    if (error) throw error;

    const applicationIds = [
      ...new Set(
        (requests || [])
          .map((request) => request.application_id)
          .filter(Boolean)
      ),
    ];

    let applications = [];

    if (applicationIds.length > 0) {
      const { data, error: applicationError } = await supabase
        .from("applications")
        .select("*")
        .in("application_id", applicationIds);

      if (applicationError) throw applicationError;

      applications = data || [];
    }

    const applicationMap = new Map(
      applications.map((application) => [
        application.application_id,
        application,
      ])
    );

    const results = (requests || []).map((request) => {
      const application =
        applicationMap.get(request.application_id) || null;

      const applicantName = application
        ? [
            application.first_name,
            application.middle_name,
            application.surname,
          ]
            .filter(Boolean)
            .join(" ")
        : "Applicant record not found";

      return {
        ...request,
        applicant_name: applicantName,
        application,
      };
    });

    return res.json({
      success: true,
      requests: results,
    });
  } catch (error) {
    console.error("Failed to load ID requests:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load ID requests.",
      error: error.message,
    });
  }
};

// GET ONE ID REQUEST
const getReplacementRequestById = async (req, res) => {
  try {
    const requestId = Number(req.params.id);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid request ID is required.",
      });
    }

    const { data: request, error } = await supabase
      .from("id_requests")
      .select(`
        id,
        application_id,
        reason,
        other_reason,
        request_status,
        requested_at
      `)
      .eq("id", requestId)
      .maybeSingle();

    if (error) throw error;

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "ID request not found.",
      });
    }

    const { data: application, error: applicationError } =
      await supabase
        .from("applications")
        .select("*")
        .eq("application_id", request.application_id)
        .maybeSingle();

    if (applicationError) throw applicationError;

    const applicantName = application
      ? [
          application.first_name,
          application.middle_name,
          application.surname,
        ]
          .filter(Boolean)
          .join(" ")
      : "Applicant record not found";

    return res.json({
      success: true,
      request: {
        ...request,
        applicant_name: applicantName,
        application,
      },
    });
  } catch (error) {
    console.error("Failed to load ID request:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load ID request.",
      error: error.message,
    });
  }
};

// ACCEPT OR REJECT A PENDING REQUEST
const decideReplacementRequest = async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const { status } = req.body;

    // 1. Validate the request ID.
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid request ID is required.",
      });
    }

    // 2. Use the same statuses as the Applications module.
    const allowedStatuses = [
      "Pending",
      "Under Review",
      "In Process",
      "Ready for Release",
      "Completed",
      "Rejected",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status.",
      });
    }

    // 3. Find the ID request.
    const { data: existingRequest, error: findError } =
      await supabase
        .from("id_requests")
        .select("id, application_id, request_status")
        .eq("id", requestId)
        .maybeSingle();

    if (findError) throw findError;

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: "ID request not found.",
      });
    }

    const applicationId = existingRequest.application_id;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "This request has no linked application.",
      });
    }

    // 4. Update the linked application's processing stage.
    const now = new Date().toISOString();

    const { data: historyRecords, error: historyReadError } =
      await supabase
        .from("application_status_history")
        .select("application_id")
        .eq("application_id", applicationId);

    if (historyReadError) throw historyReadError;

    if (historyRecords && historyRecords.length > 0) {
      const { error: historyUpdateError } = await supabase
        .from("application_status_history")
        .update({
          status: status,
          updated_at: now,
        })
        .eq("application_id", applicationId);

      if (historyUpdateError) throw historyUpdateError;
    } else {
      const { error: historyInsertError } = await supabase
        .from("application_status_history")
        .insert({
          application_id: applicationId,
          status: status,
          updated_at: now,
        });

      if (historyInsertError) throw historyInsertError;
    }

    // 5. Update the ID request's status too.
    const { data: updatedRequest, error: requestUpdateError } =
      await supabase
        .from("id_requests")
        .update({ request_status: status })
        .eq("id", requestId)
        .select(`
          id,
          application_id,
          reason,
          other_reason,
          request_status,
          requested_at
        `)
        .single();

    if (requestUpdateError) throw requestUpdateError;

    return res.json({
      success: true,
      message: `Request status updated to ${status}.`,
      request: updatedRequest,
    });
  } catch (error) {
    console.error("Failed to update ID request status:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update ID request status.",
      error: error.message,
    });
  }
};

module.exports = {
  getReplacementRequests,
  getReplacementRequestById,
  decideReplacementRequest,
};
