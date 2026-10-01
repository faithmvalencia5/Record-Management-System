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

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  return (
    date.getFullYear() ===
      referenceDate.getFullYear() &&
    date.getMonth() ===
      referenceDate.getMonth()
  );
}


// LIVE APPLICATION STORAGE

let LIVE_APPLICATIONS = [];


// UPDATE LIVE ANALYTICS DATA

function updateLiveAnalyticsData(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  LIVE_APPLICATIONS =
    applications;

  const now =
    new Date();

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


    // CURRENT STATUS COUNTS

    if (
      status === 'pending'
    ) {
      pending++;
    }

    if (
      status === 'review'
    ) {
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

    if (
      status === 'rejected'
    ) {
      rejected++;
    }

    if (
      status === 'issued' ||
      status === 'completed'
    ) {
      idsIssued++;
    }


    // APPROVED TODAY

    if (
      (
        status === 'approved' ||
        status === 'ready' ||
        status === 'issued' ||
        status === 'completed'
      ) &&
      isSameDay(
        statusDate,
        now
      )
    ) {
      approvedToday++;
    }


    // PROCESSED THIS MONTH

    if (
      (
        status === 'process' ||
        status === 'approved' ||
        status === 'ready' ||
        status === 'issued' ||
        status === 'completed' ||
        status === 'rejected'
      ) &&
      isSameMonth(
        statusDate,
        now
      )
    ) {
      processedThisMonth++;
    }


    // REJECTED THIS MONTH

    if (
      status === 'rejected' &&
      isSameMonth(
        statusDate,
        now
      )
    ) {
      rejectedThisMonth++;
    }

  });


  const pendingReview =
    pending + inReview;


  // UPDATE ANALYTICS DATA

  if (
    typeof ANALYTICS_DATA !==
    'undefined'
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

      ANALYTICS_DATA[role]
        .totalApplications =
        applications.length;

      ANALYTICS_DATA[role]
        .pending =
        pending;

      ANALYTICS_DATA[role]
        .inReview =
        inReview;

      ANALYTICS_DATA[role]
        .pendingReview =
        pendingReview;

      ANALYTICS_DATA[role]
        .approved =
        approved;

      ANALYTICS_DATA[role]
        .rejected =
        rejected;

      ANALYTICS_DATA[role]
        .idsIssued =
        idsIssued;

      ANALYTICS_DATA[role]
        .statusDenominator =
        applications.length;
    });
  }


  // UPDATE MAIN DASHBOARD

  if (
    typeof applyDashboardMetrics ===
    'function'
  ) {
    applyDashboardMetrics();
  }


  if (
    typeof applyAnalyticsRoleView ===
    'function'
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

  updateApplicationSummaryCards(
    applications
  );


  // UPDATE STAFF KPI STRIP

  updateStaffKPICards({
    total:
      applications.length,
    pendingReview,
    approvedToday,
    processedThisMonth,
    rejectedThisMonth
  });

}


// UPDATE LIVE DASHBOARD VISUALS

