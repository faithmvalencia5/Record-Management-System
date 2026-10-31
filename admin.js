// Admin portal logic

const ADMIN_APPLICATIONS_API =
  'https://management-backend-3cij.onrender.com/api/applications';

const ADMIN_USERS_API =
  'https://management-backend-3cij.onrender.com/api/auth/users';

const ADMIN_AUDIT_API =
  'https://management-backend-3cij.onrender.com/api/audit-logs';

const ADMIN_HEALTH_API =
  'https://management-backend-3cij.onrender.com/api/test';

let ADMIN_APPLICATIONS = [];

let ADMIN_USER_ACCOUNTS = [];

let AUDIT_LOG_DATA = [];


/* =========================================================
   LIVE APPLICATION DASHBOARD
   ========================================================= */

/**
 * Update Admin Dashboard metrics using live application data.
 */
function updateAdminDashboardFromApplications(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  ADMIN_APPLICATIONS = applications;

  updateAdminApplicationAnalytics(applications);

  const total = applications.length;


  /* -----------------------------------------
     Total Registered Citizens
     ----------------------------------------- */

  const citizens =
    document.getElementById('kpi-citizens');

  if (citizens) {

    citizens.textContent =
      total.toLocaleString('en-US');

  }


  /* -----------------------------------------
     Applications Received
     ----------------------------------------- */

  const received =
    document.getElementById('metric-received');

  if (received) {

    received.textContent =
      total.toLocaleString('en-US');

  }


  /* -----------------------------------------
     Update shared analytics object
     if app.js provides it
     ----------------------------------------- */

  if (
    typeof ANALYTICS_DATA !== 'undefined' &&
    ANALYTICS_DATA.Admin
  ) {

    ANALYTICS_DATA.Admin.totalApplications =
      total;

  }


  /* -----------------------------------------
     Sync applications to shared application DB
     ----------------------------------------- */

  if (
    typeof syncApplicationsToAppDB === 'function'
  ) {

    syncApplicationsToAppDB(applications);

  }


  console.log(
    '[Admin Dashboard] Live application data applied:',
    total
  );

}


/**
 * Load applications directly from the backend.
 */
async function loadAdminDashboardData() {

  // Skeleton: shimmer the KPI values while we wait
  if (typeof Skeleton !== 'undefined') {
    Skeleton.setLoading(
      document.querySelectorAll('#mod-dashboard .stat-card__value, .admin-kpi-strip .stat-card__value'),
      true
    );
    Skeleton.setTable('audit-summary-tbody', 5);
  }

  try {

    console.log(
      '[Admin Dashboard] Loading applications from database...'
    );


    const response =
      await fetch(
        ADMIN_APPLICATIONS_API,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );


    console.log(
      '[Admin Dashboard] API status:',
      response.status
    );


    if (!response.ok) {

      throw new Error(
        'Applications API returned HTTP ' +
        response.status
      );

    }


    const result =
      await response.json();


    if (
      !result.success ||
      !Array.isArray(
        result.applications
      )
    ) {

      throw new Error(
        result.message ||
        'Invalid applications response.'
      );

    }


    const applications =
      result.applications;


    console.log(
      '[Admin Dashboard] Applications loaded:',
      applications.length
    );


    updateAdminDashboardFromApplications(
      applications
    );

    // Skeleton: clear KPI shimmer once data is applied
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setLoading(
        document.querySelectorAll('#mod-dashboard .stat-card__value, .admin-kpi-strip .stat-card__value'),
        false
      );
      Skeleton.clearBusy('audit-summary-tbody');
    }

    return applications;

  } catch (error) {

    // Skeleton: clear on error too
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setLoading(
        document.querySelectorAll('#mod-dashboard .stat-card__value, .admin-kpi-strip .stat-card__value'),
        false
      );
      Skeleton.clearBusy('audit-summary-tbody');
    }

    console.error(
      '[Admin Dashboard] Failed to load database data:',
      error
    );


    const citizens =
      document.getElementById(
        'kpi-citizens'
      );

    if (citizens) {

      citizens.textContent =
        '0';

    }


    const received =
      document.getElementById(
        'metric-received'
      );

    if (received) {

      received.textContent =
        '0';

    }


    const dailyActions =
      document.getElementById(
        'metric-daily-actions'
      );

    if (dailyActions) {

      dailyActions.textContent =
        '0';

    }


    if (
      typeof showToast === 'function'
    ) {

      showToast(
        'Unable to load live dashboard data.',
        'error'
      );

    }


    return [];

  }

}

function getAuthHeaders() {
  let token = null;

  try {
    const raw = window.sessionStorage.getItem('senioridAuth');

    if (raw) {
      const session = JSON.parse(raw);
      token = session.token || null;
    }
  } catch (error) {
    console.error('Unable to read authentication session:', error);
  }

  if (!token) {
    try {
      const raw = window.localStorage.getItem('senioridAuth');

      if (raw) {
        const session = JSON.parse(raw);
        token = session.token || null;
      }
    } catch (error) {
      console.error('Unable to read authentication session:', error);
    }
  }

  return {
    'Content-Type': 'application/json',
    'Authorization': token
      ? `Bearer ${token}`
      : ''
  };
}

function requireAdminSession() {
  try {
    const rawSession =
      sessionStorage.getItem('senioridAuth') ||
      localStorage.getItem('senioridAuth');

    if (!rawSession) {
      window.location.href = 'login.html';
      return false;
    }

    const session = JSON.parse(rawSession);

    if (!session.token) {
      window.location.href = 'login.html';
      return false;
    }

    if (session.role !== 'Admin') {
      alert('Administrator access required.');
      window.location.href = 'index.html';
      return false;
    }

    return true;

  } catch (error) {
    console.error(
      'Admin session validation error:',
      error
    );

    window.location.href = 'login.html';
    return false;
  }
}

/* =========================================================
   APPLICATION STATUS ANALYTICS
   ========================================================= */

const ADMIN_APPLICATION_STATUSES = [
  'Pending',
  'Under Review',
  'In Process',
  'Ready for Release',
  'Completed',
  'Rejected'
];


function getApplicationStatusCounts(
  applications
) {

  const counts = {

    'Pending': 0,

    'Under Review': 0,

    'In Process': 0,

    'Ready for Release': 0,

    'Completed': 0,

    'Rejected': 0

  };


  if (!Array.isArray(applications)) {

    return counts;

  }


  applications.forEach(
    application => {

      const status =
        application.status ||
        'Pending';


      if (
        Object.prototype.hasOwnProperty.call(
          counts,
          status
        )
      ) {

        counts[status]++;

      }

    }
  );


  return counts;

}


function getTodayApplicationActions(
  applications
) {

  if (!Array.isArray(applications)) {

    return 0;

  }


  const today =
    new Date();


  const todayYear =
    today.getFullYear();

  const todayMonth =
    today.getMonth();

  const todayDate =
    today.getDate();


  return applications.filter(
    application => {

      const timestamp =
        application.status_updated_at ||
        application.created_at;


      if (!timestamp) {

        return false;

      }


      const date =
        new Date(timestamp);


      return (
        date.getFullYear() ===
          todayYear &&
        date.getMonth() ===
          todayMonth &&
        date.getDate() ===
          todayDate
      );

    }
  ).length;

}


function updateAdminApplicationAnalytics(
  applications
) {

  const counts =
    getApplicationStatusCounts(
      applications
    );


  console.log(
    '[Admin Analytics] Status counts:',
    counts
  );


  /* -----------------------------------------
     Applications received
     ----------------------------------------- */

  const received =
    document.getElementById(
      'metric-received'
    );


  if (received) {

    received.textContent =
      applications.length.toLocaleString(
        'en-US'
      );

  }


  /* -----------------------------------------
     Total daily application actions
     ----------------------------------------- */

  const dailyActions =
    getTodayApplicationActions(
      applications
    );


  const dailyActionsEl =
    document.getElementById(
      'metric-daily-actions'
    );


  if (dailyActionsEl) {

    dailyActionsEl.textContent =
      dailyActions.toLocaleString(
        'en-US'
      );

  }


  /* -----------------------------------------
     Save counts globally
     ----------------------------------------- */

  window.ADMIN_STATUS_COUNTS =
    counts;


  /* -----------------------------------------
     Update shared analytics
     ----------------------------------------- */

  if (
    typeof ANALYTICS_DATA !==
      'undefined' &&
    ANALYTICS_DATA.Admin
  ) {

    ANALYTICS_DATA.Admin.totalApplications =
      applications.length;


    ANALYTICS_DATA.Admin.pending =
      counts['Pending'];


    ANALYTICS_DATA.Admin.underReview =
      counts['Under Review'];


    ANALYTICS_DATA.Admin.inProcess =
      counts['In Process'];


    ANALYTICS_DATA.Admin.readyForRelease =
      counts['Ready for Release'];


    ANALYTICS_DATA.Admin.completed =
      counts['Completed'];


    ANALYTICS_DATA.Admin.rejected =
      counts['Rejected'];

  }


  /* -----------------------------------------
     Optional status elements
     ----------------------------------------- */

  setOptionalMetric(
    'admin-status-pending',
    counts['Pending']
  );


  setOptionalMetric(
    'admin-status-review',
    counts['Under Review']
  );


  setOptionalMetric(
    'admin-status-process',
    counts['In Process']
  );


  setOptionalMetric(
    'admin-status-ready',
    counts['Ready for Release']
  );


  setOptionalMetric(
    'admin-status-completed',
    counts['Completed']
  );


  setOptionalMetric(
    'admin-status-rejected',
    counts['Rejected']
  );

}


function setOptionalMetric(
  elementId,
  value
) {

  const element =
    document.getElementById(
      elementId
    );


  if (!element) {

    return;

  }


  element.textContent =
    Number(value || 0)
      .toLocaleString('en-US');

}


/* =========================================================
   ADMIN USER ACCOUNTS
   ========================================================= */

/**
 * Load actual Staff / ID Maker / Admin accounts
 * from the database.
 */
