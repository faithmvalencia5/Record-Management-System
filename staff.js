// Staff dashboard

// Staff KPI configuration

const STAFF_KPIS = [
  {
    label: 'Total applications',
    value: '0',
    sub: 'System Volume',
    icon: 'fi fi-rr-apps',
    trend: 'Live',
    trendClass: 'trend-up',
    iconWrap: 'blue'
  },
  {
    label: 'Pending Review',
    value: '0',
    sub: 'Awaiting action',
    icon: 'fi fi-rr-clock',
    trend: 'Live',
    trendClass: 'trend-up',
    iconWrap: 'warn'
  },
  {
    label: 'Approved Today',
    value: '0',
    sub: 'Approved today',
    icon: 'fi fi-rr-check-double',
    trend: 'Live',
    trendClass: 'trend-good',
    iconWrap: 'green'
  },
  {
    label: 'Applications processed',
    value: '0',
    sub: 'This month',
    icon: 'fi fi-rr-chart-line-up',
    trend: 'Live',
    trendClass: 'trend-good',
    iconWrap: 'teal'
  },
  {
    label: 'Rejected Applications',
    value: '0',
    sub: 'This month',
    icon: 'fi fi-rr-x',
    trend: 'Live',
    trendClass: 'trend-down',
    iconWrap: 'red'
  }
];


// Status helpers

function normalizeApplicationStatus(status) {

  const value =
    String(status || 'Pending')
      .trim()
      .toLowerCase();

  if (
    value === 'pending' ||
    value === 'unverified'
  ) {
    return 'pending';
  }

  if (
    value === 'under review' ||
    value === 'in review'
  ) {
    return 'review';
  }

  if (
    value === 'verified'
  ) {
    return 'approved';
  }

  if (
    value === 'ready for release'
  ) {
    return 'ready';
  }

  if (
    value === 'id issued'
  ) {
    return 'issued';
  }

  if (
    value === 'completed'
  ) {
    return 'completed';
  }

  if (
    value === 'rejected'
  ) {
    return 'rejected';
  }

  if (
    value === 'in process'
  ) {
    return 'process';
  }

  return 'pending';
}


// DATE HELPERS

function isSameDay(dateValue, referenceDate = new Date()) {

  if (!dateValue) {
    return false;
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() ===
      referenceDate.getFullYear() &&

    date.getMonth() ===
      referenceDate.getMonth() &&

    date.getDate() ===
      referenceDate.getDate()
  );
}


function isSameMonth(dateValue, referenceDate = new Date()) {

  if (!dateValue) {
    return false;
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() ===
      referenceDate.getFullYear() &&

    date.getMonth() ===
      referenceDate.getMonth()
  );
}


// UPDATE ANALYTICS DATA

function updateLiveAnalyticsData(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  const now = new Date();

  let pending = 0;
  let inReview = 0;
  let approved = 0;
  let rejected = 0;
  let idsIssued = 0;

  let approvedToday = 0;
  let processedThisMonth = 0;
  let rejectedThisMonth = 0;

  applications.forEach(application => {

    const status =
      normalizeApplicationStatus(
        application.status
      );

    const statusDate =
      application.status_updated_at ||
      application.created_at ||
      null;


    // Current status counts

    if (status === 'pending') {
      pending++;
    }

    if (status === 'review') {
      inReview++;
    }

    if (
      status === 'approved' ||
      status === 'ready' ||
      status === 'issued' ||
      status === 'completed'
    ) {
      approved++;
    }

    if (status === 'rejected') {
      rejected++;
    }

    if (
      status === 'issued' ||
      status === 'completed'
    ) {
      idsIssued++;
    }


    // Approved today

    if (
      (
        status === 'approved' ||
        status === 'ready' ||
        status === 'issued' ||
        status === 'completed'
      ) &&
      isSameDay(statusDate, now)
    ) {
      approvedToday++;
    }


    // Processed this month

    if (
      (
        status === 'process' ||
        status === 'approved' ||
        status === 'ready' ||
        status === 'issued' ||
        status === 'completed' ||
        status === 'rejected'
      ) &&
      isSameMonth(statusDate, now)
    ) {
      processedThisMonth++;
    }


    // Rejected this month

    if (
      status === 'rejected' &&
      isSameMonth(statusDate, now)
    ) {
      rejectedThisMonth++;
    }

  });


  const pendingReview =
    pending + inReview;


  // UPDATE ANALYTICS_DATA

  if (
    typeof ANALYTICS_DATA !== 'undefined'
  ) {

    const roles = [
      'Admin',
      'Staff',
      'ID Maker'
    ];

    roles.forEach(role => {

      if (!ANALYTICS_DATA[role]) {
        return;
      }

      ANALYTICS_DATA[role].totalApplications =
        applications.length;

      ANALYTICS_DATA[role].pending =
        pending;

      ANALYTICS_DATA[role].inReview =
        inReview;

      ANALYTICS_DATA[role].pendingReview =
        pendingReview;

      ANALYTICS_DATA[role].approved =
        approved;

      ANALYTICS_DATA[role].rejected =
        rejected;

      ANALYTICS_DATA[role].idsIssued =
        idsIssued;

      ANALYTICS_DATA[role].statusDenominator =
        applications.length;
    });
  }


  // UPDATE MAIN DASHBOARD

  if (
    typeof applyDashboardMetrics === 'function'
  ) {
    applyDashboardMetrics();
  }


  if (
    typeof applyAnalyticsRoleView === 'function'
  ) {
    try {
      applyAnalyticsRoleView();
    } catch (error) {
      console.warn(
        'Unable to refresh analytics view:',
        error
      );
    }
  }

  // UPDATE APPLICATION SUMMARY CARDS

  updateApplicationSummaryCards(applications);


  // UPDATE STAFF KPI STRIP

  updateStaffKPICards({
    total: applications.length,
    pendingReview,
    approvedToday,
    processedThisMonth,
    rejectedThisMonth
  });
}