function updateLiveDashboardVisuals(
  applications
) {

  if (!Array.isArray(applications)) {
    return;
  }


  /*
   * 1. BARANGAY REGISTRATIONS
   */

  const yearFilter =
    document.getElementById(
      'barangay-year-filter'
    );

  const selectedYear =
    yearFilter
      ? String(
          yearFilter.value
        )
      : String(
          new Date()
            .getFullYear()
        );

  const barangayCounts = {};


  applications.forEach(
    application => {

      const dateValue =
        application.created_at ||
        application.submitted_at ||
        null;

      if (!dateValue) {
        return;
      }

      const date =
        new Date(dateValue);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return;
      }

      if (
        String(
          date.getFullYear()
        ) !== selectedYear
      ) {
        return;
      }

      const barangay =
        application.barangay_district ||
        'Unknown';

      barangayCounts[barangay] =
        (
          barangayCounts[barangay] ||
          0
        ) + 1;

    }
  );


  const barangayRows =
    Object.entries(
      barangayCounts
    )
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 6);


  const barColumns =
    document.querySelectorAll(
      '.barangay-empty-card .bar-col'
    );

  const emptyNote =
    document.getElementById(
      'barangay-empty-note'
    );


  if (
    !barangayRows.length
  ) {

    if (emptyNote) {

      emptyNote.style.display =
        'flex';

      emptyNote.textContent =
        `No registration data available for ${selectedYear} yet.`;

    }

    barColumns.forEach(
      column => {

        const bar =
          column.querySelector(
            '.bar-col__bar'
          );

        if (bar) {
          bar.style.height =
            '0';
        }

      }
    );

  } else {

    if (emptyNote) {
      emptyNote.style.display =
        'none';
    }

    const maxValue =
      barangayRows[0][1] ||
      1;

    barColumns.forEach(
      (column, index) => {

        const bar =
          column.querySelector(
            '.bar-col__bar'
          );

        if (!bar) {
          return;
        }

        const row =
          barangayRows[index];

        if (!row) {

          bar.style.height =
            '0';

          return;
        }

        const barangay =
          row[0];

        const count =
          row[1];

        const height =
          Math.max(
            12,
            Math.round(
              (
                count /
                maxValue
              ) * 100
            )
          );

        bar.style.height =
          `${height}%`;

        bar.title =
          `${barangay}: ${count}`;

        const label =
          column.querySelector(
            '.bar-col__label'
          );

        if (label) {
          label.textContent =
            barangay;
        }

        const value =
          column.querySelector(
            '.bar-col__value'
          );

        if (value) {
          value.textContent =
            count;
        }

      }
    );

  }


  /*
   * 2. DEMOGRAPHICS
   */

  const donutSvg =
    document.querySelector(
      '.demographics-donut svg'
    );

  const donutPercent =
    document.querySelector(
      '.demographics-donut__percent'
    );

  const donutTag =
    document.querySelector(
      '.demographics-donut__tag'
    );

  const legendValues =
    document.querySelectorAll(
      '.demographics-legend__value'
    );


  let female = 0;
  let male = 0;


  applications.forEach(
    application => {

      const sex =
        String(
          application.sex ||
          application.gender ||
          ''
        )
          .trim()
          .toLowerCase();

      if (
        sex === 'female' ||
        sex === 'f'
      ) {
        female++;
      }

      if (
        sex === 'male' ||
        sex === 'm'
      ) {
        male++;
      }

    }
  );


  const demographicTotal =
    female + male;


  if (
    demographicTotal > 0
  ) {

    const femalePercent =
      Math.round(
        (
          female /
          demographicTotal
        ) * 100
      );

    const malePercent =
      100 - femalePercent;


    if (donutSvg) {

      donutSvg.innerHTML = `
        <circle
          cx="67"
          cy="67"
          r="54"
          fill="none"
          stroke="#93C5FD"
          stroke-width="14"
          stroke-dasharray="${femalePercent * 3.393} 339.3"
          stroke-linecap="butt"
          transform="rotate(-90 67 67)"
        />

        <circle
          cx="67"
          cy="67"
          r="54"
          fill="none"
          stroke="#3D6FE8"
          stroke-width="14"
          stroke-dasharray="${malePercent * 3.393} 339.3"
          stroke-dashoffset="${-(femalePercent * 3.393)}"
          stroke-linecap="butt"
          transform="rotate(-90 67 67)"
        />
      `;

    }


    if (donutPercent) {
      donutPercent.textContent =
        '100%';
    }

    if (donutTag) {
      donutTag.textContent =
        'Total';
    }

    if (legendValues[0]) {
      legendValues[0].textContent =
        `${femalePercent}%`;
    }

    if (legendValues[1]) {
      legendValues[1].textContent =
        `${malePercent}%`;
    }

  } else {

    if (donutPercent) {
      donutPercent.textContent =
        '0%';
    }

    if (donutTag) {
      donutTag.textContent =
        'No data';
    }

    if (legendValues[0]) {
      legendValues[0].textContent =
        '0%';
    }

    if (legendValues[1]) {
      legendValues[1].textContent =
        '0%';
    }

  }

}


// BARANGAY YEAR FILTER

function filterBarangayYear(year) {

  if (
    typeof LIVE_APPLICATIONS ===
    'undefined'
  ) {
    return;
  }

  updateLiveDashboardVisuals(
    LIVE_APPLICATIONS
  );

}