async function loadAdminUsers() {

  // Skeleton: shimmer user table while loading
  if (typeof Skeleton !== 'undefined') {
    Skeleton.setTable('user-mgmt-tbody', 6);
    Skeleton.setLoading(
      document.querySelectorAll('#users-total, #users-active, #users-inactive, #users-idmaker'),
      true
    );
  }

  try {

    console.log(
      '[Admin Users] Loading user accounts...'
    );


    const response =
      await fetch(
        ADMIN_USERS_API,
        {
          method: 'GET',
          headers: getAuthHeaders(),
          cache: 'no-store'
        }
      );


    console.log(
      '[Admin Users] API status:',
      response.status
    );


    if (!response.ok) {

      throw new Error(
        'User accounts API returned HTTP ' +
        response.status
      );

    }


    const result =
      await response.json();


    if (
      !result.success ||
      !Array.isArray(
        result.users
      )
    ) {

      throw new Error(
        result.message ||
        'Invalid user accounts response.'
      );

    }


    ADMIN_USER_ACCOUNTS =
      result.users.map(
        user => ({

          key:
            String(user.id),

          id:
            user.id,

          fullName:
            user.full_name || user.username,

          username:
            user.username,

          email:
            user.email ||
            '—',

          role:
            normalizeAdminUserRole(user.role),

          status:
            user.account_status ||
            'Active',

          lastActive:
            formatLastActive(user.last_active_at)

        })
      );


    console.log(
      '[Admin Users] Loaded:',
      ADMIN_USER_ACCOUNTS.length
    );


    renderUserMgmtTable();

    updateAdminUserDashboardMetrics();

    renderAuditUserFilter();


    return ADMIN_USER_ACCOUNTS;

  } catch (error) {

    console.error(
      '[Admin Users] Failed to load accounts:',
      error
    );


    /*
     * Do not show fake users if the
     * database request fails.
     */
    ADMIN_USER_ACCOUNTS = [];


    renderUserMgmtTable();

    updateAdminUserDashboardMetrics();

    renderAuditUserFilter();


    return [];

  }

}


function normalizeAdminUserRole(role) {
  const value = String(role || 'Staff')
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, ' ');

  if (['id maker', 'osca id maker', 'idmaker', 'id card maker'].includes(value)) {
    return 'ID Maker';
  }
  if (['staff', 'osca staff'].includes(value)) {
    return 'Staff';
  }
  if (['admin', 'administrator', 'system administrator'].includes(value)) {
    return 'Admin';
  }
  return String(role || 'Staff').trim();
}


function getUserDesignation(
  role
) {

  switch (role) {

    case 'Admin':

      return 'System Administrator';


    case 'ID Maker':

      return 'ID Card Maker';


    case 'Staff':

      return 'OSCA Staff';


    default:

      return 'OSCA Personnel';

  }

}


function updateAdminUserDashboardMetrics() {

  /*
   * The Admin KPI specifically describes:
   * Staff & ID Maker accounts.
   *
   * Therefore Admin accounts are excluded.
   */
  const activeUsers =
    ADMIN_USER_ACCOUNTS.filter(
      user =>
        user.status === 'Active' &&
        (
          normalizeAdminUserRole(user.role) === 'Staff' ||
          normalizeAdminUserRole(user.role) === 'ID Maker'
        )
    ).length;


  const activeUsersEl =
    document.getElementById(
      'kpi-active-users'
    );


  if (activeUsersEl) {

    activeUsersEl.textContent =
      activeUsers.toLocaleString(
        'en-US'
      );

  }


  /*
   * User management page cards
   */

  const totalEl =
    document.getElementById(
      'users-total'
    );


  if (totalEl) {

    totalEl.textContent =
      ADMIN_USER_ACCOUNTS.length;

  }


  const activeEl =
    document.getElementById(
      'users-active'
    );


  if (activeEl) {

    activeEl.textContent =
      ADMIN_USER_ACCOUNTS.filter(
        user =>
          user.status === 'Active'
      ).length;

  }


  const inactiveEl =
    document.getElementById(
      'users-inactive'
    );


  if (inactiveEl) {

    inactiveEl.textContent =
      ADMIN_USER_ACCOUNTS.filter(
        user =>
          user.status !== 'Active'
      ).length;

  }


  const idMakerEl =
    document.getElementById(
      'users-idmaker'
    );


  if (idMakerEl) {

    idMakerEl.textContent =
      ADMIN_USER_ACCOUNTS.filter(
        user =>
          user.role === 'ID Maker'
      ).length;

  }

  // Skeleton: clear user KPI shimmer now that counts are updated
  if (typeof Skeleton !== 'undefined') {
    Skeleton.setLoading(
      document.querySelectorAll('#users-total, #users-active, #users-inactive, #users-idmaker'),
      false
    );
  }

}


/* =========================================================
   ADMIN SYSTEM HEALTH
   ========================================================= */

async function checkAdminSystemHealth() {

  const uptimeEl =
    document.getElementById(
      'kpi-uptime'
    );

  if (typeof Skeleton !== 'undefined') {
    Skeleton.setLoading(uptimeEl, true);
  }

  try {

    console.log(
      '[Admin Health] Checking backend...'
    );


    const response =
      await fetch(
        ADMIN_HEALTH_API,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );


    if (!response.ok) {

      throw new Error(
        'Health endpoint returned HTTP ' +
        response.status
      );

    }


    const result =
      await response.json();


    if (
      !result.success
    ) {

      throw new Error(
        'Backend health check failed.'
      );

    }


    if (uptimeEl) {

      uptimeEl.textContent =
        'Online';

      uptimeEl.title =
        'Backend API is operational';

    }


    console.log(
      '[Admin Health] Backend operational.'
    );


  } catch (error) {

    console.error(
      '[Admin Health] Backend unavailable:',
      error
    );


    if (uptimeEl) {

      uptimeEl.textContent =
        'Offline';

      uptimeEl.title =
        'Backend API is unavailable';

    }

  } finally {
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setLoading(uptimeEl, false);
    }
  }

}


/* =========================================================
   LIVE AUDIT LOGS
   ========================================================= */

/**
 * Convert a database audit-log record into the
 * format already expected by the Admin UI.
 */
function normalizeAuditLog(
  log
) {

  const createdAt =
    log.created_at
      ? new Date(
          log.created_at
        )
      : null;


  const formattedTime =
    createdAt &&
    !Number.isNaN(
      createdAt.getTime()
    )
      ? createdAt.toLocaleString(
          'en-US',
          {
            year:
              'numeric',

            month:
              'short',

            day:
              '2-digit',

            hour:
              '2-digit',

            minute:
              '2-digit',

            second:
              '2-digit'
          }
        )
      : '—';


  return {

    id:
      log.id,

    ts:
      formattedTime,

    user:
      log.full_name ||
      log.username ||
      'Unattributed (legacy event)',

    username:
      log.username ||
      '—',

    email:
      log.email ||
      '—',

    role:
      log.role ||
      'Unknown',

    action:
      log.action ||
      'Unknown action',

    ip:
      log.ip_address ||
      '—',

    device:
      getAuditDeviceLabel(
        log.user_agent
      ),

    userAgent:
      log.user_agent ||
      '—',

    details:
      log.details ??
      '—',

    entityType:
      log.entity_type ||
      '—',

    entityId:
      log.entity_id ||
      '—',

    createdAt:
      log.created_at ||
      null,

    _tsMs:
      createdAt &&
      !Number.isNaN(
        createdAt.getTime()
      )
        ? createdAt.getTime()
        : null

  };

}


/**
 * Convert browser user-agent text into a simple
 * readable device label for the Admin table.
 */
function getAuditDeviceLabel(
  userAgent
) {

  if (!userAgent) {

    return '—';

  }


  const ua =
    String(
      userAgent
    ).toLowerCase();


  let device =
    'Desktop';


  if (
    /iphone|ipad|ipod/.test(
      ua
    )
  ) {

    device =
      'iOS';

  } else if (
    /android/.test(
      ua
    )
  ) {

    device =
      'Android';

  } else if (
    /mobile/.test(
      ua
    )
  ) {

    device =
      'Mobile';

  }


  let browser =
    'Browser';


  if (
    ua.includes(
      'edg/'
    )
  ) {

    browser =
      'Edge';

  } else if (
    ua.includes(
      'chrome/'
    )
  ) {

    browser =
      'Chrome';

  } else if (
    ua.includes(
      'firefox/'
    )
  ) {

    browser =
      'Firefox';

  } else if (
    ua.includes(
      'safari/'
    ) &&
    !ua.includes(
      'chrome/'
    )
  ) {

    browser =
      'Safari';

  }


  return `${device} · ${browser}`;

}


/**
 * Load real audit logs from the backend.
 */
let auditLoadPromise = null;

async function loadAdminAuditLogs() {
  if (auditLoadPromise) return auditLoadPromise;

  auditLoadPromise = (async () => {
    const refreshButton = document.getElementById('refresh-audit-logs-btn');
    const originalButtonContent = refreshButton?.innerHTML;

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.innerHTML = '<i class="fi fi-rr-spinner" aria-hidden="true"></i> Refreshing…';
      refreshButton.setAttribute('aria-busy', 'true');
    }

    if (typeof Skeleton !== 'undefined') {
      Skeleton.setTable('audit-logs-tbody', 6);
      Skeleton.setTable('audit-summary-tbody', 5);
    }

    try {
      console.log('[Admin Audit] Loading complete audit history...');

      const allLogs = [];
      const pageSize = 1000;
      let offset = 0;

      // Fetch every page. Supabase limits each individual response, not the
      // complete history; continue until the API returns a short/empty page.
      while (true) {
        const response = await fetch(
          `${ADMIN_AUDIT_API}?limit=${pageSize}&offset=${offset}`,
          {
            method: 'GET',
            headers: getAuthHeaders(),
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          throw new Error('Audit logs API returned HTTP ' + response.status);
        }

        const result = await response.json();
        if (!result.success || !Array.isArray(result.logs)) {
          throw new Error(result.message || 'Invalid audit logs response.');
        }

        allLogs.push(...result.logs);
        const pagination = result.pagination || {};
        const hasMore = typeof pagination.hasMore === 'boolean'
          ? pagination.hasMore
          : result.logs.length === pageSize;

        if (!hasMore || result.logs.length === 0) break;

        offset = Number.isFinite(Number(pagination.nextOffset))
          ? Number(pagination.nextOffset)
          : offset + result.logs.length;
      }

      AUDIT_LOG_DATA = allLogs.map(normalizeAuditLog);

      console.log('[Admin Audit] Loaded complete history:', AUDIT_LOG_DATA.length, 'events');

      renderAuditUserFilter();
      renderAuditTable();
      renderAuditSummaryFromLiveData();
      updateSecurityAlertsKPI();

      if (typeof Skeleton !== 'undefined') {
        Skeleton.clearBusy('audit-logs-tbody');
        Skeleton.clearBusy('audit-summary-tbody');
      }

      return AUDIT_LOG_DATA;
    } catch (error) {
      console.error('[Admin Audit] Failed to load audit logs:', error);
      showToast(error.message || 'Unable to refresh audit logs.', 'error');

      // Keep the last successfully loaded records visible if a refresh fails.
      renderAuditUserFilter();
      renderAuditTable();
      renderAuditSummaryFromLiveData();
      updateSecurityAlertsKPI();

      if (typeof Skeleton !== 'undefined') {
        Skeleton.clearBusy('audit-logs-tbody');
        Skeleton.clearBusy('audit-summary-tbody');
      }

      return AUDIT_LOG_DATA;
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.innerHTML = originalButtonContent || '<i class="fi fi-rr-refresh" aria-hidden="true"></i> Refresh';
        refreshButton.removeAttribute('aria-busy');
      }
      auditLoadPromise = null;
    }
  })();

  return auditLoadPromise;
}