// UPDATE APPLICATION SUMMARY CARDS

function updateApplicationSummaryCards(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  let pending = 0;
  let underReview = 0;
  let flaggedDuplicates = 0;
  let incompleteDocs = 0;
  let readyForIdMaker = 0;


  applications.forEach(application => {

    // CURRENT STATUS

    const status = normalizeApplicationStatus(
      application.status
    );


    // 1. PENDING

    if (status === 'pending') {
      pending++;
    }


    // 2. UNDER REVIEW

    if (status === 'review') {
      underReview++;
    }


    // 3. FLAGGED DUPLICATES

    const duplicate =
      application.duplicate;

    const duplicateRisk =
      application.duplicate_risk;

    if (
      duplicate === true ||
      (
        duplicate &&
        typeof duplicate === 'object'
      ) ||
      (
        duplicateRisk &&
        Number(duplicateRisk.score || 0) >= 0.80
      )
    ) {
      flaggedDuplicates++;
    }


    // 4. INCOMPLETE DOCUMENTS

    const documents =
      application.documents || {};

    const hasPhoto =
      Boolean(
        documents.photo ||
        documents.latest_photo_signed_url
      );

    const hasBirthCertificate =
      Boolean(
        documents.bc ||
        documents.birth_certificate_signed_url
      );

    const hasCedula =
      Boolean(
        documents.cedula ||
        documents.community_tax_certificate_signed_url
      );


    if (
      !hasPhoto ||
      !hasBirthCertificate ||
      !hasCedula
    ) {
      incompleteDocs++;
    }


    // 5. READY FOR ID MAKER

    if (status === 'ready') {
      readyForIdMaker++;
    }

  });


  // UPDATE THE FIVE APPLICATION SUMMARY CARDS

  const values = {
    'summary-pending': pending,
    'summary-review': underReview,
    'summary-duplicates': flaggedDuplicates,
    'summary-incomplete': incompleteDocs,
    'summary-ready': readyForIdMaker
  };


  Object.entries(values).forEach(
    ([id, value]) => {

      const element =
        document.getElementById(id);

      if (element) {
        element.textContent =
          Number(value).toLocaleString();
      }

    }
  );

}

// UPDATE STAFF KPI CARDS

function updateStaffKPICards(metrics) {

  const strip =
    document.getElementById(
      'staff-kpi-strip'
    );

  if (!strip) {
    return;
  }

  const cards =
    strip.querySelectorAll(
      '.stat-card'
    );

  if (!cards.length) {
    return;
  }


  const values = [
    metrics.total,
    metrics.pendingReview,
    metrics.approvedToday,
    metrics.processedThisMonth,
    metrics.rejectedThisMonth
  ];


  const subtitles = [
    'System Volume',
    'Awaiting action',
    'Approved today',
    'This month',
    'This month'
  ];


  cards.forEach((card, index) => {

    const value =
      card.querySelector(
        '.stat-card__value'
      );

    const sub =
      card.querySelector(
        '.stat-card__sub'
      );

    const trend =
      card.querySelector(
        '.stat-card__trend'
      );


    if (value) {
      value.textContent =
        Number(values[index] || 0)
          .toLocaleString();
    }

    if (sub) {
      sub.textContent =
        subtitles[index] || '';
    }

    if (trend) {
      trend.textContent = 'Live';
    }

  });
}