// UPDATE APPLICATION SUMMARY CARDS

function updateApplicationSummaryCards(
  applications
) {

  if (
    !Array.isArray(
      applications
    )
  ) {
    return;
  }

  let pending = 0;
  let underReview = 0;
  let flaggedDuplicates = 0;
  let incompleteDocs = 0;
  let readyForIdMaker = 0;


  applications.forEach(
    application => {

      const status =
        normalizeApplicationStatus(
          application.status
        );


      // PENDING

      if (
        status === 'pending'
      ) {
        pending++;
      }


      // UNDER REVIEW

      if (
        status === 'review'
      ) {
        underReview++;
      }


      // FLAGGED DUPLICATES

      const duplicate =
        application.duplicate;

      const duplicateRisk =
        application.duplicate_risk;


      if (
        duplicate === true ||
        (
          duplicate &&
          typeof duplicate ===
            'object'
        ) ||
        (
          duplicateRisk &&
          Number(
            duplicateRisk.score ||
            0
          ) >= 0.80
        )
      ) {

        flaggedDuplicates++;

      }


      // INCOMPLETE DOCUMENTS

      const documents =
        application.documents ||
        {};

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


      // READY FOR ID MAKER

      if (
        status === 'ready'
      ) {
        readyForIdMaker++;
      }

    }
  );


  const values = {

    'summary-pending':
      pending,

    'summary-review':
      underReview,

    'summary-duplicates':
      flaggedDuplicates,

    'summary-incomplete':
      incompleteDocs,

    'summary-ready':
      readyForIdMaker

  };


  Object.entries(
    values
  ).forEach(
    ([id, value]) => {

      const element =
        document.getElementById(
          id
        );

      if (element) {

        element.textContent =
          Number(value)
            .toLocaleString();

      }

    }
  );

}


// UPDATE STAFF KPI CARDS

function updateStaffKPICards(
  metrics
) {

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


  cards.forEach(
    (card, index) => {

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
          Number(
            values[index] || 0
          )
            .toLocaleString();

      }


      if (sub) {

        sub.textContent =
          subtitles[index] ||
          '';

      }


      if (trend) {

        trend.textContent =
          'Live';

      }

    }
  );

}


// BUILD LIVE ANALYTICS DATA