async function refreshAuditLogs() {
  await loadAdminAuditLogs();
}

/**
 * Security & Audit Alerts KPI.
 *
 * Counts security-sensitive actions from the
 * actual database audit trail.
 */
function updateSecurityAlertsKPI() {

  const element =
    document.getElementById(
      'kpi-security-alerts'
    );


  if (!element) {

    return;

  }


  const securityActions =
    AUDIT_LOG_DATA.filter(
      log =>
        [
          'LOGIN_FAILED',
          'PASSWORD_RESET',
          'USER_DEACTIVATED'
        ].includes(
          String(
            log.action ||
            ''
          ).toUpperCase()
        )
    );


  element.textContent =
    securityActions.length.toLocaleString(
      'en-US'
    );


  element.title =
    'Security-sensitive audit events recorded in the system';

}


/**
 * Render the dashboard Audit Summary using
 * live audit records.
 *
 * This preserves the existing summary filter.
 */
function renderAuditSummaryFromLiveData() {

  const tbody =
    document.getElementById(
      'audit-summary-tbody'
    );


  if (!tbody) {

    return;

  }


  /*
   * Show the most recent audit events.
   */
  const rows =
    AUDIT_LOG_DATA
      .slice(
        0,
        20
      );


  if (!rows.length) {

    tbody.innerHTML =
      '<tr>' +
      '<td colspan="3" class="table-empty">' +
      '<i class="fi fi-rr-shield-check"></i> ' +
      'No audit activity recorded yet.' +
      '</td>' +
      '</tr>';


    return;

  }


  tbody.innerHTML =
    rows
      .map(
        log => {

          const actionType =
            determineAuditActionType(
              log.action
            );


          const createdAt = log.createdAt instanceof Date
            ? log.createdAt.getTime()
            : new Date(log.createdAt || '').getTime();


          return `

            <tr
              data-created-at="${Number.isFinite(createdAt) ? createdAt : ''}"
            >

              <td data-label="Time">

                <span class="cell-text">
                  ${escHtml(log.ts)}
                </span>

              </td>


              <td data-label="User">

                <span class="cell-text">
                  ${escHtml(log.user)}
                </span>

              </td>


              <td data-label="Action">

                <span class="cell-text">
                  ${escHtml(log.action)}
                </span>

              </td>

            </tr>

          `;

        }
      )
      .join('');


  /*
   * Reapply the currently selected summary range.
   */
  filterAuditLog(
    readAuditSummaryRange(),
    {
      instant: true
    }
  );

}


/* =========================================================
   ADMIN PAGE INITIALIZATION
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    // Close the date-range popover whenever the user clicks anywhere
    // outside the filter control, matching the behavior of other popovers.
    const auditDateRange = document.getElementById('audit-date-range');
    if (auditDateRange) {
      document.addEventListener('click', event => {
        if (
          auditDateRange.open &&
          !auditDateRange.contains(event.target)
        ) {
          auditDateRange.open = false;
        }
      });
    }

    if (requireAdminSession()) {
      loadAdminDashboardData();
      loadSystemBackups();
      loadAdminUsers();
      loadAdminAuditLogs();
      checkAdminSystemHealth();
    }

    filterAuditLog(
      readAuditSummaryRange(),
      {
        instant: true
      }
    );


    /*
     * Render only modules that are present on this admin page.
     * Backup history is rendered by loadSystemBackups() after the
     * protected API request completes.
     */
    setTimeout(() => {
      if (typeof renderUserMgmtTable === 'function') renderUserMgmtTable();
      if (typeof renderAuditTable === 'function') renderAuditTable();
      if (typeof renderBackupHistory === 'function') renderBackupHistory();
      if (typeof renderRestorePoints === 'function') renderRestorePoints();
    }, 100);


    /*
     * Confirmation modal.
     */
    const confirmModalEl =
      document.getElementById(
        'confirm-modal'
      );


    if (confirmModalEl) {

      confirmModalEl.addEventListener(
        'click',
        e => {

          if (
            e.target.id ===
            'confirm-modal'
          ) {

            closeConfirmModal();

          }

        }
      );

    }


    document.addEventListener(
      'keydown',
      e => {

        if (
          e.key === 'Escape'
        ) {

          closeConfirmModal();

        }

      }
    );

  }
);


/* =========================================================
   CONFIRMATION MODAL
   ========================================================= */

let confirmModalHandler = null;


function openConfirmModal(
  opts = {}
) {

  const modal =
    document.getElementById(
      'confirm-modal'
    );


  if (!modal) {

    return;

  }


  const setText =
    (
      id,
      text
    ) => {

      const el =
        document.getElementById(
          id
        );


      if (el) {

        el.textContent =
          text || '';

      }

    };


  setText(
    'cf-modal-title',
    opts.title ||
      'Confirm action'
  );


  setText(
    'cf-modal-desc',
    opts.desc ||
      ''
  );


  setText(
    'cf-modal-alert-title',
    opts.alertTitle ||
      ''
  );


  setText(
    'cf-modal-alert-desc',
    opts.alertDesc ||
      ''
  );


  const btn =
    document.getElementById(
      'cf-modal-confirm'
    );


  if (btn) {

    btn.textContent =
      opts.confirmLabel ||
      'Confirm';


    const danger =
      opts.danger !== false;


    btn.classList.toggle(
      'btn--danger',
      danger
    );


    btn.classList.toggle(
      'btn--primary',
      !danger
    );

  }


  confirmModalHandler =
    typeof opts.onConfirm ===
      'function'
        ? opts.onConfirm
        : null;


  modal.classList.add(
    'show'
  );

}


function closeConfirmModal() {

  document
    .getElementById(
      'confirm-modal'
    )
    ?.classList.remove(
      'show'
    );


  confirmModalHandler =
    null;

}


function runConfirmAction() {

  const handler =
    confirmModalHandler;


  closeConfirmModal();


  if (handler) {

    handler();

  }

}


/* =========================================================
   QUICK ACTION BAR
   ========================================================= */

function quickAddUser() {

  openUserModal(
    'new'
  );

}


function quickBackup() {

  executeBackup();

}


function quickExportSecurityLogs() {

  exportAuditReport();

}


function inviteUser() {

  showToast(
    'User invitation sent! (demo)',
    'success'
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Invited new user',
    'Admin'
  );

}


function sendDemoNotification() {

  showToast(
    'Test SMS sent to applicant (demo)',
    'success'
  );


  addNotifyLog(
    '—',
    'Gateway test notification',
    'SMS',
    'Delivered'
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Tested SMS/Email gateway',
    'Admin'
  );

}


function updateUserRole(
  key,
  newRole
) {

  if (
    typeof DEMO_USERS === 'undefined' ||
    !DEMO_USERS[key]
  ) {

    return;

  }


  DEMO_USERS[key].role =
    newRole;


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    `Changed ${DEMO_USERS[key].displayName} role to ${newRole}`,
    'Admin'
  );


  showToast(
    `Role updated: ${DEMO_USERS[key].displayName} → ${newRole}`,
    'success'
  );

}


function runSystemBackup() {

  showToast(
    'Manual encrypted backup started. You can keep working while it runs.',
    'info'
  );


  setTimeout(
    () => {

      showToast(
        'Backup completed successfully. Restore point verified.',
        'success'
      );

    },
    900
  );

}


/* =========================================================
   MODULE B — USER MANAGEMENT
   ========================================================= */

let editingUserKey =
  null;


function roleColorMap(
  role
) {

  const colors = {

    Admin:
      'linear-gradient(135deg,#E0E9FF,#93B4FF)',

    Staff:
      'linear-gradient(135deg,#FDE68A,#D97706)',

    'ID Maker':
      'linear-gradient(135deg,#C4B5FD,#7140D8)'

  };


  return (
    colors[role] ||
    colors.Staff
  );

}


