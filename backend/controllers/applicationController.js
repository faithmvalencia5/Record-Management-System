const supabase = require("../config/supabase");

const createSignedFileUrl = async (filePath) => {
  if (!filePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(filePath, 60 * 30);

  if (error) {
    console.error("Unable to create signed URL:", filePath, error);

    return null;
  }

  return data?.signedUrl || null;
};

const getApplications = async (req, res) => {
  try {
    // Get applications
    const { data: applications, error: applicationsError } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (applicationsError) {
      throw applicationsError;
    }

    if (!applications || applications.length === 0) {
      return res.status(200).json({
        success: true,
        applications: [],
      });
    }

    // Get application IDs
    const applicationIds = applications.map(
      (application) => application.application_id,
    );

    // Get uploaded files
    const { data: files, error: filesError } = await supabase
      .from("application_files")
      .select(
        `
        application_id,
        valid_id_url,
        valid_id_back_url,
        latest_photo_url,
        birth_certificate_url,
        community_tax_certificate_url,
        signature_url,
        authentication_status,
        authentication_method,
        authenticated_by,
        authenticated_at,
        authentication_remarks,
        supporting_document_type
      `,
      )
      .in("application_id", applicationIds);

    if (filesError) {
      throw filesError;
    }

    // Get status history
    const { data: statusHistory, error: statusHistoryError } = await supabase
      .from("application_status_history")
      .select("*")
      .in("application_id", applicationIds)
      .order("updated_at", { ascending: false });

    if (statusHistoryError) {
      throw statusHistoryError;
    }

    // Attach files + status to each application
    const applicationsWithFiles = await Promise.all(
      applications.map(async (application) => {
        // Find latest status
        const latestStatus = statusHistory?.find(
          (history) => history.application_id === application.application_id,
        );

        const currentStatus =
          latestStatus?.status || application.status || "Pending";

        const statusUpdatedAt =
          latestStatus?.updated_at ||
          application.updated_at ||
          application.created_at ||
          null;

        // Find uploaded documents
        const fileRecord = files?.find(
          (file) => file.application_id === application.application_id,
        );

        // If no files exist
        if (!fileRecord) {
          return {
            ...application,

            status: currentStatus,
            status_updated_at: statusUpdatedAt,

            documents: {
              idFront: null,
              idBack: null,
              photo: null,
              bc: null,
              cedula: null,
              signature: null,
            },

            document_files: null,
          };
        }

        // CREATE SIGNED URLS
        const [
          validIdFrontUrl,
          validIdBackUrl,
          photoUrl,
          birthCertificateUrl,
          cedulaUrl,
          signatureUrl,
        ] = await Promise.all([
          createSignedFileUrl(fileRecord.valid_id_url),

          createSignedFileUrl(fileRecord.valid_id_back_url),

          createSignedFileUrl(fileRecord.latest_photo_url),

          createSignedFileUrl(fileRecord.birth_certificate_url),

          createSignedFileUrl(fileRecord.community_tax_certificate_url),

          createSignedFileUrl(fileRecord.signature_url),
        ]);

        // RETURN COMPLETE APPLICATION
        return {
          ...application,

          // Current application status
          status: currentStatus,

          // Date/time when the current status was updated
          status_updated_at: statusUpdatedAt,

          // Used by the Applications and Applicants tables
          documents: {
            idFront: validIdFrontUrl,
            idBack: validIdBackUrl,
            photo: photoUrl,
            bc: birthCertificateUrl,
            cedula: cedulaUrl,
            signature: signatureUrl,
          },

          // Full document information
          document_files: {
            ...fileRecord,

            valid_id_url: validIdFrontUrl,

            valid_id_back_url: validIdBackUrl,

            latest_photo_url: photoUrl,

            birth_certificate_url: birthCertificateUrl,

            community_tax_certificate_url: cedulaUrl,

            signature_url: signatureUrl,
          },
        };
      }),
    );

    // RESPONSE
    res.status(200).json({
      success: true,
      applications: applicationsWithFiles,
    });
  } catch (error) {
    console.error("Error fetching applications:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve applications.",
      error: error.message,
    });
  }
};