function updateLiveAnalyticsCharts(
  applications
) {

  if (
    !Array.isArray(
      applications
    )
  ) {
    return;
  }

  const currentYear =
    new Date().getFullYear();


  // INITIAL DATA ARRAYS

  const submitted =
    Array(12).fill(0);

  const approvedMonthly =
    Array(12).fill(0);

  const rejectedMonthly =
    Array(12).fill(0);

  const issuanceMonthly =
    Array(12).fill(0);

  const processingTotals =
    Array(12).fill(0);

  const processingCounts =
    Array(12).fill(0);

  const barangays = {};

  const ageDistribution =
    Array(6).fill(0);


  // PROCESS APPLICATIONS

  applications.forEach(
    application => {

      const createdDate =
        application.created_at
          ? new Date(
              application.created_at
            )
          : null;


      // MONTHLY SUBMISSIONS

      if (
        createdDate &&
        !Number.isNaN(
          createdDate.getTime()
        ) &&
        createdDate.getFullYear() ===
          currentYear
      ) {

        submitted[
          createdDate.getMonth()
        ]++;

      }


      // APPLICATION STATUS

      const status =
        normalizeApplicationStatus(
          application.status
        );


      // STATUS DATE

      const statusDate =
        application.status_updated_at
          ? new Date(
              application.status_updated_at
            )
          : createdDate;


      // APPROVED / REJECTED MONTHLY

      if (
        statusDate &&
        !Number.isNaN(
          statusDate.getTime()
        ) &&
        statusDate.getFullYear() ===
          currentYear
      ) {

        const month =
          statusDate.getMonth();


        if (
          status === 'approved' ||
          status === 'ready' ||
          status === 'issued' ||
          status === 'completed'
        ) {

          approvedMonthly[
            month
          ]++;

        }


        if (
          status === 'rejected'
        ) {

          rejectedMonthly[
            month
          ]++;

        }

      }


      // BARANGAY DATA

      const barangay =
        application.barangay_district ||
        'Unknown';


      if (
        !barangays[barangay]
      ) {

        barangays[barangay] = {

          total: 0,

          approved: 0,

          pending: 0

        };

      }


      barangays[barangay]
        .total++;


      if (
        status === 'approved' ||
        status === 'ready' ||
        status === 'issued' ||
        status === 'completed'
      ) {

        barangays[barangay]
          .approved++;

      }


      if (
        status === 'pending' ||
        status === 'review'
      ) {

        barangays[barangay]
          .pending++;

      }


      // AGE DISTRIBUTION

      const age =
        Number(
          application.age
        );


      if (
        !Number.isNaN(age)
      ) {

        if (
          age >= 60 &&
          age <= 64
        ) {

          ageDistribution[0]++;

        }

        else if (
          age >= 65 &&
          age <= 69
        ) {

          ageDistribution[1]++;

        }

        else if (
          age >= 70 &&
          age <= 74
        ) {

          ageDistribution[2]++;

        }

        else if (
          age >= 75 &&
          age <= 79
        ) {

          ageDistribution[3]++;

        }

        else if (
          age >= 80 &&
          age <= 84
        ) {

          ageDistribution[4]++;

        }

        else if (
          age >= 85
        ) {

          ageDistribution[5]++;

        }

      }


      // ID ISSUANCE

      if (
        (
          status === 'issued' ||
          status === 'completed'
        ) &&
        statusDate &&
        !Number.isNaN(
          statusDate.getTime()
        ) &&
        statusDate.getFullYear() ===
          currentYear
      ) {

        issuanceMonthly[
          statusDate.getMonth()
        ]++;

      }


      // PROCESSING TIME

      if (
        createdDate &&
        statusDate &&
        !Number.isNaN(
          createdDate.getTime()
        ) &&
        !Number.isNaN(
          statusDate.getTime()
        ) &&
        (
          status === 'approved' ||
          status === 'ready' ||
          status === 'issued' ||
          status === 'completed' ||
          status === 'rejected'
        )
      ) {

        const days =
          Math.max(
            0,
            Math.round(
              (
                statusDate.getTime() -
                createdDate.getTime()
              ) /
              (
                1000 *
                60 *
                60 *
                24
              )
            )
          );


        const month =
          statusDate.getMonth();


        processingTotals[month] +=
          days;

        processingCounts[month]++;

      }

    }
  );


  // PREPARE BARANGAY DATA

  const barangayLabels =
    Object.keys(
      barangays
    );


  const barangayTotal =
    barangayLabels.map(
      barangay =>
        barangays[barangay]
          .total
    );


  const barangayApproved =
    barangayLabels.map(
      barangay =>
        barangays[barangay]
          .approved
    );


  const barangayPending =
    barangayLabels.map(
      barangay =>
        barangays[barangay]
          .pending
    );


  // CALCULATE AVERAGE PROCESSING TIME

  const processing =
    processingTotals.map(
      (total, index) => {

        if (
          processingCounts[index] ===
          0
        ) {
          return 0;
        }

        return Number(
          (
            total /
            processingCounts[index]
          ).toFixed(1)
        );

      }
    );


  // CALCULATE CUMULATIVE ID ISSUANCE

  let issuedRunningTotal =
    0;


  const issuance =
    issuanceMonthly.map(
      count => {

        issuedRunningTotal +=
          count;

        return issuedRunningTotal;

      }
    );


  // UPDATE ANALYTICS DATA

  const roles = [
    ANALYTICS_DATA.admin,
    ANALYTICS_DATA.staff,
    ANALYTICS_DATA.idmaker
  ];


  roles.forEach(
    data => {

      if (!data) {
        return;
      }


      data.submitted =
        [...submitted];

      data.approvedMonthly =
        [...approvedMonthly];

      data.rejectedMonthly =
        [...rejectedMonthly];


      data.barangayLabels =
        [...barangayLabels];

      data.barangayTotal =
        [...barangayTotal];

      data.barangayApproved =
        [...barangayApproved];

      data.barangayPending =
        [...barangayPending];


      data.ageDistribution =
        [...ageDistribution];


      data.issuance =
        [...issuance];


      data.processing =
        [...processing];

    }
  );


  // REFRESH CHARTS

  if (
    typeof chartsReady !==
      'undefined' &&
    chartsReady
  ) {

    if (
      typeof CHARTS !==
      'undefined'
    ) {

      if (
        CHARTS.trend
      ) {

        if (
          CHARTS.trend.data.datasets[0]
        ) {

          CHARTS.trend.data.datasets[0]
            .data =
              submitted;

        }

        if (
          CHARTS.trend.data.datasets[1]
        ) {

          CHARTS.trend.data.datasets[1]
            .data =
              approvedMonthly;

        }

        if (
          CHARTS.trend.data.datasets[2]
        ) {

          CHARTS.trend.data.datasets[2]
            .data =
              rejectedMonthly;

        }

        CHARTS.trend.update();

      }


      if (
        CHARTS.status
      ) {

        const data =
          analyticsScope();

        CHARTS.status.data.datasets[0]
          .data = [

            data.pendingReview ||
              0,

            data.approved ||
              0,

            data.rejected ||
              0

          ];

        CHARTS.status.update();

      }


      if (
        CHARTS.barangay
      ) {

        CHARTS.barangay.data.labels =
          barangayLabels;

        CHARTS.barangay.data.datasets[0]
          .data =
            barangayTotal;

        CHARTS.barangay.update();

      }


      if (
        CHARTS.age
      ) {

        CHARTS.age.data.datasets[0]
          .data =
            ageDistribution;

        CHARTS.age.update();

      }


      if (
        CHARTS.issuance
      ) {

        CHARTS.issuance.data.datasets[0]
          .data =
            issuance;

        CHARTS.issuance.update();

      }


      if (
        CHARTS.processing
      ) {

        CHARTS.processing.data.datasets[0]
          .data =
            processing;

        CHARTS.processing.update();

      }

    }

  }

}