// ROLE-BASED KPI SWITCHER

function switchKPIs(role) {

  const adminStrip =
    document.querySelector(
      '.admin-kpi-strip'
    );

  const staffStrip =
    document.getElementById(
      'staff-kpi-strip'
    );


  if (role === 'Staff') {

    if (adminStrip) {
      adminStrip.style.display =
        'none';
    }


    if (!staffStrip) {

      const staffContainer =
        document.createElement(
          'div'
        );

      staffContainer.id =
        'staff-kpi-strip';

      staffContainer.className =
        'admin-kpi-strip';


      STAFF_KPIS.forEach(
        (kpi, index) => {

          const card =
            document.createElement(
              'div'
            );

          card.className =
            `stat-card${
              index === 1
                ? ' stat-card--warn'
                : ''
            }`;


          card.innerHTML = `
            <div class="stat-card__top">

              <div class="stat-card__icon-wrap iwrap-${kpi.iconWrap}">
                <i class="${kpi.icon}"></i>
              </div>

              <div class="stat-card__meta">
                <div class="stat-card__trend ${kpi.trendClass}">
                  ${kpi.trend}
                </div>
              </div>

            </div>

            <div class="stat-card__body">

              <div class="stat-card__label">
                ${kpi.label}
              </div>

              <div class="stat-card__value">
                ${kpi.value}
              </div>

              <div class="stat-card__sub">
                ${kpi.sub}
              </div>

            </div>
          `;

          staffContainer.appendChild(
            card
          );
        }
      );


      if (adminStrip) {

        adminStrip.parentNode.insertBefore(
          staffContainer,
          adminStrip.nextSibling
        );

      }

    } else {

      staffStrip.style.display =
        'grid';
    }


    document
      .querySelectorAll(
        '.admin-only-panel, .ai-panel'
      )
      .forEach(
        element => {
          element.style.display =
            'none';
        }
      );


    const roleBadge =
      document.getElementById(
        'dashboard-role-badge'
      );

    const dashboardTitle =
      document.getElementById(
        'dashboard-title'
      );


    if (roleBadge) {
      roleBadge.textContent =
        'Staff View';
    }

    if (dashboardTitle) {
      dashboardTitle.textContent =
        'Staff Dashboard';
    }


  } else if (
    role === 'ID Maker'
  ) {

    if (adminStrip) {
      adminStrip.style.display =
        'none';
    }


    const idMakerStaffStrip =
      document.getElementById(
        'staff-kpi-strip'
      );

    if (idMakerStaffStrip) {
      idMakerStaffStrip.style.display =
        'none';
    }


    document
      .querySelectorAll(
        '.admin-only-panel, .ai-panel'
      )
      .forEach(
        element => {
          element.style.display =
            'none';
        }
      );


    const idBadge =
      document.getElementById(
        'dashboard-role-badge'
      );

    const idTitle =
      document.getElementById(
        'dashboard-title'
      );


    if (idBadge) {
      idBadge.textContent =
        'ID Maker View';
    }

    if (idTitle) {
      idTitle.textContent =
        'ID Maker Dashboard';
    }


  } else {

    if (adminStrip) {
      adminStrip.style.display =
        'grid';
    }


    const staffStrip =
      document.getElementById(
        'staff-kpi-strip'
      );

    if (staffStrip) {
      staffStrip.remove();
    }


    document
      .querySelectorAll(
        '.admin-only-panel, .ai-panel'
      )
      .forEach(
        element => {
          element.style.display =
            '';
        }
      );


    const roleBadge =
      document.getElementById(
        'dashboard-role-badge'
      );

    const dashboardTitle =
      document.getElementById(
        'dashboard-title'
      );


    if (roleBadge) {
      roleBadge.textContent =
        'Admin View';
    }

    if (dashboardTitle) {
      dashboardTitle.textContent =
        'Dashboard';
    }
  }
}


// SET ROLE OVERRIDE

const originalSetRole =
  window.setRole || (() => {});


window.setRole =
  function (
    role,
    silent = false
  ) {

    originalSetRole(
      role,
      silent
    );


    if (
      typeof CURRENT_ROLE !==
      'undefined'
    ) {

      switchKPIs(
        CURRENT_ROLE
      );

    }
  };


// RENDER LIVE APPLICANTS

