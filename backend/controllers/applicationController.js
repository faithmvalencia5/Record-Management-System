const supabase = require("../config/supabase");

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} = require("docx");

const getStorageFileBuffer = async (filePath) => {
  if (!filePath) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase.storage
    .from("documents")
    .download(filePath);

  if (error || !data) {
    console.error(
      "Unable to download Storage file:",
      filePath,
      error
    );

    return null;
  }

  const arrayBuffer =
    await data.arrayBuffer();

  return Buffer.from(arrayBuffer);
};

const getDocxImageType = (filePath) => {
  const extension =
    String(filePath || "")
      .split(".")
      .pop()
      .toLowerCase();

  if (extension === "png") {
    return "png";
  }

  if (extension === "gif") {
    return "gif";
  }

  if (extension === "bmp") {
    return "bmp";
  }

  return "jpg";
};

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

// DOWNLOAD DIGITAL ISSUANCE FORM AS REAL DOCX
const downloadIssuanceDocument = async (
  req,
  res
) => {
  try {
    const applicationId =
      req.params.applicationId;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message:
          "Application ID is required.",
      });
    }

    const {
      name,
      address,
      dob,
      sex,
      dateIssued,
      controlNo,
    } = req.body || {};

    // --------------------------------------------------
    // GET APPLICATION + FILES
    // --------------------------------------------------

    const [
      applicationResult,
      filesResult,
    ] = await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq(
          "application_id",
          applicationId
        )
        .maybeSingle(),

      supabase
        .from("application_files")
        .select(
          "latest_photo_url, signature_url"
        )
        .eq(
          "application_id",
          applicationId
        )
        .maybeSingle(),
    ]);

    if (applicationResult.error) {
      throw applicationResult.error;
    }

    if (filesResult.error) {
      throw filesResult.error;
    }

    const application =
      applicationResult.data;

    const files =
      filesResult.data;

    if (!application) {
      return res.status(404).json({
        success: false,
        message:
          "Application not found.",
      });
    }

    // --------------------------------------------------
    // USE EDITED FORM VALUES WHEN PROVIDED
    // OTHERWISE USE DATABASE VALUES
    // --------------------------------------------------

    const finalName =
      name ||
      [
        application.first_name,
        application.middle_name,
        application.surname,
      ]
        .filter(Boolean)
        .join(" ") ||
      "________________";

    const finalAddress =
      address ||
      application.house_street ||
      "________________";

    const finalDob =
      dob ||
      application.date_of_birth ||
      "________________";

    const finalSex =
      sex ||
      application.sex ||
      "________________";

    const finalDateIssued =
      dateIssued ||
      new Date().toISOString().split("T")[0];

    const finalControlNo =
      controlNo ||
      "________________";

    // --------------------------------------------------
    // DOWNLOAD IMAGES DIRECTLY FROM PRIVATE STORAGE
    // --------------------------------------------------

    const [
      photoBuffer,
      signatureBuffer,
    ] = await Promise.all([
      getStorageFileBuffer(
        files?.latest_photo_url
      ),

      getStorageFileBuffer(
        files?.signature_url
      ),
    ]);

    // --------------------------------------------------
    // IMAGE PARAGRAPHS
    // --------------------------------------------------

    const photoChildren = [];

    if (photoBuffer) {
      photoChildren.push(
        new ImageRun({
          data: photoBuffer,

          transformation: {
            width: 100,
            height: 100,
          },

          type:
            getDocxImageType(
              files?.latest_photo_url
            ),
        })
      );
    } else {
      photoChildren.push(
        new TextRun({
          text: "No photo available",
          italics: true,
        })
      );
    }

    const signatureChildren = [];

    if (signatureBuffer) {
      signatureChildren.push(
        new ImageRun({
          data: signatureBuffer,

          transformation: {
            width: 120,
            height: 56,
          },

          type:
            getDocxImageType(
              files?.signature_url
            ),
        })
      );
    } else {
      signatureChildren.push(
        new TextRun({
          text: "No signature image",
          italics: true,
        })
      );
    }

    // --------------------------------------------------
    // FIELD HELPER
    // --------------------------------------------------

    const fieldRow = (
      label,
      value
    ) =>
      new TableRow({
        children: [
          new TableCell({
            width: {
              size: 1800,
              type: WidthType.DXA,
            },

            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: label,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),

          new TableCell({
            width: {
              size: 5000,
              type: WidthType.DXA,
            },

            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text:
                      String(value || "")
                  }),
                ],
              }),
            ],
          }),
        ],
      });

    // --------------------------------------------------
    // FIELD TABLE
    // --------------------------------------------------

    const fieldTable =
      new Table({
        width: {
          size: 6800,
          type: WidthType.DXA,
        },

        rows: [
          fieldRow(
            "NAME:",
            finalName
          ),

          fieldRow(
            "ADDRESS:",
            finalAddress
          ),

          fieldRow(
            "DATE OF BIRTH:",
            finalDob
          ),

          fieldRow(
            "SEX:",
            finalSex
          ),

          fieldRow(
            "DATE ISSUED:",
            finalDateIssued
          ),

          fieldRow(
            "CONTROL NO.:",
            finalControlNo
          ),
        ],
      });

    // --------------------------------------------------
    // SIGNATURE TABLE
    // --------------------------------------------------

    const signatureTable =
      new Table({
        width: {
          size: 2200,
          type: WidthType.DXA,
        },

        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top: {
                    style:
                      BorderStyle.SINGLE,
                    size: 6,
                    color: "222222",
                  },

                  bottom: {
                    style:
                      BorderStyle.SINGLE,
                    size: 6,
                    color: "222222",
                  },

                  left: {
                    style:
                      BorderStyle.SINGLE,
                    size: 6,
                    color: "222222",
                  },

                  right: {
                    style:
                      BorderStyle.SINGLE,
                    size: 6,
                    color: "222222",
                  },
                },

                children: [
                  new Paragraph({
                    alignment:
                      AlignmentType.CENTER,

                    children:
                      signatureChildren,
                  }),
                ],
              }),
            ],
          }),
        ],
      });

    // --------------------------------------------------
    // CREATE DOCX
    // --------------------------------------------------

    const doc =
      new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  right: 720,
                  bottom: 720,
                  left: 720,
                },
              },
            },

            children: [
              new Paragraph({
                alignment:
                  AlignmentType.CENTER,

                children: [
                  new TextRun({
                    text:
                      "REPUBLIC OF THE PHILIPPINES",
                    bold: true,
                    size: 22,
                  }),
                ],

                spacing: {
                  after: 40,
                },
              }),

              new Paragraph({
                alignment:
                  AlignmentType.CENTER,

                children: [
                  new TextRun({
                    text:
                      "OFFICE OF THE SENIOR CITIZEN AFFAIRS - OSCA",
                    bold: true,
                    size: 22,
                  }),
                ],

                spacing: {
                  after: 40,
                },
              }),

              new Paragraph({
                alignment:
                  AlignmentType.CENTER,

                children: [
                  new TextRun({
                    text:
                      "MUNICIPALITY OF BAUAN",
                    bold: true,
                    size: 22,
                  }),
                ],

                spacing: {
                  after: 240,
                },
              }),

              new Paragraph({
                alignment:
                  AlignmentType.CENTER,

                children:
                  photoChildren,

                spacing: {
                  after: 240,
                },
              }),

              fieldTable,

              new Paragraph({
                children: [
                  new TextRun({
                    text: "",
                  }),
                ],

                spacing: {
                  after: 400,
                },
              }),

              new Paragraph({
                alignment:
                  AlignmentType.RIGHT,

                children: [
                  new TextRun({
                    text:
                      "Signature",
                    size: 18,
                  }),
                ],

                spacing: {
                  after: 40,
                },
              }),

              new Paragraph({
                alignment:
                  AlignmentType.RIGHT,

                children: [
                  signatureTable,
                ],
              }),
            ],
          },
        ],
      });

    // --------------------------------------------------
    // GENERATE BUFFER
    // --------------------------------------------------

    const buffer =
      await Packer.toBuffer(doc);

    const safeId =
      String(applicationId)
        .replace(
          /[^a-zA-Z0-9-_]/g,
          "_"
        );

    const filename =
      `Digital_Issuance_${safeId}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    res.setHeader(
      "Content-Length",
      buffer.length
    );

    return res.end(buffer);

  } catch (error) {
    console.error(
      "Error generating issuance DOCX:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to generate issuance Word document.",
      error:
        error.message,
    });
  }
};

const getApplications = async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. GET APPLICATIONS
    // --------------------------------------------------
    const { data: applications, error: applicationsError } =
      await supabase
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

    // --------------------------------------------------
    // 2. GET APPLICATION IDS
    // --------------------------------------------------
    const applicationIds = applications.map(
      (application) => application.application_id
    );

    // --------------------------------------------------
    // 3. GET APPLICATION FILE RECORDS
    // --------------------------------------------------
    const { data: files, error: filesError } = await supabase
      .from("application_files")
      .select(`
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
      `)
      .in("application_id", applicationIds);

    if (filesError) {
      throw filesError;
    }

    // --------------------------------------------------
    // 4. GET STATUS HISTORY
    // --------------------------------------------------
    const { data: statusHistory, error: statusHistoryError } =
      await supabase
        .from("application_status_history")
        .select("*")
        .in("application_id", applicationIds)
        .order("updated_at", { ascending: false });

    if (statusHistoryError) {
      throw statusHistoryError;
    }

    // --------------------------------------------------
    // 5. COMBINE APPLICATION + FILE + STATUS DATA
    //
    // IMPORTANT:
    // Do NOT create signed Storage URLs here.
    //
    // This endpoint is used by the dashboard/list.
    // Signed URLs are generated only when opening
    // one application's detail page.
    // --------------------------------------------------
    const applicationsWithFiles = applications.map((application) => {
      const latestStatus = statusHistory?.find(
        (history) =>
          history.application_id === application.application_id
      );

      const currentStatus =
        latestStatus?.status ||
        application.status ||
        "Pending";

      const statusUpdatedAt =
        latestStatus?.updated_at ||
        application.updated_at ||
        application.created_at ||
        null;

      const fileRecord = files?.find(
        (file) =>
          file.application_id === application.application_id
      );

      // ----------------------------------------------
      // NO FILE RECORD
      // ----------------------------------------------
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

      // ----------------------------------------------
      // FILE RECORD EXISTS
      //
      // Return STORAGE PATHS only.
      // The detail endpoint will generate signed URLs.
      // ----------------------------------------------
      return {
        ...application,

        status: currentStatus,

        status_updated_at: statusUpdatedAt,

        documents: {
          idFront: fileRecord.valid_id_url || null,
          idBack: fileRecord.valid_id_back_url || null,
          photo: fileRecord.latest_photo_url || null,
          bc: fileRecord.birth_certificate_url || null,
          cedula:
            fileRecord.community_tax_certificate_url || null,
          signature: fileRecord.signature_url || null,
        },

        document_files: {
          ...fileRecord,
        },
      };
    });

    // --------------------------------------------------
    // 6. RETURN RESPONSE
    // --------------------------------------------------
    return res.status(200).json({
      success: true,
      applications: applicationsWithFiles,
    });

  } catch (error) {
    console.error(
      "Error fetching applications:",
      error
    );

    return res.status(500).json({
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

// UPDATE DOCUMENT AUTHENTICATION
const updateDocumentAuthentication = async (req, res) => {
  try {
    const applicationId = req.params.applicationId;
    const documentType = req.params.documentType;

    const {
      status,
      method,
      authenticated_by,
      remarks,
    } = req.body;

    const allowedDocumentTypes = [
      "valid_id",
      "valid_id_back",
      "latest_photo",
      "birth_certificate",
      "community_tax_certificate",
      "signature",
    ];

    const allowedStatuses = [
      "pending",
      "approved",
      "reupload",
    ];

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    if (!allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Document authentication status is required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document authentication status.",
      });
    }

    // Make sure the application exists
    const { data: application, error: applicationError } =
      await supabase
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

    const now = new Date().toISOString();

    // Check whether an authentication record already exists
    const { data: existingRecord, error: existingError } =
      await supabase
        .from("document_authentications")
        .select("*")
        .eq("application_id", applicationId)
        .eq("document_type", documentType)
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let savedRecord;

    if (existingRecord) {
      // Update existing authentication record
      const { data, error } = await supabase
        .from("document_authentications")
        .update({
          authentication_status: status,
          authentication_method:
            method || "staff_review",
          authenticated_by:
            authenticated_by || null,
          authenticated_at: status === "approved" ? now : null,
          authentication_remarks:
            remarks || null,
          updated_at: now,
        })
        .eq("id", existingRecord.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      savedRecord = data;
    } else {
      // Create authentication record if this
      // document has never been reviewed before
      const { data, error } = await supabase
        .from("document_authentications")
        .insert({
          application_id: applicationId,
          document_type: documentType,
          authentication_status: status,
          authentication_method:
            method || "staff_review",
          authenticated_by:
            authenticated_by || null,
          authenticated_at: status === "approved" ? now : null,
          authentication_remarks:
            remarks || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      savedRecord = data;
    }

    return res.status(200).json({
      success: true,
      message: "Document authentication saved successfully.",
      documentAuthentication: savedRecord,
    });
  } catch (error) {
    console.error(
      "Error updating document authentication:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to save document authentication.",
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

    // Check that the application exists
    const {
      data: application,
      error: applicationError,
    } = await supabase
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

    const now = new Date().toISOString();

    // Find existing status history records
    const {
      data: existingRecords,
      error: findStatusError,
    } = await supabase
      .from("application_status_history")
      .select("*")
      .eq("application_id", applicationId);

    if (findStatusError) {
      throw findStatusError;
    }

    let statusRecord;

    // --------------------------------------------
    // UPDATE EXISTING STATUS RECORD
    // --------------------------------------------
    if (existingRecords && existingRecords.length > 0) {

      const {
        data: updatedRecords,
        error: updateStatusError,
      } = await supabase
        .from("application_status_history")
        .update({
          status: status,
          updated_at: now,
        })
        .eq("application_id", applicationId)
        .select();

      if (updateStatusError) {
        throw updateStatusError;
      }

      statusRecord = updatedRecords?.[0] || null;

    }

    // --------------------------------------------
    // CREATE STATUS RECORD IF NONE EXISTS
    // --------------------------------------------
    else {

      const {
        data: newStatusRecord,
        error: insertStatusError,
      } = await supabase
        .from("application_status_history")
        .insert({
          application_id: applicationId,
          status: status,
          updated_at: now,
        })
        .select()
        .single();

      if (insertStatusError) {
        throw insertStatusError;
      }

      statusRecord = newStatusRecord;
    }

    return res.status(200).json({
      success: true,
      message: "Application status updated successfully.",
      status: status,
      statusHistory: statusRecord,
    });

  } catch (error) {

    console.error(
      "Error updating application status:",
      error
    );

    return res.status(500).json({
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
  updateDocumentAuthentication,
  downloadIssuanceDocument,
};