// INITIALIZE CHARTS IF READY

if (
  typeof chartsReady !==
    'undefined' &&
  chartsReady
) {

  initAllCharts();

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


  if (
    role === 'Staff'
  ) {

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
  window.setRole ||
  (() => {});


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

function renderLiveApplicants(applications) {

  const tbody =
    document.getElementById(
      'applicants-tbody'
    );

  if (!tbody) {
    return;
  }

  const totalBadge =
    document.getElementById(
      'applicants-total-badge'
    );

  if (totalBadge) {
    totalBadge.textContent =
      `${applications.length.toLocaleString()} Total`;
  }


  if (
    !Array.isArray(
      applications
    ) ||
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

    const footer = document.querySelector(
      '#mod-applicants .table-footer__info'
    );

    if (footer) {
      footer.textContent = 'Showing 0 of 0 applicants';
    }

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
                      application.sex ||
                      'Applicant'
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


            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(appId)}
              </span>
            </td>


            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(barangay)}
              </span>
            </td>


            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(
                  String(age)
                )}
              </span>
            </td>


            <td>
              <span class="cell-text">
                ${escapeApplicationHtml(
                  occupation
                )}
              </span>
            </td>


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


            <td>
              ${docsHtml}
            </td>


            <td>
              ${statusHtml}
            </td>


            <td>
              <button
                class="row-action always-visible"
                type="button"
                onclick="openApplicationDetail('${escapeApplicationHtml(appId)}')"
              >
                View
              </button>
            </td>

          </tr>
        `;

      }
    )
    .join('');

    const footer = document.querySelector(
      '#mod-applicants .table-footer__info'
    );

    if (footer) {
      footer.textContent =
        `Showing ${applications.length.toLocaleString()} of ${applications.length.toLocaleString()} applicants`;
    }

}

// RENDER LIVE APPLICATIONS

function renderLiveApplications(applications) {

  const tbody =
    document.getElementById(
      'applications-tbody'
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
          colspan="8"
          style="
            text-align:center;
            padding:32px;
            color:var(--text-muted);
          "
        >
          No applications found.
        </td>
      </tr>
    `;

    const shown =
      document.getElementById(
        'apps-shown'
      );

    const total =
      document.getElementById(
        'apps-total'
      );

    if (shown) {
      shown.textContent = '0';
    }

    if (total) {
      total.textContent = '0';
    }

    return;
  }


  // SAVE EACH LIVE APPLICATION
  // so status updates can still use APP_DB

  applications.forEach(
    application => {

      const appId =
        application.application_id ||
        application.id ||
        '';

      if (appId) {
        APP_DB[appId] = application;
      }

    }
  );


  tbody.innerHTML =
    applications.map(
      (application, index) => {

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


        const barangay =
          application.barangay_district ||
          '—';


        const createdAt =
          application.created_at ||
          application.submitted_at ||
          null;


        let formattedDate =
          '—';


        if (createdAt) {

          const date =
            new Date(createdAt);

          if (
            !Number.isNaN(
              date.getTime()
            )
          ) {

            formattedDate =
              date.toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                }
              );

          }

        }


        const status =
          application.status ||
          'Pending';


        // APPLICATION TYPE

        let applicationTypeHtml =
          '<span class="app-type-pill app-type-pill--first">★ First-Time</span>';

        if (
          typeof buildApplicationTypePill ===
          'function'
        ) {

          try {

            applicationTypeHtml =
              buildApplicationTypePill(
                application
              );

          } catch (error) {

            console.warn(
              'Unable to build application type:',
              error
            );

          }

        }


        // DOCUMENT STATUS

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


        // STATUS DROPDOWN

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
              'Unable to build application status:',
              error
            );

          }

        }


        // URGENT CHECK

        let daysPending =
          Number(
            application.days_pending
          );

        if (
          !Number.isFinite(daysPending)
        ) {

          daysPending = 0;

          if (
            createdAt &&
            (
              String(status)
                .toLowerCase() ===
                'pending' ||
              String(status)
                .toLowerCase() ===
                'under review'
            )
          ) {

            const created =
              new Date(createdAt);

            if (
              !Number.isNaN(
                created.getTime()
              )
            ) {

              daysPending =
                Math.floor(
                  (
                    Date.now() -
                    created.getTime()
                  ) /
                  (
                    1000 *
                    60 *
                    60 *
                    24
                  )
                );

            }

          }

        }


        const avatar =
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


        const gradients = [
          'linear-gradient(135deg,#FDE68A,#D97706)',
          'linear-gradient(135deg,#34D399,#059669)',
          'linear-gradient(135deg,#93C5FD,#2563EB)',
          'linear-gradient(135deg,#F9A8D4,#DB2777)',
          'linear-gradient(135deg,#C4B5FD,#7C3AED)',
          'linear-gradient(135deg,#FCA5A5,#DC2626)'
        ];

        const gradient =
          gradients[
            index % gradients.length
          ];


        return `
          <tr
            data-app-id="${escapeApplicationHtml(appId)}"
          >

            <td style="width:40px">

              <input
                type="checkbox"
                class="row-check"
                data-app-id="${escapeApplicationHtml(appId)}"
                aria-label="Select ${escapeApplicationHtml(fullName)}"
                onchange="updateBatchState()"
              />

            </td>


            <td data-label="Applicant">

              <div class="applicant-cell">

                <div
                  class="applicant-avatar"
                  style="background:${gradient}"
                >
                  ${escapeApplicationHtml(avatar)}
                </div>

                <div class="applicant-info">

                  <span class="applicant-name">
                    ${escapeApplicationHtml(fullName)}
                  </span>

                  <span class="applicant-id">
                    ${escapeApplicationHtml(appId)}
                  </span>

                </div>

              </div>

            </td>


            <td data-label="Date">

              <span class="cell-text">
                ${escapeApplicationHtml(
                  formattedDate
                )}
              </span>

            </td>


            <td data-label="Application Type">

              ${applicationTypeHtml}

            </td>


            <td data-label="Barangay">

              <span class="cell-text">
                ${escapeApplicationHtml(
                  barangay
                )}
              </span>

            </td>


            <td data-label="Docs Status">

              ${docsHtml}

            </td>


            <td data-label="Status">

              ${statusHtml}

            </td>


            <td style="text-align:right">

              ${
                typeof buildViewAction ===
                'function'
                  ? buildViewAction(appId)
                  : `
                    <button
                      type="button"
                      class="row-action always-visible"
                      onclick="openApplicationDetail('${escapeApplicationHtml(appId)}')"
                    >
                      View
                    </button>
                  `
              }

            </td>

          </tr>
        `;

      }
    )
    .join('');


  // UPDATE TOTALS

  const shown =
    document.getElementById(
      'apps-shown'
    );

  const total =
    document.getElementById(
      'apps-total'
    );

  if (shown) {
    shown.textContent =
      applications.length;
  }

  if (total) {
    total.textContent =
      applications.length;
  }


  // UPDATE STATUS TAB COUNTS

  if (
    typeof updateStatusTabCounts ===
    'function'
  ) {

    updateStatusTabCounts();

  }


  // UPDATE URGENT COUNT

  const urgentCount =
    applications.filter(
      application => {

        const status =
          String(
            application.status ||
            ''
          )
            .trim()
            .toLowerCase();

        let days =
          Number(
            application.days_pending
          );

        if (
          !Number.isFinite(days) &&
          application.created_at &&
          (
            status === 'pending' ||
            status === 'under review'
          )
        ) {

          const created =
            new Date(
              application.created_at
            );

          if (
            !Number.isNaN(
              created.getTime()
            )
          ) {

            days =
              Math.floor(
                (
                  Date.now() -
                  created.getTime()
                ) /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
              );

          }

        }

        return days > 5;

      }
    )
    .length;


  const urgentElement =
    document.getElementById(
      'urgent-count'
    );

  if (urgentElement) {

    urgentElement.textContent =
      `${urgentCount} Urgent`;

  }


  const urgentAlert =
    document.getElementById(
      'urgent-alert'
    );

  const urgentTitle =
    document.getElementById(
      'urgent-alert-title'
    );

  const urgentDescription =
    document.getElementById(
      'urgent-alert-desc'
    );


  if (urgentAlert) {

    urgentAlert.style.display =
      urgentCount > 0
        ? ''
        : 'none';

  }


  if (urgentTitle) {

    urgentTitle.textContent =
      urgentCount > 0
        ? `${urgentCount} application${
            urgentCount === 1
              ? ''
              : 's'
          } require urgent review`
        : 'No urgent applications';

  }


  if (urgentDescription) {

    urgentDescription.textContent =
      urgentCount > 0
        ? 'These applications have been pending for more than 5 days and need immediate attention.'
        : 'Applications pending for more than 5 days will appear here.';

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
      status === 'pending' ||
      status === 'under review'
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


// RENDER RECENT SUBMISSIONS

function renderRecentSubmissions(
  applications
) {

  const tbody =
    document.getElementById(
      'recent-submissions-tbody'
    );

  if (!tbody) {
    return;
  }


  if (
    !Array.isArray(
      applications
    )
  ) {
    return;
  }


  const recentApplications =
    applications
      .filter(application => {

        const status =
          normalizeApplicationStatus(
            application.status
          );

        return (
          status === 'pending' ||
          status === 'review'
        );

      })
      .sort(
        (a, b) => {

          const dateA =
            new Date(
              a.created_at ||
              a.submitted_at ||
              0
            );

          const dateB =
            new Date(
              b.created_at ||
              b.submitted_at ||
              0
            );

          return (
            dateB.getTime() -
            dateA.getTime()
          );

        }
      )
      .slice(0, 5);


  if (
    !recentApplications.length
  ) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="
            text-align:center;
            padding:24px;
            color:var(--text-muted);
          "
        >
          No recent submissions found.
        </td>
      </tr>
    `;

  } else {

    tbody.innerHTML =
      recentApplications
        .map(
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


            const barangay =
              application.barangay_district ||
              '—';


            const createdAt =
              application.created_at ||
              application.submitted_at ||
              null;


            let formattedDate =
              '—';


            if (createdAt) {

              const date =
                new Date(
                  createdAt
                );

              if (
                !Number.isNaN(
                  date.getTime()
                )
              ) {

                formattedDate =
                  date.toLocaleDateString(
                    'en-US',
                    {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }
                  );

              }

            }


            const status =
              application.status ||
              'Pending';


            return `
              <tr>

                <td>
                  <span class="cell-text">
                    ${escapeApplicationHtml(
                      fullName
                    )}
                  </span>
                </td>

                <td>
                  <span class="cell-text">
                    ${escapeApplicationHtml(
                      formattedDate
                    )}
                  </span>
                </td>

                <td>
                  <span class="cell-text">
                    ${escapeApplicationHtml(
                      barangay
                    )}
                  </span>
                </td>

                <td>
                  <span class="status-select__label">
                    ${escapeApplicationHtml(
                      status
                    )}
                  </span>
                </td>

                <td style="text-align:right">

                  <button
                    class="row-action always-visible"
                    onclick="
                      openApplicationDetail(
                        '${escapeApplicationHtml(
                          appId
                        )}'
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

  }


  // UPDATE RECENT SUBMISSIONS FOOTER

  const cards =
    document.querySelectorAll(
      '.data-table-card'
    );


  cards.forEach(card => {

    const title =
      card
        .querySelector(
          '.table-header__title'
        )
        ?.textContent
        ?.trim();


    if (
      title !==
      'Recent Submissions'
    ) {
      return;
    }


    const footer =
      card.querySelector(
        '.table-footer__info'
      );


    if (footer) {

      footer.textContent =
        `Showing ${
          recentApplications.length
        } of ${
          applications.length
        } applicants`;

    }

  });

}