function renderUserMgmtTable() {

  const tbody =
    document.getElementById(
      'user-mgmt-tbody'
    );

  if (tbody) {
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setTable(tbody, 6);
    } else {
      startLoading(tbody);
    }
  }

  if (!tbody) {

    return;

  }


  const q =
    (
      document.getElementById(
        'user-search'
      )?.value ||
      ''
    ).toLowerCase();


  const roleF =
    document.getElementById(
      'user-role-filter'
    )?.value ||
    '';


  const statusF =
    document.getElementById(
      'user-status-filter'
    )?.value ||
    '';


  const normalizeAccountRole = value => {
    const role = String(value || '').trim().toLowerCase();
    if (role === 'admin' || role === 'administrator') return 'Admin';
    if (role === 'id maker' || role === 'idmaker' || role === 'osca id maker') return 'ID Maker';
    if (role === 'staff' || role === 'osca staff') return 'Staff';
    return String(value || '').trim();
  };

  const normalizeAccountStatus = value => {
    const status = String(value || '').trim().toLowerCase();
    return status === 'inactive' || status === 'disabled' ? 'Inactive' : 'Active';
  };

  const filtered = ADMIN_USER_ACCOUNTS.filter(u => {
    const searchable = [
      u.fullName, u.username, u.email, u.role, u.status
    ].join(' ').toLowerCase();

    const matchQ = !q || searchable.includes(q);
    const matchRole = !roleF || normalizeAccountRole(u.role) === normalizeAccountRole(roleF);
    const matchStatus = !statusF || normalizeAccountStatus(u.status) === normalizeAccountStatus(statusF);

    return matchQ && matchRole && matchStatus;
  });


  tbody.innerHTML =
    '';

  // Skeleton: clear once we start filling real data
  if (typeof Skeleton !== 'undefined') Skeleton.clearBusy(tbody);


  if (!filtered.length) {

    tbody.innerHTML =
      '<tr>' +
      '<td colspan="7" class="table-empty">' +
      '<i class="fi fi-rr-users"></i> ' +
      'No user accounts yet. They will appear here once connected to the live system.' +
      '</td>' +
      '</tr>';

  }


  filtered.forEach(
    u => {

      const initials =
        u.fullName
          .split(' ')
          .map(
            w => w[0]
          )
          .join('')
          .slice(0, 2)
          .toUpperCase();


      const isActive =
        u.status === 'Active';


      const tr =
        document.createElement(
          'tr'
        );


      tr.innerHTML = `

        <td data-label="User">

          <div class="applicant-cell">

            <div
              class="applicant-avatar"
              style="background:${roleColorMap(u.role)}"
            >
              ${initials}
            </div>

            <div class="applicant-info">

              <span
                class="applicant-name"
                title="${escHtml(u.fullName)}"
              >
                ${escHtml(u.fullName)}
              </span>

              <span
                class="applicant-id"
                title="${escHtml(u.email)}"
              >
                ${escHtml(u.email)}
              </span>

            </div>

          </div>

        </td>


        <td data-label="Username">

          <span
            class="cell-text"
            title="${escHtml(u.username)}"
          >
            ${escHtml(u.username)}
          </span>

        </td>


        <td data-label="Role">

          <span class="badge ${
            u.role === 'Admin'
              ? 'badge-issued'
              : u.role === 'Staff'
                ? 'badge-active'
                : 'badge-review'
          }">

            ${escHtml(u.role)}

          </span>

        </td>


        <td data-label="Status">

          <span
            class="badge status-pill ${
              u.status === 'Active'
                ? 'badge-active'
                : 'badge-inactive'
            }"
          >

            <span
              class="status-dot ${
                isActive
                  ? 'dot-active'
                  : 'dot-inactive'
              }"
            ></span>

            ${escHtml(u.status)}

          </span>

        </td>


        <td data-label="Last Active">

          <span
            class="cell-text"
            title="${escHtml(u.lastActive)}"
          >
            ${escHtml(u.lastActive)}
          </span>

        </td>


        <td
          style="text-align:right;white-space:nowrap"
        >

          <div class="row-actions">

            <button
              class="icon-btn"
              title="Edit Account"
              aria-label="Edit Account"
              onclick="editUser('${escHtml(u.key)}')"
            >

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>

            </button>





            <button
              class="icon-btn ${
                isActive
                  ? 'danger'
                  : 'success'
              }"
              title="${
                isActive
                  ? 'Disable Account'
                  : 'Enable Account'
              }"
              aria-label="${
                isActive
                  ? 'Disable'
                  : 'Enable'
              } Account"
              onclick="toggleMgmtUserStatus('${escHtml(u.key)}')"
            >

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                <line x1="12" y1="2" x2="12" y2="12"/>
              </svg>

            </button>

          </div>

        </td>

      `;


      tbody.appendChild(
        tr
      );

    }
  );


  const footer =
    document.getElementById(
      'user-mgmt-footer'
    );


  if (footer) {

    footer.textContent =
      `Showing ${filtered.length} of ${ADMIN_USER_ACCOUNTS.length} accounts`;

  }


  updateAdminUserDashboardMetrics();

}


function filterUsers() {

  renderUserMgmtTable();

}


function openUserModal(
  mode,
  key
) {

  editingUserKey =
    mode === 'edit'
      ? key
      : null;


  const title =
    document.getElementById(
      'user-modal-title'
    );


  const sub =
    document.getElementById(
      'user-modal-sub'
    );


  if (title) {

    title.textContent =
      editingUserKey
        ? 'Edit User'
        : 'Add New User';

  }


  if (sub) {

    sub.textContent =
      editingUserKey
        ? 'Update OSCA personnel account'
        : 'Register OSCA personnel';

  }

  // Initial passwords are set only when creating a new account.
  const passwordGroup = document.getElementById('um-password-group');
  if (passwordGroup) {
    passwordGroup.style.display = editingUserKey ? 'none' : '';
  }


  if (editingUserKey) {

    const u =
      ADMIN_USER_ACCOUNTS.find(
        x =>
          x.key ===
          key
      );


    if (u) {

      const fullname =
        document.getElementById(
          'um-fullname'
        );

      if (fullname) {

        fullname.value =
          u.fullName;

      }


      const username =
        document.getElementById(
          'um-username'
        );

      if (username) {

        username.value =
          u.username;

      }


      const email =
        document.getElementById(
          'um-email'
        );

      if (email) {

        email.value =
          u.email;

      }


      const role =
        document.getElementById(
          'um-role'
        );

      if (role) {

        role.value =
          u.role;

      }


      const status =
        document.getElementById(
          'um-status'
        );

      if (status) {

        status.value =
          u.status;

      }


      const password =
        document.getElementById(
          'um-password'
        );

      if (password) {

        password.value = '';
        password.type = 'password';
        const toggle = document.querySelector('#um-password-group .admin-password-toggle');
        if (toggle) {
          const icon = toggle.querySelector('i');
          if (icon) icon.className = 'fi fi-rr-eye';
          toggle.setAttribute('aria-label', 'Show password');
          toggle.title = 'Show password';
        }

      }

    }

  } else {

    [
      'um-fullname',
      'um-username',
      'um-email',
      'um-password'
    ].forEach(
      id => {

        const el =
          document.getElementById(
            id
          );


        if (el) {

          el.value =
            '';

        }

      }
    );


    const role =
      document.getElementById(
        'um-role'
      );


    if (role) {

      role.value =
        'Staff';

    }


    const status =
      document.getElementById(
        'um-status'
      );


    if (status) {

      status.value =
        'Active';

    }

  }


  updateRolePermHint();


  document
    .getElementById(
      'user-modal'
    )
    ?.classList.add(
      'show'
    );

}


function closeUserModal() {

  document
    .getElementById(
      'user-modal'
    )
    ?.classList.remove(
      'show'
    );

}


function updateRolePermHint() {

  const role =
    document.getElementById(
      'um-role'
    )?.value ||
    'Staff';


  const textEl =
    document.getElementById(
      'role-perm-hint-text'
    );


  if (!textEl) {

    return;

  }


  if (
    role === 'ID Maker'
  ) {

    textEl.textContent =
      'OSCA ID Maker accounts are locked to printing functionalities (print queue, status updates, and card production only). No application review or export access.';

  } else if (
    role === 'Admin'
  ) {

    textEl.textContent =
      'Admin accounts receive full access: user management, audit logs, system configuration, backups, and all review capabilities.';

  } else {

    textEl.textContent =
      'OSCA Staff accounts receive application review access (approve/reject/export), applicant management, and ID issuance.';

  }

}


function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const shouldShow = input.type === 'password';
  input.type = shouldShow ? 'text' : 'password';

  const icon = button.querySelector('i');
  if (icon) {
    icon.className = shouldShow ? 'fi fi-rr-eye-crossed' : 'fi fi-rr-eye';
  }

  button.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
  button.title = shouldShow ? 'Hide password' : 'Show password';
}

function formatLastActive(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isStrongPassword(
  password
) {

  const value =
    String(
      password || ''
    );


  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );

}


function validatePasswordField(
  inputId,
  errorId =
    'um-password-error'
) {

  const input =
    document.getElementById(
      inputId
    );


  const error =
    document.getElementById(
      errorId
    );


  if (!input) {

    return false;

  }


  const password =
    input.value ||
    '';


  if (
    !isStrongPassword(
      password
    )
  ) {

    if (error) {

      error.textContent =
        'Password must be at least 8 characters and include at least one capital letter, one number, and one special character.';


      error.style.display =
        'block';

    }


    input.setCustomValidity(
      'Password must be at least 8 characters and include at least one capital letter, one number, and one special character.'
    );


    return false;

  }


  if (error) {

    error.textContent =
      '';


    error.style.display =
      'none';

  }


  input.setCustomValidity(
    ''
  );


  return true;

}


async function saveUser() {

  const fullName =
    document.getElementById(
      'um-fullname'
    ).value.trim();

  const username =
    document.getElementById(
      'um-username'
    ).value.trim();

  const email =
    document.getElementById(
      'um-email'
    ).value.trim();

  const password =
    editingUserKey
      ? ''
      : (document.getElementById('um-password')?.value || '');

  const role =
    document.getElementById(
      'um-role'
    ).value;

  const status =
    document.getElementById(
      'um-status'
    ).value;


  if (!fullName || !username) {

    showToast(
      'Full Name and Username are required.',
      'error'
    );

    return;

  }

  if (
    !editingUserKey &&
    password &&
    !isStrongPassword(password)
  ) {
    showToast(
      'Password must be at least 8 characters and include a capital letter, a number, and a special character.',
      'error'
    );
    document.getElementById('um-password')?.focus();
    return;
  }

  if (
    !editingUserKey &&
    !password
  ) {

    showToast(
      'A strong password is required for new accounts.',
      'error'
    );

    document
      .getElementById(
        'um-password'
      )
      ?.focus();

    return;

  }



  try {

    let response;


    /* =====================================================
       EDIT EXISTING USER
       ===================================================== */

    if (editingUserKey) {

      const user =
        ADMIN_USER_ACCOUNTS.find(
          u =>
            u.key ===
            editingUserKey
        );


      if (!user) {

        showToast(
          'User account could not be found.',
          'error'
        );

        return;

      }


      const body = {
        full_name: fullName,
        username,
        email,
        role,
        account_status: status
      };


      response =
        await fetch(
          `${ADMIN_USERS_API}/${encodeURIComponent(user.id)}`,
          {
            method:
              'PUT',

            headers: getAuthHeaders(),

            body:
              JSON.stringify(
                body
              )
          }
        );


    /* =====================================================
       CREATE NEW USER
       ===================================================== */

    } else {

      response =
        await fetch(
          ADMIN_USERS_API,
          {
            method:
              'POST',

            headers: getAuthHeaders(),

            body:
              JSON.stringify({
                full_name: fullName,
                        username,
                password,
                email,
                role,
                account_status: status
              })
          }
        );

    }


    const result =
      await response.json();


    if (
      !response.ok ||
      !result.success
    ) {

      throw new Error(
        result.message ||
        'Unable to save user account.'
      );

    }


    /* =====================================================
       SUCCESS
       ===================================================== */

    appendAudit(
      CURRENT_USER?.displayName ||
        'Admin',

      editingUserKey
        ? `Updated user: ${fullName} (role → ${role})`
        : `Created user: ${fullName} (${role})`,

      'Admin'
    );


    showToast(
      editingUserKey
        ? `User ${fullName} updated successfully.`
        : `User ${fullName} created successfully.`,

      'success'
    );


    closeUserModal();


    /*
     * Reload directly from database
     * instead of modifying the local array.
     */
    await loadAdminUsers();


    /*
     * Reload audit records because the backend
     * should have created a corresponding event.
     */
    await loadAdminAuditLogs();


  } catch (error) {

    console.error(
      '[Admin Users] Save failed:',
      error
    );


    showToast(
      error.message ||
        'Unable to save user account.',
      'error'
    );

  }

}