// GET APPLICATION BY ID
const getApplicationById = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    // GET ALL APPLICATION INFORMATION
    const [
      applicationResult,
      familyResult,
      membershipResult,
      personalBackgroundResult,
      problemsNeedsResult,
      applicationFilesResult,
      confirmationsResult,
      documentAuthenticationsResult,
      statusHistoryResult,
    ] = await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("family_composition")
        .select("*")
        .eq("application_id", applicationId)
        .order("id", {
          ascending: true,
        }),

      supabase
        .from("memberships")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("personal_background")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("problems_needs")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("application_files")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("confirmations")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle(),

      supabase
        .from("document_authentications")
        .select("*")
        .eq("application_id", applicationId)
        .order("id", {
          ascending: true,
        }),

      supabase
        .from("application_status_history")
        .select("*")
        .eq("application_id", applicationId)
        .order("updated_at", {
          ascending: false,
        }),
    ]);

    // CHECK ERRORS
    const errors = [
      applicationResult.error,
      familyResult.error,
      membershipResult.error,
      personalBackgroundResult.error,
      problemsNeedsResult.error,
      applicationFilesResult.error,
      confirmationsResult.error,
      documentAuthenticationsResult.error,
      statusHistoryResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw errors[0];
    }

    // APPLICATION NOT FOUND
    if (!applicationResult.data) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    // APPLICATION FILES
    const applicationFiles = applicationFilesResult.data || null;

    let filesWithSignedUrls = null;

    if (applicationFiles) {
      const [
        validIdFrontSignedUrl,
        validIdBackSignedUrl,
        latestPhotoSignedUrl,
        birthCertificateSignedUrl,
        communityTaxSignedUrl,
        signatureSignedUrl,
      ] = await Promise.all([
        createSignedFileUrl(applicationFiles.valid_id_url),

        createSignedFileUrl(applicationFiles.valid_id_back_url),

        createSignedFileUrl(applicationFiles.latest_photo_url),

        createSignedFileUrl(applicationFiles.birth_certificate_url),

        createSignedFileUrl(applicationFiles.community_tax_certificate_url),

        createSignedFileUrl(applicationFiles.signature_url),
      ]);

      filesWithSignedUrls = {
        ...applicationFiles,

        valid_id_signed_url: validIdFrontSignedUrl,

        valid_id_back_signed_url: validIdBackSignedUrl,

        latest_photo_signed_url: latestPhotoSignedUrl,

        birth_certificate_signed_url: birthCertificateSignedUrl,

        community_tax_certificate_signed_url: communityTaxSignedUrl,

        signature_signed_url: signatureSignedUrl,
      };
    }

    // RESPONSE
    res.status(200).json({
      success: true,

      application: applicationResult.data,

      familyComposition: familyResult.data || [],

      membership: membershipResult.data || null,

      personalBackground: personalBackgroundResult.data || null,

      problemsNeeds: problemsNeedsResult.data || null,

      applicationFiles: filesWithSignedUrls,

      confirmations: confirmationsResult.data || null,

      documentAuthentications: documentAuthenticationsResult.data || [],

      statusHistory: statusHistoryResult.data || [],
    });
  } catch (error) {
    console.error("Error fetching application detail:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve application details.",
      error: error.message,
    });
  }
};

// SAVE APPLICATION VALIDATION
const saveApplicationValidation = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;

    const { validation_status, validation_notes } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    if (!validation_status) {
      return res.status(400).json({
        success: false,
        message: "Validation status is required.",
      });
    }

    const { data, error } = await supabase
      .from("applications")
      .update({
        validation_status: validation_status,

        validation_updated_at: new Date().toISOString(),

        validation_notes: validation_notes || null,
      })
      .eq("application_id", applicationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,

      message: "Validation result saved successfully.",

      application: data,
    });
  } catch (error) {
    console.error("Error saving validation:", error);

    res.status(500).json({
      success: false,

      message: "Failed to save validation result.",

      error: error.message,
    });
  }
};

// UPDATE APPLICATION STATUS
const updateApplicationStatus = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;
    const { status } = req.body;

    const allowedStatuses = [
      "Pending",
      "Under Review",
      "In Process",
      "Ready for Release",
      "Completed",
      "Rejected",
    ];

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status.",
      });
    }

    // Check that the application actually exists
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
        message: "Application not found.",
      });
    }

    // Update the existing status record
    const { data: statusRecord, error: statusError } = await supabase
      .from("application_status_history")
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("application_id", applicationId)
      .select()
      .single();

    if (statusError) {
      throw statusError;
    }

    res.status(200).json({
      success: true,
      message: "Application status updated successfully.",
      status: status,
      statusHistory: statusRecord,
    });
  } catch (error) {
    console.error("Error updating application status:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update application status.",
      error: error.message,
    });
  }
};

// EXPORT
module.exports = {
  getApplications,
  getApplicationById,
  saveApplicationValidation,
  updateApplicationStatus,
};