// LOAD APPLICATIONS

async function loadApplicationsFromDatabase() {

  try {

    console.log(
      "Loading applications from backend..."
    );


    const response =
      await fetch(
        "https://management-backend-3cij.onrender.com/api/applications",
        {
          method: "GET",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );


    console.log(
      "API response status:",
      response.status
    );


    if (!response.ok) {

      throw new Error(
        `API request failed with status ${response.status}`
      );

    }


    const result =
      await response.json();


    console.log(
      "API result:",
      result
    );


    if (!result.success) {

      throw new Error(
        result.message ||
        "Backend returned success:false"
      );

    }


    const applications =
      Array.isArray(
        result.applications
      )
        ? result.applications
        : [];


    console.log(
      "Applications loaded successfully:",
      applications.length
    );


    // SAVE LIVE APPLICATIONS

    LIVE_APPLICATIONS = applications;


    // UPDATE LIVE ANALYTICS

    if (typeof updateLiveAnalyticsData === "function") {
      updateLiveAnalyticsData(applications);
    }


    // UPDATE DASHBOARD VISUALS

    if (typeof updateLiveDashboardVisuals === "function") {
      updateLiveDashboardVisuals(applications);
    }


    // UPDATE ANALYTICS CHART DATA

    if (typeof updateLiveAnalyticsCharts === "function") {
      updateLiveAnalyticsCharts(applications);
    }


    // UPDATE APPLICANTS TABLE

    if (typeof renderLiveApplicants === "function") {
      renderLiveApplicants(applications);
    }

    if (typeof updateApplicantSummaryCards === "function") {
      updateApplicantSummaryCards(applications);
    }


    // UPDATE RECENT SUBMISSIONS

    if (typeof renderRecentSubmissions === "function") {
      renderRecentSubmissions(applications);
    }


    // UPDATE APPLICATIONS TABLE

    if (typeof renderLiveApplications === "function") {
      renderLiveApplications(applications);
    }


    return applications;


  } catch (error) {

    console.error(
      "ERROR LOADING APPLICATIONS:",
      error
    );


    console.error(
      "Make sure the backend is running at:",
      "http://localhost:5000"
    );


    if (
      typeof showToast ===
      "function"
    ) {

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

    console.log("Staff dashboard loaded.");

    if (
      typeof CURRENT_ROLE !== 'undefined' &&
      CURRENT_ROLE
    ) {
      switchKPIs(
        CURRENT_ROLE
      );
    }

    // INITIALIZE ANALYTICS CHARTS
    if (
      typeof initAllCharts === "function"
    ) {
      initAllCharts();
    }

    // LOAD APPLICATIONS FROM DATABASE
    if (
      typeof loadApplicationsFromDatabase === "function"
    ) {
      loadApplicationsFromDatabase();
    }

  }
);