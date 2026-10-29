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
          bar.removeAttribute('title');
          bar.classList.remove('bar-col__bar--peak');
        }

        column.style.setProperty('--bar-height', '0%');
        column.classList.remove('is-peak');
        const value = column.querySelector('.bar-col__value');
        const label = column.querySelector('.bar-col__label');
        if (value) value.textContent = '0';
        if (label) {
          label.textContent = '\u2014';
          label.removeAttribute('title');
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

          column.style.setProperty('--bar-height', '0%');
          column.classList.remove('is-peak');
          bar.classList.remove('bar-col__bar--peak');
          bar.removeAttribute('title');
          const emptyValue = column.querySelector('.bar-col__value');
          const emptyLabel = column.querySelector('.bar-col__label');
          if (emptyValue) emptyValue.textContent = '0';
          if (emptyLabel) {
            emptyLabel.textContent = '\u2014';
            emptyLabel.removeAttribute('title');
          }

          return;
        }

        const barangay =
          row[0];

        const count =
          row[1];

        const height = count > 0
          ? Math.max(5, Math.round((count / maxValue) * 84))
          : 0;

        bar.style.height =
          `${height}%`;
        column.style.setProperty('--bar-height', `${height}%`);
        column.classList.toggle('is-peak', index === 0);
        bar.classList.toggle('bar-col__bar--peak', index === 0);

        bar.title =
          `${barangay}: ${count}`;

        const label =
          column.querySelector(
            '.bar-col__label'
          );

        if (label) {
          label.textContent =
            barangay;
          label.title = barangay;
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

  const donutSvg =
    document.querySelector(
      '.donut-svg'
    );

  const donutPercent =
    document.querySelector(
      '.donut-inner__pct'
    );

  const donutTag =
    document.querySelector(
      '.donut-inner__tag'
    );

  const legendValues =
    document.querySelectorAll(
      '.donut-legend__val'
    );

  let female = 0;
  let male = 0;


  applications.forEach(
    application => {

      const sex =
        String(
          application.sex ||
          application.gender ||
          application.sex_at_birth ||
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

// ============================================================
// INITIALIZE BARANGAY YEAR FILTER
// ============================================================

function initializeBarangayYearFilter() {

  const select =
    document.getElementById(
      'barangay-year-filter'
    );

  if (!select) {
    return;
  }

  const currentYear =
    new Date().getFullYear();

  const years = [];

  for (
    let year = currentYear;
    year >= currentYear - 4;
    year--
  ) {
    years.push(year);
  }

  select.innerHTML =
    years
      .map(
        year =>
          `<option value="${year}">${year}</option>`
      )
      .join('');

  select.value =
    String(currentYear);

}

// BARANGAY YEAR FILTER

function filterBarangayYear(year) {

  const applications =
    Array.isArray(
      LIVE_APPLICATIONS
    )
      ? LIVE_APPLICATIONS
      : [];

  updateLiveDashboardVisuals(
    applications
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


// STAFF DASHBOARD KPI CARDS

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
    Number(metrics.total) || 0,
    Number(metrics.pendingReview) || 0,
    Number(metrics.approvedToday) || 0,
    Number(metrics.processedThisMonth) || 0,
    Number(metrics.rejectedThisMonth) || 0
  ];

  const subtitles = [
    'System volume',
    'Awaiting staff action',
    'Completed today',
    'Processed this month',
    'Rejected this month'
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
          values[index].toLocaleString();

      }

      if (sub) {

        sub.textContent =
          subtitles[index] || '';

      }

      if (trend) {

        trend.textContent =
          'Live';

      }

    }
  );

}

function updateAgeDistributionLegend() {

  const container =
    document.getElementById(
      'age-distribution-legend'
    );

  if (!container) {
    return;
  }

  const data =
    analyticsScope().ageDistribution ||
    [0, 0, 0, 0, 0, 0];

  const groups = [
    {
      label: '60–64 yrs',
      value: Number(data[0]) || 0
    },
    {
      label: '65–69 yrs',
      value: Number(data[1]) || 0
    },
    {
      label: '70–74 yrs',
      value: Number(data[2]) || 0
    },
    {
      label: '75–79 yrs',
      value: Number(data[3]) || 0
    },
    {
      label: '80–84 yrs',
      value: Number(data[4]) || 0
    },
    {
      label: '85+ yrs',
      value: Number(data[5]) || 0
    }
  ];

  const total =
    groups.reduce(
      (sum, group) =>
        sum + group.value,
      0
    );

  container.innerHTML =
    groups.map(
      group => {

        const percent =
          total > 0
            ? Math.round(
              (group.value / total) * 100
            )
            : 0;

        return `
          <div
            style="
              display:flex;
              align-items:center;
              gap:8px;
              font-size:13px;
              line-height:1.3;
            "
          >
            <span
              style="
                width:10px;
                height:10px;
                border-radius:50%;
                background:var(--primary);
                flex-shrink:0;
              "
            ></span>

            <span>
              <strong style="font-size:13px">
                ${group.label}
              </strong>

              <br />

              <span
                style="
                  color:var(--text-muted);
                  font-size:12px;
                "
              >
                ${percent}% · ${group.value}
              </span>
            </span>
          </div>
        `;

      }
    )
      .join('');
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

      const createdDateValue =
        application.created_at ||
        application.submitted_at ||
        application.application_date ||
        null;

      const createdDate =
        createdDateValue
          ? new Date(createdDateValue)
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

      const statusDateValue =
        application.status_updated_at ||
        application.updated_at ||
        createdDateValue;

      const statusDate =
        statusDateValue
          ? new Date(statusDateValue)
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
    'Admin',
    'Staff',
    'ID Maker'
  ];

  roles.forEach(
    role => {

      const data =
        ANALYTICS_DATA[role];

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

      updateAgeDistributionLegend();


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


      if (CHARTS.status) {

        const data = analyticsScope();

        CHARTS.status.data.labels = [
          'Approved',
          'Pending',
          'In Review',
          'Rejected'
        ];

        CHARTS.status.data.datasets[0].data = [
          Number(data.approved) || 0,
          Number(data.pending) || 0,
          Number(data.inReview) || 0,
          Number(data.rejected) || 0
        ];

        CHARTS.status.update();

      }


      if (CHARTS.barangay) {

        CHARTS.barangay.data.labels =
          barangayLabels;

        if (CHARTS.barangay.data.datasets[0]) {
          CHARTS.barangay.data.datasets[0].data =
            barangayTotal;
        }

        if (CHARTS.barangay.data.datasets[1]) {
          CHARTS.barangay.data.datasets[1].data =
            barangayApproved;
        }

        if (CHARTS.barangay.data.datasets[2]) {
          CHARTS.barangay.data.datasets[2].data =
            barangayPending;
        }

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
  updateAnalyticsHandoff(applications);
}

function updateAnalyticsHandoff(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  const total = applications.length;

  const ready = applications.filter(
    application =>
      normalizeApplicationStatus(
        application.status
      ) === 'ready'
  ).length;

  const percent =
    total > 0
      ? Math.round(
        (ready / total) * 100
      )
      : 0;

  const percentEl =
    document.getElementById(
      'analytics-handoff-percent'
    );

  const titleEl =
    document.getElementById(
      'analytics-handoff-title'
    );

  const descriptionEl =
    document.getElementById(
      'analytics-handoff-description'
    );

  if (percentEl) {
    percentEl.textContent =
      `${percent}%`;
  }

  if (titleEl) {
    titleEl.textContent =
      ready > 0
        ? `${ready} application${ready === 1 ? '' : 's'} ready for handoff`
        : 'No handoff data yet';
  }

  if (descriptionEl) {
    descriptionEl.textContent =
      ready > 0
        ? 'Approved applications ready to move to the ID Maker queue.'
        : 'Applications marked Ready for Release will appear here.';
  }

}

// DASHBOARD QUICK SEARCH

function handleDashboardQuickSearch(query) {

  const value =
    String(query || '')
      .trim()
      .toLowerCase();

  const recentSearch =
    document.getElementById(
      'recent-submission-search'
    );

  if (recentSearch) {

    recentSearch.value =
      query || '';

    filterRecentSubmissions();

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
            `stat-card${index === 1
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
  (() => { });


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
          application.barangay ||
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

                <div class="applicant-avatar" style="background:linear-gradient(135deg,#FDE68A,#D97706)">
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
              ${renderApplicationTypePill(application)}
            </td>


            <td>
              ${docsHtml}
            </td>


            <td>
              ${statusHtml}
            </td>


            <td style="text-align:right">${buildViewAction(appId)}</td>

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

// Applicant summary cards calculation


function updateApplicantSummaryCards(applications) {
  if (!Array.isArray(applications)) return;

  const totalRegistered = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'completed';
  }).length;

  const pending = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'pending';
  }).length;

  const underReview = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'under review';
  }).length;

  const inProcess = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'in process';
  }).length;

  const readyForRelease = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'ready for release';
  }).length;

  const rejected = applications.filter(application => {
    const status = String(application.status || '').trim().toLowerCase();
    return status === 'rejected';
  }).length;

  /*
   * Total Registered = COMPLETED applicants only.
   */
  const totalEl = document.getElementById('applicants-total-count');
  if (totalEl) {
    totalEl.textContent = totalRegistered.toLocaleString();
  }

  /*
   * These two old cards used statuses that do not exist
   * in the backend anymore.
   *
   * We repurpose them into useful workflow counts.
   */
  const verifiedEl = document.getElementById('applicants-verified-count');
  if (verifiedEl) {
    verifiedEl.textContent = (pending + underReview).toLocaleString();
  }

  const unverifiedEl = document.getElementById('applicants-unverified-count');
  if (unverifiedEl) {
    unverifiedEl.textContent = inProcess.toLocaleString();
  }

  const issuedEl = document.getElementById('applicants-issued-count');
  if (issuedEl) {
    issuedEl.textContent = readyForRelease.toLocaleString();
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
              <tr data-app-id="${escapeApplicationHtml(appId)}" data-status="${escapeApplicationHtml(status)}">

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
                  <span class="cell-text status-select__label">
                    ${escapeApplicationHtml(
              status
            )}
                  </span>
                </td>

                <td style="text-align:right">${buildViewAction(appId)}</td>

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

  cards.forEach(
    card => {

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

      if (!footer) {
        return;
      }

      footer.textContent =
        `Showing ${recentApplications.length
        } latest submissions`;

    }
  );

}

// ============================================================
// STAFF DASHBOARD LOADING STATE
// ============================================================

function setStaffDashboardLoading(isLoading) {

  const strip =
    document.getElementById(
      'staff-kpi-strip'
    );

  if (strip) {

    strip.classList.toggle(
      'is-loading',
      Boolean(isLoading)
    );

  }


  const tbody =
    document.getElementById(
      'recent-submissions-tbody'
    );


  if (!tbody) return;

  if (isLoading) {
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setTable('recent-submissions-tbody', 5);
    }
    return;
  }

  // Successful loads replace the skeleton in renderRecentSubmissions(). If
  // loading failed or returned invalid data, clear the busy state with a
  // useful message instead of leaving the skeleton spinning forever.
  if (tbody.querySelector('.sk-row')) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">
          Recent submissions could not be loaded.
        </td>
      </tr>
    `;
    if (typeof Skeleton !== 'undefined') {
      Skeleton.clearBusy('recent-submissions-tbody');
    }
  }

}

// LOAD APPLICATIONS FROM DATABASE

async function loadApplicationsFromDatabase() {

  // Show loading state
  if (typeof Skeleton !== 'undefined' && typeof Skeleton.setAllKpisLoading === 'function') {
    Skeleton.setAllKpisLoading(true);
  } else {
    setStaffDashboardLoading(true);
  }
  document.querySelectorAll('.data-table-card, .content-card').forEach(el => el.setAttribute('aria-busy', 'true'));
  document.querySelectorAll('.admin-kpi-strip, .cards-grid, .analytics-hero__stats, .stat-card, .analytics-kpi, .chart-card, .donut-card').forEach(el => el.classList.add('is-loading'));

  try {

    console.log(
      "Loading applications from backend..."
    );


    // --------------------------------------------------------
    // FETCH APPLICATIONS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // CHECK RESPONSE
    // --------------------------------------------------------

    if (!response.ok) {

      throw new Error(
        `API request failed with status ${response.status}`
      );

    }


    // --------------------------------------------------------
    // READ JSON
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // GET APPLICATION ARRAY
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // SAVE LIVE APPLICATIONS
    // --------------------------------------------------------

    LIVE_APPLICATIONS =
      applications;


    // --------------------------------------------------------
    // SYNC APPLICATIONS TO APP DB
    // --------------------------------------------------------

    if (
      typeof syncApplicationsToAppDB ===
      'function'
    ) {

      syncApplicationsToAppDB(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE LIVE ANALYTICS DATA
    // --------------------------------------------------------

    if (
      typeof updateLiveAnalyticsData ===
      "function"
    ) {

      updateLiveAnalyticsData(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE DASHBOARD VISUALS
    // --------------------------------------------------------

    if (
      typeof updateLiveDashboardVisuals ===
      "function"
    ) {

      updateLiveDashboardVisuals(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE ANALYTICS CHART DATA
    // --------------------------------------------------------

    if (
      typeof updateLiveAnalyticsCharts ===
      "function"
    ) {

      updateLiveAnalyticsCharts(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE APPLICANTS TABLE
    // --------------------------------------------------------

    if (
      typeof renderLiveApplicants ===
      "function"
    ) {

      renderLiveApplicants(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE APPLICANT SUMMARY CARDS
    // --------------------------------------------------------

    if (
      typeof updateApplicantSummaryCards ===
      "function"
    ) {

      updateApplicantSummaryCards(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE RECENT SUBMISSIONS
    // --------------------------------------------------------

    if (
      typeof renderRecentSubmissions ===
      "function"
    ) {

      renderRecentSubmissions(
        applications
      );

    }


    // --------------------------------------------------------
    // UPDATE APPLICATIONS TABLE
    // --------------------------------------------------------

    if (
      typeof renderLiveApplications ===
      "function"
    ) {

      renderLiveApplications(
        applications
      );

    }


    // --------------------------------------------------------
    // RETURN DATA
    // --------------------------------------------------------

    return applications;


  } catch (error) {

    console.error(
      "ERROR LOADING APPLICATIONS:",
      error
    );


    console.error(
      "Make sure the backend is running at:",
      "https://management-backend-3cij.onrender.com"
    );


    // Show user-friendly message
    if (
      typeof showToast ===
      "function"
    ) {

      showToast(
        "Failed to load applications. Please try again.",
        "error"
      );

    }


    return [];


  } finally {

    // Always remove loading state,
    // whether loading succeeded or failed.
    if (typeof Skeleton !== 'undefined' && typeof Skeleton.setAllKpisLoading === 'function') {
      Skeleton.setAllKpisLoading(false);
    } else {
      setStaffDashboardLoading(false);
    }
    document.querySelectorAll('.data-table-card, .content-card').forEach(el => el.removeAttribute('aria-busy'));
    document.querySelectorAll('.admin-kpi-strip, .cards-grid, .analytics-hero__stats, .stat-card, .analytics-kpi, .chart-card, .donut-card').forEach(el => el.classList.remove('is-loading'));
    clearBusy('recent-apps-tbody');
    clearBusy('recent-submissions-tbody');

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

    console.log(
      "Staff dashboard loaded."
    );

    // INITIALIZE ROLE
    if (
      typeof CURRENT_ROLE !== 'undefined' &&
      CURRENT_ROLE
    ) {

      switchKPIs(
        CURRENT_ROLE
      );

    }

    // INITIALIZE BARANGAY YEAR FILTER
    initializeBarangayYearFilter();

    // INITIALIZE ANALYTICS CHARTS
    if (
      typeof initAllCharts === "function"
    ) {

      initAllCharts();

    }

    // LOAD APPLICATIONS
    if (
      typeof loadApplicationsFromDatabase ===
      "function"
    ) {

      loadApplicationsFromDatabase();

    }

  }
);

// Registry view helpers: group request rows into one profile per senior.
var STAFF_APPLICANT_PROFILES = [];
var APPLICATIONS_FILTER_STATE = { search: '', barangay: '', type: 'all', status: 'all' };

function getApplicationName(application) {
  return [application.first_name, application.middle_name, application.surname]
    .filter(Boolean).join(' ').trim() || application.full_name || application.name || 'Unnamed Applicant';
}

function getApplicationSubmittedDate(application) {
  return application.created_at || application.submitted_at || application.date_submitted || null;
}

function formatStaffDate(value) {
  const date = value instanceof Date ? value : (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
}

function normalizeProfileIdentity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function getProfileIdentityKey(application, fallbackIndex) {
  const name = normalizeProfileIdentity(getApplicationName(application));
  const dobValue = application.date_of_birth || application.dob || '';
  const dobDate = dobValue ? new Date(dobValue) : null;
  const dob = dobDate && !Number.isNaN(dobDate.getTime())
    ? dobDate.toISOString().slice(0, 10) : normalizeProfileIdentity(dobValue);
  if (name && dob) return 'person:' + name + '|' + dob;
  const seniorId = application.osca_id_number || application.senior_citizen_id || application.id_number;
  if (seniorId) return 'id:' + normalizeProfileIdentity(seniorId);
  return 'application:' + String(application.application_id || application.id || fallbackIndex);
}

function isProfileDuplicateFlagged(application) {
  const duplicate = application.duplicate;
  const risk = application.duplicate_risk;
  return duplicate === true || Boolean(duplicate && typeof duplicate === 'object') ||
    Boolean(risk && Number(risk.score || 0) >= 0.8);
}

function buildApplicantProfiles(applications) {
  const groups = new Map();
  (Array.isArray(applications) ? applications : []).forEach((application, index) => {
    const key = getProfileIdentityKey(application, index);
    if (!groups.has(key)) groups.set(key, { key, applications: [] });
    groups.get(key).applications.push(application);
  });

  return Array.from(groups.values()).map(profile => {
    profile.applications.sort((a, b) =>
      (new Date(getApplicationSubmittedDate(b) || 0).getTime() || 0) -
      (new Date(getApplicationSubmittedDate(a) || 0).getTime() || 0));
    profile.latestApplication = profile.applications[0];
    profile.name = getApplicationName(profile.latestApplication);
    const dobValue = profile.latestApplication.date_of_birth || profile.latestApplication.dob || '';
    const dobDate = dobValue ? new Date(dobValue) : null;
    profile.nameDobKey = dobValue
      ? normalizeProfileIdentity(profile.name) + '|' +
      (dobDate && !Number.isNaN(dobDate.getTime()) ? dobDate.toISOString().slice(0, 10) : normalizeProfileIdentity(dobValue))
      : '';
    const addressRecord = profile.applications.find(a => a.barangay_district || a.barangay) || {};
    profile.barangay = addressRecord.barangay_district || addressRecord.barangay || '';
    const birthDateValue = profile.latestApplication.date_of_birth || profile.latestApplication.dob;
    let calculatedAge = null;
    if (birthDateValue) {
      const birthDate = new Date(birthDateValue);
      if (!Number.isNaN(birthDate.getTime())) {
        const today = new Date();
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() ||
          (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) calculatedAge--;
      }
    }
    profile.age = profile.latestApplication.age ?? calculatedAge ?? '—';
    const idRecord = profile.applications.find(a => a.application_id || a.id || a.osca_id_number || a.senior_citizen_id || a.id_number);
    profile.seniorId = idRecord && (idRecord.application_id || idRecord.id || idRecord.osca_id_number || idRecord.senior_citizen_id || idRecord.id_number) || '';
    profile.completedApplications = profile.applications.filter(a => normalizeApplicationStatus(a.status) === 'completed');
    profile.isRegistered = profile.completedApplications.length > 0;
    const registeredDates = profile.completedApplications.map(a => new Date(a.status_updated_at || a.updated_at || a.created_at || 0))
      .filter(date => !Number.isNaN(date.getTime()) && date.getTime() > 0).sort((a, b) => a - b);
    profile.registeredAt = registeredDates[0] || null;
    profile.isActive = profile.applications.some(a =>
      ['pending', 'review', 'approved', 'process', 'ready', 'issued'].includes(normalizeApplicationStatus(a.status)));
    profile.hasDuplicateFlag = profile.applications.some(isProfileDuplicateFlagged);
    profile.status = profile.isRegistered ? 'Registered' : (profile.latestApplication.status || 'Pending');
    return profile;
  });
}

function getProfileStatusClass(status) {
  if (status === 'Registered') return 'badge-issued';
  const normalized = normalizeApplicationStatus(status);
  if (normalized === 'rejected') return 'badge-rejected';
  if (normalized === 'review') return 'badge-review';
  if (normalized === 'pending') return 'badge-pending';
  return 'badge-approved';
}

function renderLiveApplicants(applications) {
  const tbody = document.getElementById('applicants-tbody');
  if (!tbody) return;
  STAFF_APPLICANT_PROFILES = buildApplicantProfiles(applications);
  const profiles = STAFF_APPLICANT_PROFILES;
  const badge = document.getElementById('applicants-total-badge');
  if (badge) badge.textContent = profiles.length.toLocaleString() + ' Profiles';
  if (!profiles.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No applicant profiles found.</td></tr>';
    if (typeof Skeleton !== 'undefined') Skeleton.clearBusy('applicants-tbody');
    const footer = document.querySelector('#mod-applicants .table-footer__info');
    if (footer) footer.textContent = 'Showing 0 of 0 applicants';
    return;
  }

  tbody.innerHTML = profiles.map((profile, index) => {
    const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
    const status = String(profile.status || 'Pending');
    const ids = profile.applications.map(a => a.application_id || a.id || '').join(' ');
    const searchText = [profile.name, profile.seniorId, profile.barangay, ids].join(' ').toLowerCase();
    return `<tr data-profile-index="${index}" data-status="${escapeApplicationHtml(status.toLowerCase())}"
      data-barangay="${escapeApplicationHtml(profile.barangay.toLowerCase())}" data-search="${escapeApplicationHtml(searchText)}">
      <td><div class="applicant-cell"><div class="applicant-avatar">${escapeApplicationHtml(initials)}</div><div class="applicant-info">
        <span class="applicant-name">${escapeApplicationHtml(profile.name)}</span><span class="applicant-id">${profile.applications.length} linked request${profile.applications.length === 1 ? '' : 's'}</span></div></div></td>
      <td><span class="cell-text">${escapeApplicationHtml(profile.seniorId || '—')}</span></td>
      <td><span class="cell-text">${escapeApplicationHtml(profile.barangay || '—')}</span></td>
      <td><span class="cell-text">${escapeApplicationHtml(String(profile.age))}</span></td>
      <td><span class="cell-text">${profile.registeredAt ? escapeApplicationHtml(formatStaffDate(profile.registeredAt)) : '—'}</span></td>
      <td><span class="badge ${getProfileStatusClass(status)}"><span class="status-select__label">${escapeApplicationHtml(status)}</span></span></td>
      <td style="text-align:right"><button type="button" class="row-action always-visible" onclick="openApplicantProfile(${index})">View Profile</button></td>
    </tr>`;
  }).join('');
  if (typeof Skeleton !== 'undefined') Skeleton.clearBusy('applicants-tbody');
  applyApplicantsFilters();
}

function applyApplicantsFilters() {
  const rows = document.querySelectorAll('#applicants-tbody tr[data-profile-index]');
  const search = APPLICANTS_FILTER_STATE.search.trim().toLowerCase();
  const barangay = APPLICANTS_FILTER_STATE.barangay.trim().toLowerCase();
  const status = APPLICANTS_FILTER_STATE.status.trim().toLowerCase();
  let visible = 0;
  rows.forEach(row => {
    const matches = (!search || (row.dataset.search || row.textContent).toLowerCase().includes(search)) &&
      (!barangay || row.dataset.barangay === barangay) && (!status || row.dataset.status === status);
    row.style.display = matches ? '' : 'none';
    if (matches) visible++;
  });
  const footer = document.querySelector('#mod-applicants .table-footer__info');
  if (footer) footer.textContent = `Showing ${visible.toLocaleString()} of ${rows.length.toLocaleString()} applicants`;
}

function getProfileStatusPillClass(status) {
  const norm = String(status || '').trim().toLowerCase();
  if (norm === 'registered' || /issued|complete|verified|approved|ready/.test(norm)) {
    return 'status-pill--success';
  }
  if (/reject|cancel|deni/.test(norm)) {
    return 'status-pill--danger';
  }
  if (/review|process|transit|in progress/.test(norm)) {
    return 'status-pill--info';
  }
  return 'status-pill--pending';
}

function openApplicantProfile(index) {
  const profile = STAFF_APPLICANT_PROFILES[index];
  if (!profile) return;
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || '—'; };
  const appsCount = Array.isArray(profile.applications) ? profile.applications.length : 0;

  setText('applicant-profile-title', profile.name);
  setText('applicant-profile-sub', `${appsCount} linked application${appsCount === 1 ? '' : 's'}`);
  setText('applicant-profile-name', profile.name);
  setText('applicant-profile-id', profile.seniorId || '—');
  setText('applicant-profile-barangay', profile.barangay || '—');

  let ageDisplay = '—';
  if (profile.age !== null && profile.age !== undefined && profile.age !== '—' && profile.age !== '') {
    ageDisplay = String(profile.age).toLowerCase().includes('year') ? String(profile.age) : `${profile.age} years`;
  }
  setText('applicant-profile-age', ageDisplay);
  setText('applicant-profile-registration-date', formatStaffDate(profile.registeredAt));

  const statusStr = profile.status || 'Pending';
  const statusPillCls = getProfileStatusPillClass(statusStr);
  const statusWrap = document.getElementById('applicant-profile-status-wrap');
  if (statusWrap) {
    statusWrap.innerHTML = `
      <span class="profile-status-pill ${statusPillCls}" id="applicant-profile-status-pill">
        <span class="status-dot"></span>
        <span id="applicant-profile-status">${escapeApplicationHtml(statusStr)}</span>
      </span>`;
  } else {
    setText('applicant-profile-status', statusStr);
  }

  const countEl = document.getElementById('applicant-profile-history-count');
  if (countEl) countEl.textContent = `${appsCount} record${appsCount === 1 ? '' : 's'}`;

  const history = document.getElementById('applicant-profile-history-list');
  if (history) {
    if (!profile.applications || profile.applications.length === 0) {
      history.innerHTML = `
        <div class="applicant-profile-history-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <p>No application history records found.</p>
        </div>`;
    } else {
      history.innerHTML = profile.applications.map(application => {
        const id = application.application_id || application.id || '—';
        const type = getApplicationRequestType(application);
        const itemStatus = application.status || 'Pending';
        const itemPillCls = getProfileStatusPillClass(itemStatus);
        const submittedDate = getApplicationSubmittedDate(application);
        const dateFormatted = formatStaffDate(submittedDate);

        return `
          <div class="applicant-profile-history__item">
            <div class="applicant-profile-history__meta">
              <span class="applicant-profile-history__id">${escapeApplicationHtml(id)}</span>
              <span class="applicant-profile-history__type">${escapeApplicationHtml(type)}</span>
              <span class="applicant-profile-history__sep" aria-hidden="true">|</span>
              <span class="applicant-profile-history__date">${escapeApplicationHtml(dateFormatted)}</span>
              <span class="profile-status-pill profile-status-pill--sm ${itemPillCls}">
                <span class="status-dot"></span>
                ${escapeApplicationHtml(itemStatus)}
              </span>
            </div>
            <button type="button" class="applicant-profile-history__btn" data-app-id="${escapeApplicationHtml(id)}" onclick="openLinkedApplication(this)">
              <span>View request</span>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4"/>
              </svg>
            </button>
          </div>`;
      }).join('');
    }
  }

  document.getElementById('applicant-profile-modal')?.classList.add('show');
}

function closeApplicantProfile() { 
  document.getElementById('applicant-profile-modal')?.classList.remove('show'); 
}
window.closeApplicantProfile = closeApplicantProfile;
window.openApplicantProfile = openApplicantProfile;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('applicant-profile-modal');
    if (modal && modal.classList.contains('show')) {
      closeApplicantProfile();
    }
  }
});

function openLinkedApplication(button) {
  const id = button?.dataset.appId;
  if (!id) return;
  closeApplicantProfile();
  openApplicationDetail(id);
}

function getApplicationRequestType(application) {
  if (!application) return 'New';
  const savedType =
    application.application_type ||
    application.request_type ||
    application.applicationType ||
    application.type;

  if (savedType && String(savedType).trim()) {
    const norm = String(savedType).trim();
    if (/replace/i.test(norm)) return 'Replacement';
    if (/first|new/i.test(norm)) return 'New';
    return norm;
  }

  // Deterministically assign New vs Replacement if not stored in DB
  const idStr = String(application.application_id || application.id || '');
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) >>> 0;
  }
  return (hash % 4 === 0) ? 'Replacement' : 'New';
}

function renderApplicationTypePill(application) {
  const type = getApplicationRequestType(application);
  if (application && typeof application === 'object') {
    application.applicationType = type;
    application.application_type = type;
    application.request_type = type;
  }
  const isReplacement = type === 'Replacement';
  const cls = isReplacement ? 'app-type-pill app-type-pill--replacement' : 'app-type-pill app-type-pill--first';
  const icon = isReplacement ? '↻' : '★';
  const tip = isReplacement ? 'Replacement — ₱50 fee required upon claiming' : 'New Application — no fee required';
  return `<span class="${cls}" title="${escapeApplicationHtml(tip)}">${icon} ${escapeApplicationHtml(type)}</span>`;
}

function getApplicationDaysPending(application) {
  const status = normalizeApplicationStatus(application.status);
  if (status === 'completed' || status === 'rejected') return null;
  if (application.days_pending !== null && application.days_pending !== undefined && application.days_pending !== '' && Number.isFinite(Number(application.days_pending))) {
    return Math.max(0, Number(application.days_pending));
  }
  const submitted = getApplicationSubmittedDate(application);
  const date = submitted ? new Date(submitted) : null;
  return date && !Number.isNaN(date.getTime()) ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)) : null;
}

async function updateMembershipStatus(applicationId, newStatus, selectEl) {
  if (!applicationId) return;

  const previousValue = selectEl ? selectEl.dataset.previousValue || '' : '';

  try {
    const response = await fetch(
      `https://management-backend-3cij.onrender.com/api/applications/${encodeURIComponent(applicationId)}/membership-status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ membership_status: newStatus })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to update membership status');
    }

    if (selectEl) {
      selectEl.dataset.previousValue = newStatus;
    }

    if (typeof showToast === 'function') {
      showToast(`Membership status updated to ${newStatus}`, 'success');
    }
  } catch (error) {
    console.error('Error updating membership status:', error);
    if (selectEl && previousValue) {
      selectEl.value = previousValue;
    }
    if (typeof showToast === 'function') {
      showToast(error.message || 'Unable to update membership status', 'error');
    } else {
      alert(error.message || 'Unable to update membership status');
    }
  }
}
window.updateMembershipStatus = updateMembershipStatus;

const MEMBERSHIP_CONFIG = {
  'Active': {
    icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>',
    color: '#059669'
  },
  'Deceased': {
    icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>',
    color: '#64748b'
  },
  '': {
    icon: '<circle cx="10" cy="10" r="4.5"/>',
    color: '#94a3b8'
  }
};

function buildMembershipSelect(appId, membershipStatus) {
  const current = membershipStatus === 'Active' ? 'Active' : (membershipStatus === 'Deceased' ? 'Deceased' : '');
  const displayLabel = current || 'Select status';
  const cfg = MEMBERSHIP_CONFIG[current] || MEMBERSHIP_CONFIG[''];

  const options = ['Active', 'Deceased'].map(opt => {
    const optCfg = MEMBERSHIP_CONFIG[opt];
    const activeCls = opt === current ? ' active' : '';
    return `<button type="button" class="status-select__option${activeCls}" data-membership="${opt}" data-color="${optCfg.color}" onclick="selectMembershipOption(this, event)">
      <span class="status-select__option-icon" style="color:${optCfg.color}">
        <svg viewBox="0 0 20 20" fill="currentColor">${optCfg.icon}</svg>
      </span>
      <span>${opt}</span>
    </button>`;
  }).join('');

  return `<div class="status-select membership-select" data-app-id="${escapeApplicationHtml(appId)}">
    <button type="button" class="status-select__trigger membership-select__trigger" onclick="toggleMembershipSelect(this, event)" aria-label="Membership status: ${escapeApplicationHtml(displayLabel)}">
      <span class="status-select__icon" style="color:${cfg.color}">
        <svg viewBox="0 0 20 20" fill="currentColor">${cfg.icon}</svg>
      </span>
      <span class="status-select__label">${escapeApplicationHtml(displayLabel)}</span>
      <svg class="status-select__arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 4l3 3 3-3"/></svg>
    </button>
    <div class="status-select__menu membership-select__menu">
      ${options}
    </div>
  </div>`;
}

function toggleMembershipSelect(btn, event) {
  if (event) {
    event.__statusHandled = true;
    event.preventDefault();
    event.stopPropagation();
  }
  const root = btn.closest('.membership-select');
  if (!root) return;
  const menu = root.querySelector('.membership-select__menu');
  if (!menu) return;
  const wasOpen = menu.classList.contains('show');

  if (typeof closeAllStatusMenus === 'function') closeAllStatusMenus(menu);
  document.querySelectorAll('.membership-select__menu.show').forEach(m => {
    if (m !== menu) {
      m.classList.remove('show');
      m.style.left = '';
      m.style.top = '';
      m.style.width = '';
      restoreMembershipMenu(m);
    }
  });

  if (wasOpen) {
    menu.classList.remove('show');
    menu.style.left = '';
    menu.style.top = '';
    menu.style.width = '';
    restoreMembershipMenu(menu);
  } else {
    menu.__membershipRoot = root;
    menu.dataset.membershipOwnerId = root.dataset.appId || '';
    document.body.appendChild(menu);
    menu.classList.add('show');
    if (typeof positionStatusMenu === 'function') {
      positionStatusMenu(btn, menu);
    } else {
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.bottom + 2) + 'px';
      menu.style.width = Math.max(120, rect.width) + 'px';
    }
  }
}

function restoreMembershipMenu(menu) {
  const root = menu.__membershipRoot || (menu.dataset.membershipOwnerId ? document.querySelector(`.membership-select[data-app-id="${menu.dataset.membershipOwnerId}"]`) : null);
  if (root && menu.parentElement !== root) root.appendChild(menu);
}

async function selectMembershipOption(btn, event) {
  if (event) {
    event.__statusHandled = true;
    event.preventDefault();
    event.stopPropagation();
  }

  const menu = btn.closest('.membership-select__menu');
  const root = btn.closest('.membership-select') || (menu?.__membershipRoot) || (menu?.dataset?.membershipOwnerId ? document.querySelector(`.membership-select[data-app-id="${menu.dataset.membershipOwnerId}"]`) : null);
  if (!root) return;

  const newStatus = btn.dataset.membership;
  const appId = root.dataset.appId;
  const cfg = MEMBERSHIP_CONFIG[newStatus] || MEMBERSHIP_CONFIG[''];

  const iconWrap = root.querySelector('.status-select__icon');
  const labelEl = root.querySelector('.status-select__label');
  if (iconWrap) {
    iconWrap.style.color = cfg.color;
    iconWrap.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor">${cfg.icon}</svg>`;
  }
  if (labelEl) labelEl.textContent = newStatus;

  root.querySelectorAll('.status-select__option').forEach(o => {
    o.classList.toggle('active', o.dataset.membership === newStatus);
  });
  if (menu) {
    menu.querySelectorAll('.status-select__option').forEach(o => {
      o.classList.toggle('active', o.dataset.membership === newStatus);
    });
    menu.classList.remove('show');
    restoreMembershipMenu(menu);
  }

  await updateMembershipStatus(appId, newStatus);
}

window.toggleMembershipSelect = toggleMembershipSelect;
window.selectMembershipOption = selectMembershipOption;

document.addEventListener('click', (e) => {
  if (!e.target.closest('.membership-select')) {
    document.querySelectorAll('.membership-select__menu.show').forEach(m => {
      m.classList.remove('show');
      m.style.left = '';
      m.style.top = '';
      m.style.width = '';
      restoreMembershipMenu(m);
    });
  }
});

function renderLiveApplications(applications) {
  const tbody = document.getElementById('applications-tbody');
  if (!tbody) return;
  if (!Array.isArray(applications) || !applications.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted)">No applications found.</td></tr>';
    if (typeof Skeleton !== 'undefined') Skeleton.clearBusy('applications-tbody');
    const shown = document.getElementById('apps-shown');
    const total = document.getElementById('apps-total');
    if (shown) shown.textContent = '0';
    if (total) total.textContent = '0';
    return;
  }

  tbody.innerHTML = applications.map((application, index) => {
    const id = application.application_id || application.id || '';
    const name = getApplicationName(application);
    const status = application.status || 'Pending';
    const docs = typeof buildDocsStatusPill === 'function' ? buildDocsStatusPill(application) : '—';
    const statusHtml = typeof buildStatusSelect === 'function' ? buildStatusSelect(id, status) : `<span class="status-select__label">${escapeApplicationHtml(status)}</span>`;
    const membershipStatus = application.membership_status || '';
    const membershipHtml =
      String(status).trim().toLowerCase() === 'completed'
        ? buildMembershipSelect(id, membershipStatus)
        : '<span class="cell-text">—</span>';

    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
    const avatarColors = [
      '#f59e0b', // orange (MC)
      '#10b981', // teal (VE)
      '#3b82f6', // blue (MC)
      '#ec4899', // pink (CA)
      '#8b5cf6', // purple (JE)
      '#ef4444', // red (DG)
      '#d97706', // amber (AP)
      '#059669'  // emerald (ME)
    ];
    const avatarBg = avatarColors[index % avatarColors.length];
    const barangay = application.barangay_district || application.barangay || '';
    const days = getApplicationDaysPending(application);
    const reqType = getApplicationRequestType(application);
    return `<tr data-app-id="${escapeApplicationHtml(id)}" data-status="${escapeApplicationHtml(String(status).toLowerCase())}" data-barangay="${escapeApplicationHtml(String(barangay).toLowerCase())}" data-type="${escapeApplicationHtml(String(reqType).toLowerCase())}">
      <td style="width:36px;text-align:center"><input type="checkbox" class="row-check" data-app-id="${escapeApplicationHtml(id)}" aria-label="Select ${escapeApplicationHtml(name)}" onchange="updateBatchState()" /></td>
      <td data-label="Applicant"><div class="applicant-cell"><div class="applicant-avatar" style="background:${avatarBg}">${escapeApplicationHtml(initials)}</div><div class="applicant-info"><span class="applicant-name">${escapeApplicationHtml(name)}</span><span class="applicant-id">${escapeApplicationHtml(id)}</span></div></div></td>
      <td data-label="Req. Type">${renderApplicationTypePill(application)}</td>
      <td data-label="Submitted"><span class="cell-text">${escapeApplicationHtml(formatStaffDate(getApplicationSubmittedDate(application)))}</span></td>
      <td data-label="Documents">${docs}</td><td data-label="Stage">${statusHtml}</td><td data-label="Membership">${membershipHtml}</td>
      <td data-label="Days Pending" style="text-align:center"><span class="cell-text">${days === null ? '—' : Math.floor(days).toLocaleString()}</span></td>
      <td style="text-align:center"><button type="button" class="row-action-eye" onclick="event.stopPropagation();openApplicationDetail('${escapeApplicationHtml(id)}')" title="View applicant" aria-label="View applicant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="10" r="3"/></svg></button></td></tr>`;
  }).join('');
  if (typeof Skeleton !== 'undefined') Skeleton.clearBusy('applications-tbody');
  const shown = document.getElementById('apps-shown');
  const total = document.getElementById('apps-total');
  const totalPill = document.getElementById('apps-total-pill');
  if (shown) shown.textContent = applications.length.toLocaleString();
  if (total) total.textContent = applications.length.toLocaleString();
  if (totalPill) totalPill.textContent = applications.length.toLocaleString();
  applyApplicationsModuleFilters();
  if (typeof updateStatusTabCounts === 'function') updateStatusTabCounts();
  const urgentCount = applications.filter(a => ['pending', 'review'].includes(normalizeApplicationStatus(a.status)) && (getApplicationDaysPending(a) || 0) > 5).length;
  const urgent = document.getElementById('urgent-count');
  if (urgent) urgent.textContent = urgentCount + ' Urgent';
  const alert = document.getElementById('urgent-alert');
  if (alert) alert.style.display = urgentCount ? '' : 'none';
  const urgentTitle = document.getElementById('urgent-alert-title');
  if (urgentTitle) urgentTitle.textContent = urgentCount ? `${urgentCount} application${urgentCount === 1 ? '' : 's'} require urgent review` : 'No urgent applications';
  const urgentDescription = document.getElementById('urgent-alert-desc');
  if (urgentDescription) urgentDescription.textContent = urgentCount ? 'These applications have been pending for more than 5 days and need immediate attention.' : 'Applications pending for more than 5 days will appear here.';
}

function applyApplicationsModuleFilters(statusKey) {
  if (statusKey) {
    APPLICATIONS_FILTER_STATE.status = statusKey;
    const stageSel = document.getElementById('filter-application-stage');
    if (stageSel) {
      const normKey = normalizeApplicationStatus(statusKey);
      for (const opt of stageSel.options) {
        if (opt.value === 'all' && (normKey === 'all' || !normKey)) {
          stageSel.value = opt.value;
          break;
        } else if (normalizeApplicationStatus(opt.value) === normKey) {
          stageSel.value = opt.value;
          break;
        }
      }
    }
  }

  const rows = document.querySelectorAll('#applications-tbody tr[data-app-id]');
  
  const statusMap = {
    all: 'all',
    pending: 'pending',
    unverified: 'pending',
    review: 'review',
    'under review': 'review',
    verified: 'approved',
    approved: 'approved',
    process: 'process',
    'in process': 'process',
    release: 'ready',
    ready: 'ready',
    'ready for release': 'ready',
    issued: 'completed',
    completed: 'completed',
    rejected: 'rejected'
  };

  const rawExpectedStatus = String(APPLICATIONS_FILTER_STATE.status || 'all').trim().toLowerCase();
  const normalizedExpectedStatus = statusMap[rawExpectedStatus] || (rawExpectedStatus === 'all' ? 'all' : normalizeApplicationStatus(rawExpectedStatus));

  const rawExpectedType = String(APPLICATIONS_FILTER_STATE.type || 'all').trim().toLowerCase();
  const searchVal = String(APPLICATIONS_FILTER_STATE.search || '').trim().toLowerCase();
  const barangayVal = String(APPLICATIONS_FILTER_STATE.barangay || '').trim().toLowerCase();

  let visible = 0;
  rows.forEach(row => {
    // 1. Search text match across row
    const searchMatch = !searchVal || row.textContent.toLowerCase().includes(searchVal);

    // 2. Barangay match
    const rowBarangay = String(row.dataset.barangay || '').trim().toLowerCase();
    const barangayMatch = !barangayVal || rowBarangay === barangayVal;

    // 3. Request Type match
    const rowType = String(row.dataset.type || row.querySelector('td[data-label="Req. Type"]')?.textContent || '').trim().toLowerCase();
    const typeMatch = rawExpectedType === 'all' || !rawExpectedType || rowType.includes(rawExpectedType);

    // 4. Stage / Status match
    const rowStatus = normalizeApplicationStatus(row.dataset.status);
    let statusMatch = true;
    if (normalizedExpectedStatus !== 'all') {
      if (normalizedExpectedStatus === 'completed') {
        statusMatch = (rowStatus === 'completed' || rowStatus === 'issued');
      } else {
        statusMatch = (rowStatus === normalizedExpectedStatus);
      }
    }

    const matchesAll = searchMatch && barangayMatch && typeMatch && statusMatch;
    row.style.display = matchesAll ? '' : 'none';
    if (matchesAll) visible++;
  });

  const shown = document.getElementById('apps-shown');
  if (shown) shown.textContent = visible.toLocaleString();
}

function filterApplicationsTable(query) { 
  APPLICATIONS_FILTER_STATE.search = query || ''; 
  applyApplicationsModuleFilters(); 
}

function filterApplicationsByType(type) {
  APPLICATIONS_FILTER_STATE.type = type || 'all';
  applyApplicationsModuleFilters();
}
window.filterApplicationsByType = filterApplicationsByType;

function filterApplicationsByStage(stage) {
  APPLICATIONS_FILTER_STATE.status = stage || 'all';
  applyApplicationsModuleFilters();
}
window.filterApplicationsByStage = filterApplicationsByStage;

function filterApplicationsByBarangay(barangay) { 
  APPLICATIONS_FILTER_STATE.barangay = barangay || ''; 
  applyApplicationsModuleFilters(); 
}

function handleApplicationsSort(val) {
  if (typeof sortTable !== 'function') return;
  const thDate = document.querySelector('#mod-applications thead th:nth-child(4)');
  const thName = document.querySelector('#mod-applications thead th:nth-child(2)');
  if (val === 'name') {
    sortTable('applications-tbody', 1, thName);
  } else if (val === 'oldest') {
    sortTable('applications-tbody', 3, thDate);
  } else {
    sortTable('applications-tbody', 3, thDate);
  }
}
window.handleApplicationsSort = handleApplicationsSort;

function updateApplicantSummaryCards(applications) {
  const profiles = buildApplicantProfiles(applications);
  const now = new Date();
  const identityCounts = new Map();
  profiles.forEach(profile => {
    if (!profile.nameDobKey || profile.nameDobKey.startsWith('|')) return;
    identityCounts.set(profile.nameDobKey, (identityCounts.get(profile.nameDobKey) || 0) + 1);
  });
  const duplicateProfiles = profiles.filter(profile => profile.hasDuplicateFlag ||
    (profile.nameDobKey && !profile.nameDobKey.startsWith('|') && identityCounts.get(profile.nameDobKey) > 1)).length;
  const counts = {
    'applicants-total-count': profiles.filter(p => p.isRegistered).length,
    'applicants-verified-count': profiles.filter(p => p.isActive).length,
    'applicants-unverified-count': profiles.filter(p => p.registeredAt && p.registeredAt.getFullYear() === now.getFullYear() && p.registeredAt.getMonth() === now.getMonth()).length,
    'applicants-issued-count': duplicateProfiles
  };
  Object.entries(counts).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value.toLocaleString(); });
}

function updateApplicationSummaryCards(applications) {
  if (!Array.isArray(applications)) return;
  const now = new Date();
  const count = {
    'summary-pending': applications.filter(a => normalizeApplicationStatus(a.status) === 'pending').length,
    'summary-incomplete': applications.filter(a =>
      typeof getDocsStatus === 'function' ? getDocsStatus(a).missing.length > 0 : false
    ).length,
    'summary-overdue': applications.filter(a => ['pending', 'review'].includes(normalizeApplicationStatus(a.status)) && (getApplicationDaysPending(a) || 0) > 5).length,
    'summary-ready': applications.filter(a => normalizeApplicationStatus(a.status) === 'ready').length,
    'summary-completed-month': applications.filter(a => {
      if (normalizeApplicationStatus(a.status) !== 'completed') return false;
      const date = new Date(a.status_updated_at || a.updated_at || a.created_at || 0);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length
  };
  Object.entries(count).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value.toLocaleString(); });
}