function renderLiveApplicants(
  applications
) {

  const tbody =
    document.getElementById(
      'applicants-tbody'
    );

  if (!tbody) {
    return;
  }


  if (
    !Array.isArray(applications) ||
    applications.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="9"
          style="
            text-align:center;
            padding:32px;
            color:var(--text-muted);
          "
        >
          No applicants found.
        </td>
      </tr>
    `;

    return;
  }


  tbody.innerHTML =
    applications.map(
      application => {

        const appId =
          application.application_id ||
          application.id ||
          '';


        const fullName = [
          application.first_name,
          application.middle_name,
          application.surname
        ]
          .filter(Boolean)
          .join(' ')
          .trim() ||
          'Unnamed Applicant';


        const initials =
          fullName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(
              part =>
                part
                  .charAt(0)
                  .toUpperCase()
            )
            .join('');


        const barangay =
          application.barangay_district ||
          '—';


        const age =
          application.age ??
          '—';


        const occupation =
          application.occupation ||
          '—';


        const status =
          application.status ||
          'Pending';


        let docsHtml =
          '<span class="docs-pill">—</span>';


        if (
          typeof buildDocsStatusPill ===
          'function'
        ) {

          try {

            docsHtml =
              buildDocsStatusPill(
                application
              );

          } catch (error) {

            console.warn(
              'Unable to build document status:',
              error
            );

          }
        }


        let statusHtml =
          `<span class="status-select__label">
            ${escapeApplicationHtml(status)}
          </span>`;


        if (
          typeof buildStatusSelect ===
          'function'
        ) {

          try {

            statusHtml =
              buildStatusSelect(
                appId,
                status
              );

          } catch (error) {

            console.warn(
              'Unable to build applicant status:',
              error
            );

          }
        }


        return `
          <tr
            data-app-id="${escapeApplicationHtml(appId)}"
          >

            <!-- NAME -->
            <td>

              <div class="applicant-cell">

                <div class="applicant-avatar">
                  ${escapeApplicationHtml(initials)}
                </div>

                <div class="applicant-info">

                  <span class="applicant-name">
                    ${escapeApplicationHtml(fullName)}
                  </span>

                  <span class="applicant-id">
                    ${escapeApplicationHtml(
                      application.sex || 'Applicant'
                    )}
                    ·
                    ${escapeApplicationHtml(
                      String(age)
                    )}
                    yrs
                  </span>

                </div>

              </div>

            </td>


            <!-- ID NUMBER -->
            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(appId)}
              </span>
            </td>


            <!-- BARANGAY -->
            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(barangay)}
              </span>
            </td>


            <!-- AGE -->
            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(
                  String(age)
                )}
              </span>
            </td>


            <!-- OCCUPATION -->
            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(
                  occupation
                )}
              </span>
            </td>


            <!-- APPLICATION TYPE -->
            <td>

              ${
                typeof buildApplicationTypePill ===
                'function'
                  ? (() => {
                      try {
                        return buildApplicationTypePill(
                          application
                        );
                      } catch (error) {
                        return `
                          <span class="badge badge-pending">
                            Application
                          </span>
                        `;
                      }
                    })()
                  : `
                    <span class="badge badge-pending">
                      Application
                    </span>
                  `
              }

            </td>


            <!-- DOCUMENT STATUS -->
            <td>
              ${docsHtml}
            </td>


            <!-- STATUS -->
            <td>
              ${statusHtml}
            </td>


            <!-- ACTION -->
            <td
              style="text-align:right"
            >

              <button
                class="row-action always-visible"
                onclick="
                  openApplicationDetail(
                    '${escapeApplicationHtml(appId)}'
                  )
                "
              >
                View
              </button>

            </td>

          </tr>
        `;
      }
    )
    .join('');


  // UPDATE APPLICANTS COUNTERS

  const applicantsBadge =
    document.querySelector(
      '[data-module="applicants"] .nav-link__badge'
    );

  if (applicantsBadge) {

    applicantsBadge.textContent =
      applications.length.toLocaleString();

  }


  const totalBadge =
    document.getElementById(
      'applicants-total-badge'
    );

  if (totalBadge) {
    totalBadge.textContent =
      `${applications.length.toLocaleString()} Total`;
  }

  const applicantCards =
    document.querySelectorAll(
      '.data-table-card'
    );


  applicantCards.forEach(card => {

    const title =
      card
        .querySelector(
          '.table-header__title'
        )
        ?.textContent
        ?.trim();


    if (
      title !== 'Applicants'
    ) {
      return;
    }


    const footer =
      card.querySelector(
        '.table-footer__info'
      );


    if (footer) {

      footer.textContent =
        `Showing ${applications.length.toLocaleString()} of ${applications.length.toLocaleString()} applicants`;

    }

  });


  // UPDATE FILTER COUNTS

  if (
    typeof updateStatusTabCounts ===
    'function'
  ) {

    try {
      updateStatusTabCounts();
    } catch (error) {
      console.warn(
        'Unable to update applicant status counts:',
        error
      );
    }

  }

}

function updateApplicantSummaryCards(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  const total = applications.length;

  let verified = 0;
  let unverified = 0;
  let idsIssued = 0;

  applications.forEach(application => {

    const status = String(
      application.status || ''
    ).trim().toLowerCase();

    if (status === 'verified') {
      verified++;
    }

    if (
      status === 'unverified' ||
      status === 'pending'
    ) {
      unverified++;
    }

    if (
      status === 'id issued' ||
      status === 'issued' ||
      status === 'completed'
    ) {
      idsIssued++;
    }

  });

  const totalEl =
    document.getElementById(
      'applicants-total-count'
    );

  const verifiedEl =
    document.getElementById(
      'applicants-verified-count'
    );

  const unverifiedEl =
    document.getElementById(
      'applicants-unverified-count'
    );

  const issuedEl =
    document.getElementById(
      'applicants-issued-count'
    );


  if (totalEl) {
    totalEl.textContent =
      total.toLocaleString();
  }

  if (verifiedEl) {
    verifiedEl.textContent =
      verified.toLocaleString();
  }

  if (unverifiedEl) {
    unverifiedEl.textContent =
      unverified.toLocaleString();
  }

  if (issuedEl) {
    issuedEl.textContent =
      idsIssued.toLocaleString();
  }
}


// ESCAPE HTML

function escapeApplicationHtml(
  value
) {

  return String(
    value ?? ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}


// LOAD APPLICATIONS

async function loadApplicationsFromDatabase() {
  try {
    console.log("Loading applications from backend...");

    const response = await fetch(
      "https://management-backend-3cij.onrender.com/api/applications",
      {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    console.log("API response status:", response.status);

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}`
      );
    }

    const result = await response.json();

    console.log("API result:", result);

    if (!result.success) {
      throw new Error(
        result.message || "Backend returned success:false"
      );
    }

    const applications = Array.isArray(result.applications)
      ? result.applications
      : [];

    console.log(
      "Applications loaded successfully:",
      applications.length
    );

    // UPDATE LIVE ANALYTICS

    if (typeof updateLiveAnalyticsData === "function") {
      updateLiveAnalyticsData(applications);
    }

    // UPDATE APPLICANTS TABLE

    if (typeof renderLiveApplicants === "function") {
      renderLiveApplicants(applications);
    }

    // UPDATE APPLICANT SUMMARY CARDS

    if (typeof updateApplicantSummaryCards === "function") {
      updateApplicantSummaryCards(applications);
    }

    // UPDATE APPLICATIONS TABLE

    if (typeof displayApplications === "function") {
      displayApplications(applications);
    }

    return applications;

  } catch (error) {

    console.error(
      "ERROR LOADING APPLICATIONS:",
      error
    );

    // Show the actual error in the browser console
    console.error(
      "Make sure the backend is running at:",
      "http://localhost:5000"
    );

    if (typeof showToast === "function") {
      showToast(
        "Failed to load applications. Check the browser console.",
        "error"
      );
    }

    return [];
  }
}


// APPLICATION DETAILS

async function loadApplicationDetails(
  applicationId
) {

  try {

    const response =
      await fetch(
        `https://management-backend-3cij.onrender.com/api/applications/${encodeURIComponent(
          applicationId
        )}`
      );


    if (!response.ok) {

      throw new Error(
        "Failed to fetch application details"
      );

    }


    const result =
      await response.json();


    if (!result.success) {

      throw new Error(
        result.message ||
        "Failed to load application details"
      );

    }


    console.log(
      "Complete application details:",
      result
    );


    return result;

  } catch (error) {

    console.error(
      "Error loading application details:",
      error
    );


    if (
      typeof showToast ===
      "function"
    ) {

      showToast(
        "Failed to load application details.",
        "error"
      );

    }


    return null;
  }
}


// AUTO INITIALIZATION

document.addEventListener(
  "DOMContentLoaded",
  () => {

    if (
      typeof CURRENT_ROLE !==
        'undefined' &&
      CURRENT_ROLE
    ) {

      switchKPIs(
        CURRENT_ROLE
      );

    }


    loadApplicationsFromDatabase();

  }
);
