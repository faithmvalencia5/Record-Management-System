
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

    const allowedStatuses = [
      "Pending",
      "Under Review",
      "In Process",
      "Ready for Release",
      "Completed",
      "Rejected",
    ];

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid request ID is required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status.",
      });
    }

    // Save both related status updates in one database transaction.
    const { data, error } = await supabase.rpc(
      "update_replacement_request_status",
      {
        p_request_id: requestId,
        p_status: status,
      }
    );

    if (error) {
      throw error;
    }

    if (!data || data.success !== true || !data.request) {
      throw new Error("The database did not confirm the status update.");
    }

    return res.status(200).json({
      success: true,
      message: data.message,
      request: data.request,
    });
  } catch (error) {
    console.error("Failed to save replacement status:", error);

    return res.status(500).json({
      success: false,
      message: "The status could not be saved. Please try again.",
    });
  }
};


module.exports = {
  getReplacementRequests,
  getReplacementRequestById,
  decideReplacementRequest,
};