/*
 * Edit existing user.
 */
function editUser(
  key
) {

  openUserModal(
    'edit',
    key
  );

}


async function toggleMgmtUserStatus(
  key
) {

  const user =
    ADMIN_USER_ACCOUNTS.find(
      u =>
        u.key ===
        key
    );


  if (!user) {

    return;

  }


  const newStatus =
    user.status === 'Active'
      ? 'Inactive'
      : 'Active';


  const actionText =
    newStatus === 'Inactive'
      ? 'disable'
      : 'enable';


  openConfirmModal({

    title:
      `${newStatus === 'Inactive' ? 'Disable' : 'Enable'} this account?`,

    desc:
      `${user.fullName} will be marked as ${newStatus}.`,

    alertTitle:
      newStatus === 'Inactive'
        ? 'The user will no longer be able to log in.'
        : 'The user will be allowed to log in again.',

    alertDesc:
      'The account record and existing data will be preserved.',

    confirmLabel:
      newStatus === 'Inactive'
        ? 'Disable Account'
        : 'Enable Account',

    danger:
      newStatus === 'Inactive',

    onConfirm:
      async () => {

        try {

          const response =
            await fetch(
              `${ADMIN_USERS_API}/${encodeURIComponent(user.id)}/status`,
              {
                method:
                  'PUT',

                headers: getAuthHeaders(),

                body:
                  JSON.stringify({
                    account_status:
                      newStatus
                  })
              }
            );


          const result =
            await response.json();


          if (
            !response.ok ||
            !result.success
          ) {

            throw new Error(
              result.message ||
              `Unable to ${actionText} account.`
            );

          }


          showToast(
            `${user.fullName} ${
              newStatus === 'Inactive'
                ? 'deactivated'
                : 'reactivated'
            } successfully.`,

            'success'
          );


          await loadAdminUsers();

          await loadAdminAuditLogs();


        } catch (error) {

          console.error(
            '[Admin Users] Status update failed:',
            error
          );


          showToast(
            error.message ||
              'Unable to update account status.',
            'error'
          );

        }

      }

  });

}


function openUserActions(
  key
) {

  window._resetUserKey =
    key;


  const u =
    ADMIN_USER_ACCOUNTS.find(
      x =>
        x.key ===
        key
    );


  const title =
    document.getElementById(
      'ua-modal-title'
    );


  if (title) {

    title.textContent =
      `Reset Credentials — ${
        u
          ? u.fullName
          : ''
      }`;

  }


  const desc =
    document.getElementById(
      'ua-modal-desc'
    );


  if (desc) {

    desc.textContent =
      'Force a secure login credential update for this account.';

  }


  setResetPassword(
    generateTempPassword()
  );


  document
    .getElementById(
      'user-actions-modal'
    )
    ?.classList.add(
      'show'
    );

}


/* =========================================================
   RESET CREDENTIALS
   ========================================================= */

function generateTempPassword(
  length = 16
) {

  const sets = [

    'ABCDEFGHJKLMNPQRSTUVWXYZ',

    'abcdefghijkmnpqrstuvwxyz',

    '23456789',

    '@#$%&*!?+='

  ];


  const all =
    sets.join('');


  const rand =
    max => {

      if (
        window.crypto &&
        window.crypto.getRandomValues
      ) {

        const buf =
          new Uint32Array(1);


        window.crypto.getRandomValues(
          buf
        );


        return (
          buf[0] %
          max
        );

      }


      return Math.floor(
        Math.random() *
        max
      );

    };


  const chars =
    sets.map(
      s =>
        s[
          rand(
            s.length
          )
        ]
    );


  while (
    chars.length <
    length
  ) {

    chars.push(
      all[
        rand(
          all.length
        )
      ]
    );

  }


  for (
    let i =
      chars.length - 1;
    i > 0;
    i--
  ) {

    const j =
      rand(
        i + 1
      );


    [
      chars[i],
      chars[j]
    ] = [
      chars[j],
      chars[i]
    ];

  }


  return chars.join('');

}


function setResetPassword(
  value
) {

  const input =
    document.getElementById(
      'ua-new-password'
    );


  if (input) {

    input.value =
      value;


    input.type =
      'password';

  }


  const icon =
    document.querySelector(
      '#ua-pw-reveal i'
    );


  if (icon) {

    icon.classList.add(
      'fi-rr-eye'
    );


    icon.classList.remove(
      'fi-rr-eye-crossed'
    );

  }

}


function regenerateResetPassword() {

  setResetPassword(
    generateTempPassword()
  );


  showToast(
    'New temporary password generated.',
    'info'
  );

}


function toggleResetPwVisibility() {

  const input =
    document.getElementById(
      'ua-new-password'
    );


  if (!input) {

    return;

  }


  const reveal =
    input.type ===
    'password';


  input.type =
    reveal
      ? 'text'
      : 'password';


  const icon =
    document.querySelector(
      '#ua-pw-reveal i'
    );


  if (icon) {

    icon.classList.toggle(
      'fi-rr-eye',
      !reveal
    );


    icon.classList.toggle(
      'fi-rr-eye-crossed',
      reveal
    );

  }

}


function closeUserActionsModal() {

  document
    .getElementById(
      'user-actions-modal'
    )
    ?.classList.remove(
      'show'
    );

}


async function resetUserCredentials() {

  const key =
    window._resetUserKey;


  const user =
    ADMIN_USER_ACCOUNTS.find(
      u =>
        u.key ===
        key
    );


  if (!user) {

    showToast(
      'User account could not be found.',
      'error'
    );

    return;

  }


  const input =
    document.getElementById(
      'ua-new-password'
    );


  const newPassword =
    (
      input?.value ||
      ''
    ).trim();


  if (!newPassword) {

    showToast(
      'Generate a temporary password before resetting credentials.',
      'error'
    );

    return;

  }


  if (
    !isStrongPassword(
      newPassword
    )
  ) {

    showToast(
      'Password must be at least 8 characters and include a capital letter, a number, and a special character.',
      'error'
    );

    input?.focus();

    return;

  }


  try {

    const response =
      await fetch(
        `${ADMIN_USERS_API}/${encodeURIComponent(user.id)}/password`,
        {
          method:
            'PUT',

          headers: getAuthHeaders(),

          body:
            JSON.stringify({
              password:
                newPassword
            })
        }
      );


    const result =
      await response.json();


    if (
      !response.ok ||
      !result.success
    ) {

      throw new Error(
        result.message ||
        'Unable to reset password.'
      );

    }


    showToast(
      `Credentials reset successfully for ${user.fullName}.`,
      'success'
    );


    closeUserActionsModal();


    /*
     * Reload live audit records so PASSWORD_RESET
     * appears immediately in the Admin dashboard.
     */
    await loadAdminAuditLogs();


  } catch (error) {

    console.error(
      '[Admin Users] Password reset failed:',
      error
    );


    showToast(
      error.message ||
        'Unable to reset password.',
      'error'
    );

  }

}


function exportUsers() {
  if (!Array.isArray(ADMIN_USER_ACCOUNTS) || !ADMIN_USER_ACCOUNTS.length) {
    showToast('There are no user accounts to export.', 'error');
    return;
  }

  const headers = ['Full Name', 'Username', 'Email', 'Role', 'Status'];
  const csvCell = value => {
    const safe = String(value ?? '').replace(/"/g, '""');
    return '"' + safe + '"';
  };
  const rows = ADMIN_USER_ACCOUNTS.map(user => [
    user.fullName,
    user.username,
    user.email === '—' ? '' : user.email,
    user.role,
    user.status
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = 'osca-user-accounts-' + date + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  appendAudit(
    CURRENT_USER?.displayName || 'Admin',
    'Exported user accounts list (CSV)',
    'Admin'
  );
  showToast('User accounts CSV downloaded successfully.', 'success');
}


/* =========================================================
   MODULE C — AUDIT LOGS
   ========================================================= */

function determineAuditActionType(action) {
  const normalizedAction = String(action || '')
    .trim()
    .toUpperCase()
    .replace(/[\\s-]+/g, '_');

  if (/(^|_)(LOGIN|LOGOUT|SIGN_IN|SIGN_OUT|SIGNIN|SIGNOUT)(_|$)/.test(normalizedAction)) return 'login';
  if (normalizedAction.includes('REPLACEMENT')) return 'replacement';
  if (normalizedAction.includes('VALIDATION')) return 'validation';
  if (normalizedAction.includes('DOCUMENT') || normalizedAction.includes('DOC_')) return 'documents';
  if (normalizedAction.includes('QUEUE') || normalizedAction.includes('ISSUANCE') || normalizedAction.includes('ID_MAKER')) return 'issuance';
  if (normalizedAction.includes('REJECT')) return 'reject';
  if (normalizedAction.includes('APPROVE')) return 'approve';
  if (normalizedAction.includes('STATUS') || normalizedAction.includes('PRINT')) return 'status';
  if (normalizedAction.includes('EXPORT')) return 'export';
  if (normalizedAction.includes('BACKUP') || normalizedAction.includes('RESTOR')) return 'backup';
  if (normalizedAction.includes('USER') || normalizedAction.includes('ROLE') || normalizedAction.includes('PASSWORD') || normalizedAction.includes('TWO_FACTOR')) return 'user';

  return 'other';
}

const escHtml =
  s =>
    String(
      s ??
      ''
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


function renderAuditUserFilter() {

  const sel =
    document.getElementById(
      'audit-user-filter'
    );


  if (!sel) {

    return;

  }


  const current =
    sel.value;


  const names = [];


  ADMIN_USER_ACCOUNTS.forEach(
    u => {

      if (
        u.fullName &&
        !names.includes(
          u.fullName
        )
      ) {

        names.push(
          u.fullName
        );

      }

    }
  );


  AUDIT_LOG_DATA.forEach(
    e => {

      if (
        e.user &&
        !names.includes(
          e.user
        )
      ) {

        names.push(
          e.user
        );

      }

    }
  );


  sel.innerHTML =
    '<option value="">All Users</option>' +
    names
      .map(
        n =>
          `<option value="${escHtml(n)}">${escHtml(n)}</option>`
      )
      .join('');


  sel.value =
    names.includes(
      current
    )
      ? current
      : '';

}


function renderAuditTable() {

  renderAuditUserFilter();


  const tbody =
    document.getElementById(
      'audit-logs-tbody'
    );


  if (!tbody) {

    return;

  }


  const f =
    readAuditFilterInputs();


  const filtered =
    AUDIT_LOG_DATA.filter(
      e =>
        auditEventMatches(
          e,
          f
        )
    );


  if (!filtered.length) {

    tbody.innerHTML =
      '<tr>' +
      '<td colspan="7" class="table-empty">' +
      '<i class="fi fi-rr-shield-check"></i> ' +
      'No audit events yet. They will appear here once connected to the live system.' +
      '</td>' +
      '</tr>';

  } else {

    tbody.innerHTML =
      filtered
        .map(
          e => {

            const roleBadge =
              e.role === 'Admin'
                ? 'badge-issued'
                : e.role === 'ID Maker'
                  ? 'badge-review'
                  : e.role === 'System'
                    ? 'badge-inactive'
                    : 'badge-active';


            return `

              <tr class="audit-log-row" data-audit-event-id="${escHtml(String(e.id))}" tabindex="0" role="button"
                aria-label="View details for audit event ${escHtml(e.action)}"
                onclick="openAuditEventDetails('${escHtml(String(e.id))}', this)"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAuditEventDetails('${escHtml(String(e.id))}', this)}">
                <td data-label="Time">

                  <span class="cell-text">
                    ${escHtml(e.ts)}
                  </span>

                </td>


                <td data-label="User">

                  <span class="cell-text">
                    ${escHtml(e.user)}
                  </span>

                </td>


                <td data-label="Username">

                  <span class="cell-text" style="font-family:var(--font-data)">
                    ${escHtml(e.username || '—')}
                  </span>

                </td>


                <td data-label="Role">

                  <span class="badge ${roleBadge}">
                    ${escHtml(e.role)}
                  </span>

                </td>


                <td data-label="Action">

                  <span class="cell-text">
                    ${escHtml(e.action)}
                  </span>

                </td>


                <td data-label="IP Address">

                  <span
                    class="cell-text"
                    style="font-family:var(--font-data)"
                  >
                    ${escHtml(e.ip)}
                  </span>

                </td>


                <td data-label="Device">

                  <span class="cell-text">
                    ${escHtml(e.device)}
                  </span>

                </td>

              </tr>

            `;

          }
        )
        .join('');

  }


  const footer =
    document.getElementById(
      'audit-logs-footer'
    );


  if (footer) {

    footer.textContent =
      `Showing ${filtered.length} of ${AUDIT_LOG_DATA.length} events`;

  }


  const label =
    document.getElementById(
      'audit-count-label'
    );


  if (label) {

    label.textContent =
      `${filtered.length} of ${AUDIT_LOG_DATA.length} events`;

  }

}


function formatAuditDetailValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const textValue = String(value);
  try {
    const parsed = JSON.parse(textValue);
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
  } catch (_error) {}
  return textValue;
}

function positionAuditEventDetails(_anchorRow = null) {
  const modal = document.getElementById('audit-event-detail-modal');
  const dialog = modal?.querySelector('.audit-detail-modal__dialog');
  if (!modal || !dialog) return;

  // A detail dialog should behave like a conventional modal: its position and
  // dimensions remain consistent regardless of which audit row was selected.
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const edge = viewportWidth <= 640 ? 12 : 24;

  dialog.style.position = 'fixed';
  dialog.style.left = '50%';
  dialog.style.top = '50%';
  dialog.style.right = 'auto';
  dialog.style.bottom = 'auto';
  dialog.style.transform = 'translate(-50%, -50%)';
  dialog.style.width = Math.min(780, Math.max(0, viewportWidth - edge * 2)) + 'px';
  dialog.style.height = Math.min(680, Math.max(300, viewportHeight - edge * 2)) + 'px';
  dialog.style.maxHeight = 'calc(100dvh - ' + (edge * 2) + 'px)';
  dialog.style.minHeight = Math.min(420, Math.max(260, viewportHeight - edge * 2)) + 'px';
  dialog.dataset.anchorSide = 'center';
}

function openAuditEventDetails(eventId, anchorRow = null) {
  const event = AUDIT_LOG_DATA.find(log => String(log.id) === String(eventId));
  if (!event) {
    showToast('This audit event is no longer available. Refresh the logs and try again.', 'error');
    return;
  }

  const modal = document.getElementById('audit-event-detail-modal');
  const content = document.getElementById('audit-event-detail-content');
  const title = document.getElementById('audit-event-detail-title');
  if (!modal || !content) return;

  if (title) title.textContent = event.action || 'Audit event details';

  const field = (label, value, extraClass = '') => `
    <div class="audit-detail-field ${extraClass}">
      <span class="audit-detail-field__label">${escHtml(label)}</span>
      <div class="audit-detail-field__value">${escHtml(value ?? '—')}</div>
    </div>`;

  const detailsText = formatAuditDetailValue(event.details);
  const actorName = event.user || event.username || 'Unknown user';
  const actionName = event.action || 'Audit event';
  const initials = String(actorName).trim().split(/\\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '—';
  content.innerHTML = `
    <section class="audit-detail-summary">
      <div class="audit-detail-summary__avatar" aria-hidden="true">${escHtml(initials)}</div>
      <div class="audit-detail-summary__copy">
        <span class="audit-detail-summary__eyebrow">ACTIVITY SUMMARY</span>
        <strong>${escHtml(actorName)}</strong>
        <span>performed <b>${escHtml(actionName)}</b></span>
        <small>${escHtml(event.ts || 'Timestamp unavailable')}</small>
      </div>
      <span class="audit-detail-summary__badge">${escHtml(event.role || 'Unknown role')}</span>
    </section>

    <section class="audit-detail-section audit-detail-section--first">
      <div class="audit-detail-section__heading"><span>01</span><h3>Event information</h3></div>
      <div class="audit-detail-grid">
        ${field('Timestamp', event.ts)}
        ${field('Action / event', actionName)}
      </div>
    </section>

    <section class="audit-detail-section">
      <div class="audit-detail-section__heading"><span>02</span><h3>Performed by</h3></div>
      <div class="audit-detail-grid">
        ${field('User account', event.user)}
        ${field('Username', event.username)}
        ${field('Email address', event.email)}
        ${field('Role', event.role)}
        ${field('IP address', event.ip)}
        ${field('Device', event.device)}
      </div>
    </section>

    <section class="audit-detail-section">
      <div class="audit-detail-section__heading"><span>03</span><h3>Affected record</h3></div>
      <div class="audit-detail-grid">
        ${field('Record type', event.entityType)}
        ${field('Record ID', event.entityId)}
      </div>
    </section>

    <section class="audit-detail-section">
      <div class="audit-detail-section__heading"><span>04</span><h3>Change details</h3></div>
      <pre class="audit-detail-pre">${escHtml(detailsText || 'No additional event details were recorded.')}</pre>
    </section>

    <details class="audit-detail-technical">
      <summary>
        <span><b>Technical information</b><small>Full browser user-agent string</small></span>
        <span class="audit-detail-technical__toggle" aria-hidden="true">+</span>
      </summary>
      <pre class="audit-detail-pre audit-detail-pre--muted">${escHtml(event.userAgent || 'Not available')}</pre>
    </details>

    <div class="audit-detail-meta">Audit event ID <code>${escHtml(String(event.id))}</code><span>Read-only · Append-only record</span></div>
  `;

  // IMPORTANT: this modal is authored inside the admin module. Some module
  // wrappers create transformed containing blocks, which trap position:fixed
  // descendants and make the overlay/dialog appear in the wrong place.
  // Move the popup to <body> before displaying it so its coordinates use the
  // actual browser viewport and the entire application is covered.
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  window.__auditDetailAnchorRow = anchorRow || document.activeElement;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('audit-detail-open');

  if (window.__auditDetailEscapeHandler) {
    document.removeEventListener('keydown', window.__auditDetailEscapeHandler);
  }
  window.__auditDetailEscapeHandler = (keyboardEvent) => {
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      closeAuditEventDetails();
    }
  };
  document.addEventListener('keydown', window.__auditDetailEscapeHandler);

  if (!window.__auditDetailResizeHandler) {
    window.__auditDetailResizeHandler = () => {
      const activeModal = document.getElementById('audit-event-detail-modal');
      if (!activeModal?.hidden) {
        positionAuditEventDetails(window.__auditDetailAnchorRow);
      }
    };
    window.addEventListener('resize', window.__auditDetailResizeHandler);
  }

  // Capture the clicked row's viewport position before the body is locked.
  positionAuditEventDetails(anchorRow);

  const detailBody = modal.querySelector('.audit-detail-modal__body');
  if (detailBody) detailBody.scrollTop = 0;
  modal.scrollTop = 0;

  // Recalculate after layout has settled, without scrolling the page.
  requestAnimationFrame(() => {
    if (!modal.hidden) positionAuditEventDetails(anchorRow);
  });

  document.getElementById('audit-event-detail-close')?.focus({ preventScroll: true });
}

function closeAuditEventDetails() {
  const modal = document.getElementById('audit-event-detail-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('audit-detail-open');
  if (window.__auditDetailEscapeHandler) {
    document.removeEventListener('keydown', window.__auditDetailEscapeHandler);
    window.__auditDetailEscapeHandler = null;
  }
  const previousFocus = window.__auditDetailAnchorRow;
  window.__auditDetailAnchorRow = null;
  if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
    previousFocus.focus({ preventScroll: true });
  }
}


function filterAuditLogs() {

  renderAuditTable();

}


function readAuditFilterInputs() {
  return {
    q: (document.getElementById('audit-search')?.value || '').trim().toLocaleLowerCase(),
    userF: document.getElementById('audit-user-filter')?.value || '',
    actionF: document.getElementById('audit-action-filter')?.value || '',
    from: document.getElementById('audit-date-from')?.value || '',
    to: document.getElementById('audit-date-to')?.value || ''
  };
}

function auditEventTime(
  e
) {

  if (
    e._tsMs ===
    undefined
  ) {

    const parsed =
      e.ts instanceof Date
        ? e.ts.getTime()
        : Date.parse(
            e.ts
          );


    e._tsMs =
      Number.isNaN(
        parsed
      )
        ? null
        : parsed;

  }


  return e._tsMs;

}


function auditEventMatches(e, f) {
  const searchableText = [
    e.action, e.user, e.username, e.email, e.role,
    e.ip, e.device, e.entityType, e.entityId, e.details
  ].map(value => String(value ?? '')).join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();

  const searchTerm = String(f.q || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();

  const matchQ = !searchTerm || searchableText.includes(searchTerm);
  const matchUser = !f.userF || e.user === f.userF;
  const matchAction = !f.actionF || determineAuditActionType(e.action) === f.actionF;

  let matchDate = true;
  const ts = auditEventTime(e);

  if (f.from || f.to) {
    if (ts === null) return false;

    if (f.from) {
      const [year, month, day] = f.from.split('-').map(Number);
      const fromMs = new Date(year, month - 1, day).getTime();
      if (!Number.isNaN(fromMs) && ts < fromMs) matchDate = false;
    }

    if (matchDate && f.to) {
      const [year, month, day] = f.to.split('-').map(Number);
      // Use the next local midnight so every event on the To date is included.
      const toExclusiveMs = new Date(year, month - 1, day + 1).getTime();
      if (!Number.isNaN(toExclusiveMs) && ts >= toExclusiveMs) matchDate = false;
    }
  }

  return matchQ && matchUser && matchAction && matchDate;
}

/* =========================================================
   AUDIT SUMMARY FILTER
   ========================================================= */

const AUDIT_SUMMARY_RANGES = {

  '5':
    'Last 5 actions',

  '24h':
    'Actions (last 24 hours)',

  '7d':
    'Actions (last 7 days)'

};


const AUDIT_SUMMARY_DEFAULT_RANGE =
  '5';


const AUDIT_SUMMARY_STORAGE_KEY =
  'osca.auditSummaryRange';


const AUDIT_SUMMARY_FADE_MS =
  160;


let auditSummaryTimer =
  null;


function readAuditSummaryRange() {

  try {

    const saved =
      window.localStorage.getItem(
        AUDIT_SUMMARY_STORAGE_KEY
      );


    return AUDIT_SUMMARY_RANGES[
      saved
    ]
      ? saved
      : AUDIT_SUMMARY_DEFAULT_RANGE;


  } catch (
    _err
  ) {

    return AUDIT_SUMMARY_DEFAULT_RANGE;

  }

}


function persistAuditSummaryRange(
  period
) {

  try {

    window.localStorage.setItem(
      AUDIT_SUMMARY_STORAGE_KEY,
      period
    );


  } catch (
    _err
  ) {

    /* private mode */

  }

}


function setAuditSummaryUpdating(
  updating
) {

  const body =
    document
      .querySelector(
        '#audit-summary-tbody'
      )
      ?.closest(
        '.log-card__body'
      );


  if (body) {

    body.classList.toggle(
      'is-updating',
      updating
    );


    body.setAttribute(
      'aria-busy',
      updating
        ? 'true'
        : 'false'
    );

  }


  const filter =
    document.getElementById(
      'audit-summary-filter'
    );


  if (filter) {

    filter.classList.toggle(
      'is-loading',
      updating
    );

  }

}


function filterAuditLog(
  period,
  options = {}
) {

  const range =
    AUDIT_SUMMARY_RANGES[
      period
    ]
      ? period
      : AUDIT_SUMMARY_DEFAULT_RANGE;


  const select =
    document.getElementById(
      'audit-summary-range'
    );


  if (
    select &&
    select.value !==
      range
  ) {

    select.value =
      range;

  }


  const isFiltered =
    range !==
    AUDIT_SUMMARY_DEFAULT_RANGE;


  const filter =
    document.getElementById(
      'audit-summary-filter'
    );


  if (filter) {

    filter.classList.toggle(
      'is-filtered',
      isFiltered
    );

  }


  const reset =
    document.getElementById(
      'audit-summary-reset'
    );


  if (reset) {

    reset.hidden =
      !isFiltered;

  }


  persistAuditSummaryRange(
    range
  );


  const apply =
    () => {

      const rows =
        document.querySelectorAll(
          '#audit-summary-tbody tr'
        );


      rows.forEach((row, index) => {
        const timestamp = Number(row.dataset.createdAt);
        const age = Date.now() - timestamp;
        const matches = range === '5'
          ? index < 5
          : Number.isFinite(timestamp) && age >= 0 && (
              range === '24h'
                ? age <= 24 * 60 * 60 * 1000
                : age <= 7 * 24 * 60 * 60 * 1000
            );
        row.style.display = matches ? '' : 'none';
      });


      const label =
        document.getElementById(
          'audit-summary-sub'
        );


      if (label) {

        const visible =
          Array.from(
            rows
          )
            .filter(
              r =>
                r.style.display !==
                'none'
            )
            .length;


        const total =
          rows.length;


        label.textContent =
          AUDIT_SUMMARY_RANGES[
            range
          ];


        if (
          isFiltered &&
          total &&
          visible <
            total
        ) {

          label.textContent +=
            ` · ${visible}/${total} shown`;

        }

      }


      setAuditSummaryUpdating(
        false
      );

    };


  clearTimeout(
    auditSummaryTimer
  );


  if (
    options.instant
  ) {

    apply();

    return;

  }


  setAuditSummaryUpdating(
    true
  );


  auditSummaryTimer =
    setTimeout(
      apply,
      AUDIT_SUMMARY_FADE_MS
    );

}


function resetAuditLogFilter() {

  filterAuditLog(
    AUDIT_SUMMARY_DEFAULT_RANGE
  );


  showToast(
    'Audit summary filter reset to default',
    'info'
  );

}


function exportAuditLog() {

  const rows =
    Array.from(
      document.querySelectorAll(
        '#audit-summary-tbody tr'
      )
    ).filter(
      r =>
        r.style.display !==
        'none'
    );


  const data =
    rows.map(
      r =>
        Array.from(
          r.querySelectorAll(
            'td'
          )
        )
          .slice(
            0,
            3
          )
          .map(
            td =>
              csvCell(
                td.textContent
              )
          )
          .join(',')
    );


  downloadCsvFile(
    `audit-summary-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      'Time',
      'User',
      'Action'
    ],
    data
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Exported audit summary (CSV)',
    'Admin'
  );


  showToast(
    'Audit summary exported (' +
      rows.length +
      ' rows) — DPA-safe CSV',
    'success'
  );

}


function updateAuditDateRangeLabel() {
  const from = document.getElementById('audit-date-from')?.value || '';
  const to = document.getElementById('audit-date-to')?.value || '';
  const label = document.getElementById('audit-date-range-label');
  if (!label) return;

  const formatDate = value => {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (!from && !to) label.textContent = 'Date range';
  else if (from && to) label.textContent = `${formatDate(from)} – ${formatDate(to)}`;
  else if (from) label.textContent = `From ${formatDate(from)}`;
  else label.textContent = `Until ${formatDate(to)}`;
}

function clearAuditDateRange() {
  const from = document.getElementById('audit-date-from');
  const to = document.getElementById('audit-date-to');
  if (from) from.value = '';
  if (to) to.value = '';
  updateAuditDateRangeLabel();
  filterAuditLogs();
}

function resetAuditFilters() {
  ['audit-search', 'audit-user-filter', 'audit-action-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearAuditDateRange();
}

/* =========================================================
   CSV HELPERS
   ========================================================= */

function csvCell(
  v
) {

  return String(
    v ??
      ''
  )
    .replace(
      /,/g,
      ';'
    )
    .trim();

}


function downloadCsvFile(
  filename,
  header,
  rows
) {

  const csv =
    [
      header.join(','),
      ...rows
    ].join('\n');


  const blob =
    new Blob(
      [
        csv
      ],
      {
        type:
          'text/csv;charset=utf-8;'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    filename;


  link.click();


  URL.revokeObjectURL(
    url
  );

}


function exportAuditReport() {

  const f =
    readAuditFilterInputs();


  const filtered =
    AUDIT_LOG_DATA.filter(
      e =>
        auditEventMatches(
          e,
          f
        )
    );


  const header = [

    'Time',

    'User',

    'Role',

    'Action',

    'IP Address',

    'Device',

    'Details'

  ];


  const data =
    filtered.map(
      e =>
        [
          e.ts,
          e.user,
          e.role,
          e.action,
          e.ip,
          e.device,
          e.details
        ]
          .map(
            csvCell
          )
          .join(',')
    );


  downloadCsvFile(
    `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`,
    header,
    data
  );


  showToast(
    `Audit trail exported (${filtered.length} rows) — DPA-safe CSV`,
    'success'
  );

}

/* =========================================================
   MODULE D — LIVE BACKUP & NON-DESTRUCTIVE RECOVERY
   ========================================================= */

const ADMIN_BACKUPS_API = "https://management-backend-3cij.onrender.com/api/backups";
let backupIsRunning = false;
let BACKUP_HISTORY = [];
let backupProgressPoller = null;
let backupCancelRequestedByUser = false;

function formatBackupBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatBackupDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

async function loadSystemBackups() {
  const tbody = document.getElementById("backup-history-tbody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading saved backups…</td></tr>';
  try {
    const response = await fetch(ADMIN_BACKUPS_API, {
      method: "GET",
      headers: { Accept: "application/json", ...getAuthHeaders() },
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to load backup history.");
    BACKUP_HISTORY = Array.isArray(result.backups) ? result.backups : [];
    renderBackupHistory();
    renderRestorePoints();
    updateBackupSummary();
    return BACKUP_HISTORY;
  } catch (error) {
    console.error("[Backups] Unable to load history:", error);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Unable to load backup history. Check your administrator session and backend configuration.</td></tr>';
    showToast(error.message || "Unable to load backup history.", "error");
    return [];
  }
}

function updateBackupSummary() {
  const latest = BACKUP_HISTORY[0] || null;
  const health = document.getElementById("bk-health");
  const storage = document.getElementById("bk-storage");
  const next = document.getElementById("bk-next");
  const restore = document.getElementById("bk-restore");
  const title = document.getElementById("bk-last-title");
  if (health) health.textContent = BACKUP_HISTORY.length.toLocaleString();
  if (storage) storage.textContent = Number(latest?.totalRows || 0).toLocaleString();
  if (next) next.textContent = Number(latest?.fileCount || 0).toLocaleString();
  if (restore) restore.textContent = latest ? "Ready" : "None";
  if (title) title.textContent = latest
    ? "Latest successful backup: " + formatBackupDate(latest.createdAt)
    : "No successful backup has been created yet.";
}

function renderBackupHistory() {
  const tbody = document.getElementById("backup-history-tbody");
  if (!tbody) return;
  if (!BACKUP_HISTORY.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No saved backups yet. Create an encrypted backup to establish a recovery point.</td></tr>';
    return;
  }
  tbody.innerHTML = BACKUP_HISTORY.map(backup => {
    const safeId = String(backup.backupId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const rows = Number(backup.totalRows || 0).toLocaleString();
    const files = Number(backup.fileCount || 0).toLocaleString();
    return '<tr>' +
      '<td data-label="Date &amp; Time"><span class="cell-text">' + escHtml(formatBackupDate(backup.createdAt)) + '</span></td>' +
      '<td data-label="Type"><span class="badge badge-active">Encrypted full backup</span></td>' +
      '<td data-label="File Size"><span class="cell-text">' + escHtml(formatBackupBytes(backup.archiveBytes)) + '</span></td>' +
      '<td data-label="Status"><span class="badge badge-approved">' + escHtml(backup.status || "Saved") + '</span></td>' +
      '<td data-label="Contents"><span class="cell-text">' + rows + ' rows · ' + files + ' files</span></td>' +
      '<td style="text-align:right"><button class="row-action always-visible" onclick="restoreFromHistory(&quot;' + safeId + '&quot;)">Recover</button></td>' +
      '</tr>';
  }).join("");
}

function renderRestorePoints() {
  const select = document.getElementById("restore-point-select");
  if (!select) return;
  const current = select.value;
  if (!BACKUP_HISTORY.length) {
    select.innerHTML = '<option value="">No restore points available</option>';
    return;
  }
  select.innerHTML = BACKUP_HISTORY.map(backup =>
    '<option value="' + escHtml(backup.backupId) + '">' +
    escHtml(formatBackupDate(backup.createdAt)) + ' — ' +
    escHtml(formatBackupBytes(backup.archiveBytes)) + '</option>'
  ).join("");
  if (BACKUP_HISTORY.some(backup => backup.backupId === current)) select.value = current;
}

function executeBackup() {
  if (backupIsRunning) return;
  openConfirmModal({
    title: "Create a new encrypted system backup?",
    desc: "The system will export supported database records and every uploaded file in the private documents bucket.",
    alertTitle: "Existing data will not be changed",
    alertDesc: "The backup is encrypted before it is saved. The process may take a few minutes depending on the number and size of uploaded files.",
    confirmLabel: "Create Backup",
    danger: false,
    onConfirm: runBackupNow
  });
}

function showBackupProgressModal() {
  const modal = document.getElementById("backup-progress-modal");
  if (modal) {
    modal.hidden = false;
    document.body.classList.add("backup-progress-open");
  }
  updateBackupProgressUI({ percent: 1, stage: "Starting secure backup…", status: "running" });
}

function updateBackupProgressUI(progress = {}) {
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  const value = document.getElementById("backup-progress-percent");
  const bar = document.getElementById("backup-progress-bar");
  const stage = document.getElementById("backup-progress-stage");
  const status = document.getElementById("backup-progress-status");
  const detail = document.getElementById("backup-progress-detail");
  if (value) value.textContent = percent + "%";
  if (bar) {
    bar.style.width = percent + "%";
    bar.setAttribute("aria-valuenow", String(percent));
  }
  if (stage) stage.textContent = progress.stage || "Preparing backup…";
  if (status) {
    status.textContent = progress.status === "failed" ? "Failed" :
      progress.status === "completed" ? "Completed" :
      progress.status === "cancelled" ? "Cancelled" :
      progress.status === "cancelling" ? "Cancelling…" : "In progress";
    status.className = "backup-progress-status" +
      (progress.status === "failed" ? " is-failed" :
        progress.status === "completed" ? " is-complete" :
        progress.status === "cancelled" || progress.status === "cancelling" ? " is-cancelled" : "");
  }
  const cancelButton = document.getElementById("backup-cancel-button");
  const note = document.getElementById("backup-progress-note");
  const terminal = ["failed", "completed", "cancelled"].includes(progress.status);
  if (cancelButton) {
    cancelButton.hidden = terminal;
    if (progress.status === "cancelling" || backupCancelRequestedByUser) {
      cancelButton.disabled = true;
      cancelButton.textContent = "Cancelling…";
    } else {
      cancelButton.disabled = false;
      cancelButton.textContent = "Cancel Backup";
    }
  }
  if (note) {
    note.textContent = progress.status === "cancelling"
      ? "Please wait while the current operation finishes and temporary files are cleaned up."
      : progress.status === "cancelled"
        ? "The backup was cancelled. No recovery point was saved."
        : progress.status === "completed"
          ? "Your encrypted recovery point is saved."
          : "Please keep this page open while the backup is running.";
  }
  if (detail) {
    const parts = [];
    if (Number.isFinite(Number(progress.completedTables)) && progress.totalTables) {
      parts.push(progress.completedTables + "/" + progress.totalTables + " database tables");
    }
    if (progress.totalFiles) parts.push((progress.completedFiles || 0) + "/" + progress.totalFiles + " uploaded files");
    if (progress.totalParts) parts.push((progress.completedParts || 0) + "/" + progress.totalParts + " archive parts");
    if (Number.isFinite(Number(progress.discoveredFiles))) parts.push(progress.discoveredFiles + " files found");
    if (Number.isFinite(Number(progress.scannedFolders))) parts.push(progress.scannedFolders + " folders scanned");
    detail.textContent = parts.join(" · ") || "Preparing backup tasks";
  }
}

function closeBackupProgressModal() {
  const modal = document.getElementById("backup-progress-modal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("backup-progress-open");
}

async function refreshBackupProgress() {
  try {
    const response = await fetch(ADMIN_BACKUPS_API + "/progress", {
      headers: { Accept: "application/json", ...getAuthHeaders() },
      cache: "no-store"
    });
    if (!response.ok) return;
    const result = await response.json();
    if (result.success && result.progress) updateBackupProgressUI(result.progress);
  } catch (error) {
    console.warn("[Backups] Progress update unavailable:", error.message);
  }
}

function stopBackupProgressPolling() {
  if (backupProgressPoller) {
    clearInterval(backupProgressPoller);
    backupProgressPoller = null;
  }
}

async function cancelBackupNow() {
  if (!backupIsRunning || backupCancelRequestedByUser) return;
  backupCancelRequestedByUser = true;
  const cancelButton = document.getElementById("backup-cancel-button");
  if (cancelButton) {
    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelling…";
  }
  updateBackupProgressUI({
    percent: Number(document.getElementById("backup-progress-bar")?.getAttribute("aria-valuenow") || 0),
    stage: "Sending cancellation request…",
    status: "cancelling"
  });
  try {
    const response = await fetch(ADMIN_BACKUPS_API + "/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to cancel the backup.");
    }
    showToast("Cancellation requested. Waiting for safe cleanup…", "info");
    await refreshBackupProgress();
  } catch (error) {
    console.error("[Backups] Cancellation request failed:", error);
    backupCancelRequestedByUser = false;
    if (cancelButton) {
      cancelButton.disabled = false;
      cancelButton.textContent = "Cancel Backup";
    }
    showToast(error.message || "Unable to cancel the backup.", "error");
  }
}

async function runBackupNow() {
  if (backupIsRunning) return;
  backupIsRunning = true;
  backupCancelRequestedByUser = false;
  const button = document.getElementById("btn-execute-backup");
  if (button) {
    button.disabled = true;
    button.textContent = "Creating encrypted backup…";
  }
  showBackupProgressModal();
  showToast("Creating encrypted backup of database records and uploaded files…", "info");
  await refreshBackupProgress();
  backupProgressPoller = setInterval(refreshBackupProgress, 1000);
  try {
    const response = await fetch(ADMIN_BACKUPS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Backup could not be created.");
    updateBackupProgressUI({ percent: 100, stage: "Backup completed and saved successfully", status: "completed" });
    showToast("Backup created successfully. Database records and uploaded files were included.", "success");
    await loadSystemBackups();
    window.setTimeout(closeBackupProgressModal, 1200);
  } catch (error) {
    console.error("[Backups] Create failed:", error);
    const wasCancelled = backupCancelRequestedByUser || /cancelled by administrator/i.test(error.message || "");
    const currentPercent = Number(document.getElementById("backup-progress-bar")?.getAttribute("aria-valuenow") || 0);
    updateBackupProgressUI({
      percent: currentPercent,
      stage: wasCancelled ? "Backup cancelled. Temporary files were cleaned up." : (error.message || "Backup failed. Please try again."),
      status: wasCancelled ? "cancelled" : "failed"
    });
    showToast(wasCancelled ? "Backup cancelled. No recovery point was saved." : (error.message || "Backup failed. Check the backend configuration."), wasCancelled ? "warning" : "error");
    window.setTimeout(closeBackupProgressModal, 2800);
  } finally {
    stopBackupProgressPolling();
    backupIsRunning = false;
    backupCancelRequestedByUser = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Execute Immediate Database Backup";
    }
  }
}

function restoreFromHistory(backupId) {
  const backup = BACKUP_HISTORY.find(item => item.backupId === backupId);
  if (!backup) {
    showToast("The selected backup is no longer in the list. Refresh and try again.", "error");
    return;
  }
  openConfirmModal({
    title: "Recover missing records and uploaded files?",
    desc: "Selected backup: " + formatBackupDate(backup.createdAt),
    alertTitle: "Non-destructive recovery",
    alertDesc: "Only missing records and files will be restored. Existing database records and uploaded files will be preserved and will not be overwritten.",
    confirmLabel: "Recover Missing Data",
    danger: false,
    onConfirm: () => runRestore(backupId)
  });
}

function initiateRestore() {
  const select = document.getElementById("restore-point-select");
  const backupId = select?.value;
  if (!backupId) {
    showToast("Select a saved backup first.", "warning");
    return;
  }
  restoreFromHistory(backupId);
}

async function runRestore(backupId) {
  showToast("Recovery started. Checking the backup and restoring missing data…", "info");
  try {
    const response = await fetch(ADMIN_BACKUPS_API + "/" + encodeURIComponent(backupId) + "/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok || !result.summary) throw new Error(result.message || "Recovery could not be completed.");
    const summary = result.summary;
    const restoredRows = Object.values(summary.tables || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const skippedRows = Object.values(summary.skippedExistingRows || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const details = "Restored " + restoredRows.toLocaleString() + " database rows and " +
      Number(summary.filesRestored || 0).toLocaleString() + " files. Preserved " +
      skippedRows.toLocaleString() + " existing rows and " +
      Number(summary.filesSkipped || 0).toLocaleString() + " existing files.";
    if (result.success) {
      showToast("Recovery completed. " + details, "success");
    } else {
      const issueCount = Array.isArray(summary.failures) ? summary.failures.length : 0;
      showToast("Recovery finished with " + issueCount + " issue(s). " + details + " Review the backend logs for details.", "warning");
      console.warn("[Backups] Recovery issues:", summary.failures);
    }
    await loadSystemBackups();
  } catch (error) {
    console.error("[Backups] Recovery failed:", error);
    showToast(error.message || "Recovery failed. Existing data has not been intentionally overwritten.", "error");
  }
}

function verifyRestorePoint() {
  loadSystemBackups();
}
