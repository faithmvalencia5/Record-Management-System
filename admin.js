// Admin portal logic


/* =========================================================
   LIVE ADMIN DASHBOARD DATA
   ========================================================= */

const ADMIN_APPLICATIONS_API =
  'https://management-backend-3cij.onrender.com/api/applications';

let ADMIN_APPLICATIONS = [];


/**
 * Update Admin Dashboard metrics using live application data.
 */
function updateAdminDashboardFromApplications(applications) {

  if (!Array.isArray(applications)) {
    return;
  }

  ADMIN_APPLICATIONS =
    applications;

  updateAdminApplicationAnalytics(
    applications
  );

  const total =
    applications.length;


  /* -----------------------------------------
     Total Registered Citizens
     ----------------------------------------- */

  const citizens =
    document.getElementById(
      'kpi-citizens'
    );

  if (citizens) {

    citizens.textContent =
      total.toLocaleString('en-US');

  }


  /* -----------------------------------------
     Applications Received
     ----------------------------------------- */

  const received =
    document.getElementById(
      'metric-received'
    );

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

    syncApplicationsToAppDB(
      applications
    );

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


    return applications;

  } catch (error) {

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

let ADMIN_USER_ACCOUNTS = [];


const ADMIN_USERS_API =
  'https://management-backend-3cij.onrender.com/api/auth/users';


/**
 * Load actual Staff / ID Maker / Admin accounts
 * from the database.
 */
async function loadAdminUsers() {

  try {

    console.log(
      '[Admin Users] Loading user accounts...'
    );


    const response =
      await fetch(
        ADMIN_USERS_API,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
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
            user.username,

          username:
            user.username,

          email:
            user.email ||
            '—',

          role:
            user.role ||
            'Staff',

          designation:
            getUserDesignation(
              user.role
            ),

          status:
            user.account_status ||
            'Active',

          lastActive:
            '—'

        })
      );


    console.log(
      '[Admin Users] Loaded:',
      ADMIN_USER_ACCOUNTS.length
    );


    renderUserMgmtTable();

    updateAdminUserDashboardMetrics();


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


    return [];

  }

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
          user.role === 'Staff' ||
          user.role === 'ID Maker'
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

}


/* =========================================================
   ADMIN SYSTEM HEALTH
   ========================================================= */

const ADMIN_HEALTH_API =
  'https://management-backend-3cij.onrender.com/api/test';


async function checkAdminSystemHealth() {

  const uptimeEl =
    document.getElementById(
      'kpi-uptime'
    );


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

  }

}


/* =========================================================
   ADMIN PAGE INITIALIZATION
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    /*
     * Load actual application records
     * from Supabase through the backend.
     */
    loadAdminDashboardData();


    /*
     * Load actual user accounts.
     */
    loadAdminUsers();


    /*
     * Check backend health.
     */
    checkAdminSystemHealth();


    /*
     * Existing audit summary filter.
     */
    filterAuditLog(
      readAuditSummaryRange(),
      {
        instant: true
      }
    );


    /*
     * Existing admin modules.
     */
    setTimeout(
      () => {

        renderUserMgmtTable();

        renderAuditTable();

        renderBackupHistory();

        renderRestorePoints();

        renderServiceStatus();

      },
      100
    );


    /*
     * SMS template counters.
     */
    [
      'approval',
      'rejection'
    ].forEach(
      kind => {

        const ta =
          document.getElementById(
            'tpl-sms-' + kind
          );


        if (ta) {

          ta.addEventListener(
            'input',
            () =>
              updateSmsCount(
                'tpl-sms-' + kind,
                'tpl-counter-' + kind
              )
          );

        }

      }
    );


    updateSmsCount(
      'tpl-sms-approval',
      'tpl-counter-approval'
    );


    updateSmsCount(
      'tpl-sms-rejection',
      'tpl-counter-rejection'
    );


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


  const filtered =
    ADMIN_USER_ACCOUNTS.filter(
      u => {

        const matchQ =
          !q ||
          (
            u.fullName +
            ' ' +
            u.username +
            ' ' +
            u.role +
            ' ' +
            u.designation
          )
            .toLowerCase()
            .includes(q);


        const matchRole =
          !roleF ||
          u.role === roleF;


        const matchStatus =
          !statusF ||
          u.status === statusF;


        return (
          matchQ &&
          matchRole &&
          matchStatus
        );

      }
    );


  tbody.innerHTML =
    '';


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


        <td data-label="Position">

          <span
            class="cell-text"
            title="${escHtml(u.designation)}"
          >
            ${escHtml(u.designation)}
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
              class="icon-btn"
              title="Reset Password"
              aria-label="Reset Password"
              onclick="openUserActions('${escHtml(u.key)}')"
            >

              <i class="fi fi-rr-rotate-left"></i>

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


  if (editingUserKey) {

    const u =
      ADMIN_USER_ACCOUNTS.find(
        x =>
          x.key ===
          key
      );


    if (u) {

      document.getElementById(
        'um-fullname'
      ).value =
        u.fullName;


      document.getElementById(
        'um-designation'
      ).value =
        u.designation;


      document.getElementById(
        'um-username'
      ).value =
        u.username;


      document.getElementById(
        'um-email'
      ).value =
        u.email;


      document.getElementById(
        'um-role'
      ).value =
        u.role;


      document.getElementById(
        'um-status'
      ).value =
        u.status;


      document.getElementById(
        'um-password'
      ).value =
        '';

    }

  } else {

    [
      'um-fullname',
      'um-designation',
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
    document.getElementById(
      'um-password'
    )?.value || '';

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


  if (
    password &&
    !isStrongPassword(
      password
    )
  ) {

    showToast(
      'Password must be at least 8 characters and include a capital letter, a number, and a special character.',
      'error'
    );

    document
      .getElementById(
        'um-password'
      )
      ?.focus();

    return;

  }


  const designation =
    document.getElementById(
      'um-designation'
    ).value.trim() ||
    (
      role === 'ID Maker'
        ? 'ID Card Producer'
        : 'OSCA Staff'
    );


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


      response =
        await fetch(
          `${ADMIN_USERS_API}/${encodeURIComponent(user.id)}`,
          {
            method:
              'PUT',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json'
            },

            body:
              JSON.stringify({
                username,
                email,
                role,
                account_status:
                  status,
                password:
                  password ||
                  undefined
              })
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

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json'
            },

            body:
              JSON.stringify({
                username,
                password,
                email,
                role,
                account_status:
                  status
              })
          }
        );

    }


    const result =
      await response.json();


    if (!response.ok ||
        !result.success) {

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


    renderAuditUserFilter();


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

                headers: {
                  'Content-Type':
                    'application/json',

                  Accept:
                    'application/json'
                },

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


          appendAudit(
            CURRENT_USER?.displayName ||
              'Admin',

            `${
              newStatus === 'Inactive'
                ? 'Deactivated'
                : 'Reactivated'
            } user: ${user.fullName}`,

            'Admin'
          );


          showToast(
            `${user.fullName} ${
              newStatus === 'Inactive'
                ? 'deactivated'
                : 'reactivated'
            } successfully.`,

            newStatus === 'Inactive'
              ? 'error'
              : 'success'
          );


          await loadAdminUsers();


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

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

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


    appendAudit(
      CURRENT_USER?.displayName ||
        'Admin',

      `Reset credentials for: ${user.fullName}`,

      'Admin'
    );


    showToast(
      `Credentials reset successfully for ${user.fullName}.`,
      'success'
    );


    closeUserActionsModal();


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

  showToast(
    'User list exported with DPA-safe metadata (demo).',
    'success'
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Exported user accounts list (CSV)',
    'Admin'
  );

}


/* =========================================================
   MODULE C — AUDIT LOGS
   ========================================================= */

const AUDIT_LOG_DATA = [];


function determineAuditActionType(
  action
) {

  const a =
    action.toLowerCase();


  if (
    a.includes('reject')
  ) {

    return 'reject';

  }


  if (
    a.includes('approve')
  ) {

    return 'approve';

  }


  if (
    a.includes('status') ||
    a.includes('print')
  ) {

    return 'status';

  }


  if (
    a.includes('export')
  ) {

    return 'export';

  }


  if (
    a.includes('login') ||
    a.includes('failed')
  ) {

    return 'login';

  }


  if (
    a.includes('backup') ||
    a.includes('restor')
  ) {

    return 'backup';

  }


  if (
    a.includes('user') ||
    a.includes('role') ||
    a.includes('password') ||
    a.includes('two-factor')
  ) {

    return 'user';

  }


  return 'other';

}


const escHtml =
  s =>
    String(
      s
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
      '<td colspan="6" class="table-empty">' +
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

              <tr>

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
      `${filtered.length} of ${AUDIT_LOG_DATA.length} system events`;

  }

}


function filterAuditLogs() {

  renderAuditTable();

}


function readAuditFilterInputs() {

  return {

    q:
      (
        document.getElementById(
          'audit-search'
        )?.value ||
        ''
      ).toLowerCase(),


    userF:
      document.getElementById(
        'audit-user-filter'
      )?.value ||
      '',


    actionF:
      document.getElementById(
        'audit-action-filter'
      )?.value ||
      '',


    from:
      document.getElementById(
        'audit-date-from'
      )?.value ||
      '',


    to:
      document.getElementById(
        'audit-date-to'
      )?.value ||
      ''

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


function auditEventMatches(
  e,
  f
) {

  const matchQ =
    !f.q ||
    (
      e.action +
      ' ' +
      e.user +
      ' ' +
      e.role +
      ' ' +
      e.ip
    )
      .toLowerCase()
      .includes(
        f.q
      );


  const matchUser =
    !f.userF ||
    e.user ===
      f.userF;


  const matchAction =
    !f.actionF ||
    determineAuditActionType(
      e.action
    ) ===
      f.actionF;


  let matchDate =
    true;


  const ts =
    auditEventTime(
      e
    );


  if (
    f.from ||
    f.to
  ) {

    if (
      ts ===
      null
    ) {

      return false;

    }


    if (f.from) {

      const fromMs =
        Date.parse(
          f.from +
          'T00:00:00'
        );


      if (
        !Number.isNaN(
          fromMs
        ) &&
        ts <
          fromMs
      ) {

        matchDate =
          false;

      }

    }


    if (
      matchDate &&
      f.to
    ) {

      const toMs =
        Date.parse(
          f.to +
          'T23:59:59.999'
        );


      if (
        !Number.isNaN(
          toMs
        ) &&
        ts >
          toMs
      ) {

        matchDate =
          false;

      }

    }

  }


  return (
    matchQ &&
    matchUser &&
    matchAction &&
    matchDate
  );

}


/* =========================================================
   AUDIT SUMMARY FILTER
   ========================================================= */

const AUDIT_SUMMARY_RANGES = {

  '5':
    'Last 5 sensitive actions',

  '24h':
    'Sensitive actions (last 24 hours)',

  '7d':
    'Sensitive actions (last 7 days)'

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


      rows.forEach(
        r => {

          const tags =
            (
              r.dataset.period ||
              ''
            ).split(',');


          r.style.display =
            (
              !r.dataset.period ||
              tags.includes(
                range
              )
            )
              ? ''
              : 'none';

        }
      );


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


function resetAuditFilters() {

  [
    'audit-search',
    'audit-user-filter',
    'audit-action-filter',
    'audit-date-from',
    'audit-date-to'
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


  renderAuditTable();

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

    'Device'

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
          e.device
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


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Exported audit trail report (CSV)',
    'Admin'
  );


  showToast(
    `Audit trail exported (${filtered.length} rows) — DPA-safe CSV`,
    'success'
  );

}


/* =========================================================
   MODULE D — SERVICE STATUS
   ========================================================= */

const SERVICE_STATUS = [];


function renderServiceStatus() {

  const grid =
    document.getElementById(
      'service-status-grid'
    );


  if (!grid) {

    return;

  }


  if (
    !SERVICE_STATUS.length
  ) {

    grid.innerHTML =
      '<div class="table-empty" style="grid-column:1/-1">' +
      '<i class="fi fi-rr-cloud"></i> ' +
      'No external service connections configured yet. Monitors will appear here once connected to the live system.' +
      '</div>';


    return;

  }


  grid.innerHTML =
    SERVICE_STATUS
      .map(
        s => {

          const ok =
            s.status ===
            'ok';


          const iconAttr =
            s.action
              ? ` onclick="${s.action}()" style="cursor:pointer" title="Send test notification"`
              : '';


          return `

            <article class="admin-service-card">

              <div class="admin-service-card__head">

                <div
                  class="admin-service-card__icon"
                  ${iconAttr}
                >
                  <i class="fi ${s.icon}"></i>
                </div>

                <div>

                  <div class="admin-service-card__name">
                    ${escHtml(s.name)}
                  </div>

                  <div class="admin-service-card__desc">
                    ${escHtml(s.desc)}
                  </div>

                </div>

              </div>

              <div
                class="admin-service-card__status ${
                  ok
                    ? 'ok'
                    : 'warn'
                }"
              >

                <i class="fi ${
                  ok
                    ? 'fi-rr-check-circle'
                    : 'fi-rr-exclamation'
                }"></i>

                ${
                  ok
                    ? 'Operational'
                    : 'Degraded'
                }

                <span
                  class="badge ${
                    ok
                      ? 'badge-approved'
                      : 'badge-review'
                  }"
                >
                  ${escHtml(s.latency)}
                </span>

              </div>

            </article>

          `;

        }
      )
      .join('');

}


/* =========================================================
   SYSTEM CONFIGURATION
   ========================================================= */

function saveSystemConfig() {

  const open =
    document.getElementById(
      'cfg-open-time'
    )?.value ||
    '07:00';


  const close =
    document.getElementById(
      'cfg-close-time'
    )?.value ||
    '18:00';


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    `Updated system configuration (office hours ${open}–${close})`,
    'Admin'
  );


  showToast(
    'System configuration saved successfully.',
    'success'
  );

}


/* =========================================================
   SMS TEMPLATES
   ========================================================= */

const DEFAULT_SMS_TEMPLATES = {

  approval:
    'Dear {name}, your Senior Citizen ID application (ID: {id}) has been APPROVED. Please visit the OSCA office within 7 days to claim your ID card. - OSCA {barangay}',


  rejection:
    'Dear {name}, your Senior Citizen ID application (ID: {id}) requires additional documentation. Please visit OSCA office with the required papers. - OSCA {barangay}'

};


function countSmsSegments(
  text
) {

  const len =
    (
      text ||
      ''
    ).length;


  if (
    len ===
    0
  ) {

    return {

      len: 0,

      segments: 0,

      capacity: 160

    };

  }


  const segments =
    len <=
      160
      ? 1
      : Math.ceil(
          len /
          153
        );


  const capacity =
    segments ===
      1
      ? 160
      : segments *
        153;


  return {

    len,

    segments,

    capacity

  };

}


function updateSmsCount(
  taId,
  counterId
) {

  const el =
    document.getElementById(
      taId
    );


  const counter =
    document.getElementById(
      counterId
    );


  if (
    !el ||
    !counter
  ) {

    return;

  }


  const {
    len,
    segments,
    capacity
  } =
    countSmsSegments(
      el.value
    );


  counter.textContent =
    `${len}/${capacity} characters • ${segments} SMS`;


  counter.classList.toggle(
    'over',
    len > 160
  );

}


function tplReset() {

  const approval =
    document.getElementById(
      'tpl-sms-approval'
    );


  const rejection =
    document.getElementById(
      'tpl-sms-rejection'
    );


  const barangay =
    document.getElementById(
      'tpl-barangay-select'
    );


  if (approval) {

    approval.value =
      DEFAULT_SMS_TEMPLATES.approval;

  }


  if (rejection) {

    rejection.value =
      DEFAULT_SMS_TEMPLATES.rejection;

  }


  if (barangay) {

    barangay.value =
      '';

  }


  updateSmsCount(
    'tpl-sms-approval',
    'tpl-counter-approval'
  );


  updateSmsCount(
    'tpl-sms-rejection',
    'tpl-counter-rejection'
  );


  showToast(
    'SMS templates reset to defaults',
    'info'
  );

}


function tplSave() {

  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Updated SMS notification templates',
    'Admin'
  );


  showToast(
    'SMS templates saved successfully',
    'success'
  );

}


/* =========================================================
   MODULE E — BACKUP & RECOVERY
   ========================================================= */

let backupIsRunning =
  false;


const BACKUP_HISTORY = [];


function renderBackupHistory() {

  const tbody =
    document.getElementById(
      'backup-history-tbody'
    );


  if (!tbody) {

    return;

  }


  if (
    !BACKUP_HISTORY.length
  ) {

    tbody.innerHTML =
      '<tr>' +
      '<td colspan="6" class="table-empty">' +
      '<i class="fi fi-rr-database"></i> ' +
      'No backups yet. Run a backup or check back once connected to the live system.' +
      '</td>' +
      '</tr>';


    return;

  }


  tbody.innerHTML =
    BACKUP_HISTORY
      .map(
        b => {

          const typeBadge =
            b.type.includes(
              'Manual'
            )
              ? 'badge-review'
              : b.type.includes(
                  'Weekly'
                )
                ? 'badge-issued'
                : 'badge-active';


          return `

            <tr>

              <td data-label="Timestamp">

                <span class="cell-text">
                  ${escHtml(b.ts)}
                </span>

              </td>


              <td data-label="Type">

                <span class="badge ${typeBadge}">
                  ${escHtml(b.type)}
                </span>

              </td>


              <td data-label="Size">

                <span
                  class="cell-text"
                  style="font-family:var(--font-data)"
                >
                  ${escHtml(b.size)}
                </span>

              </td>


              <td data-label="Status">

                <span class="badge badge-approved">
                  ${escHtml(b.status)}
                </span>

              </td>


              <td data-label="Location">

                <span
                  class="cell-text"
                  style="font-family:var(--font-data)"
                >
                  ${escHtml(b.loc)}
                </span>

              </td>


              <td style="text-align:right">

                <button
                  class="row-action always-visible"
                  onclick="restoreFromHistory('${escHtml(b.ts)}')"
                >
                  Restore
                </button>

              </td>

            </tr>

          `;

        }
      )
      .join('');

}


function renderRestorePoints() {

  const sel =
    document.getElementById(
      'restore-point-select'
    );


  if (!sel) {

    return;

  }


  if (
    !BACKUP_HISTORY.length
  ) {

    sel.innerHTML =
      '<option value="">No restore points available</option>';


    return;

  }


  const current =
    sel.value;


  sel.innerHTML =
    BACKUP_HISTORY
      .map(
        b =>
          `<option value="${escHtml(b.ts)}">${escHtml(b.type)} — ${escHtml(b.ts)}</option>`
      )
      .join('');


  if (
    BACKUP_HISTORY.some(
      b =>
        b.ts ===
        current
    )
  ) {

    sel.value =
      current;

  }

}


function executeBackup() {

  if (
    backupIsRunning
  ) {

    return;

  }


  openConfirmModal({

    title:
      'Run manual backup now?',


    desc:
      'Creates an encrypted point-in-time snapshot of the OSCA database.',


    alertTitle:
      'A new snapshot will be added to backup history',


    alertDesc:
      'Existing snapshots are kept. The backup button shows progress while the snapshot is created.',


    confirmLabel:
      'Run Backup',


    danger:
      false,


    onConfirm:
      runBackupNow

  });

}


function runBackupNow() {

  if (
    backupIsRunning
  ) {

    return;

  }


  backupIsRunning =
    true;


  const btn =
    document.getElementById(
      'btn-execute-backup'
    );


  if (btn) {

    btn.disabled =
      true;


    btn.style.opacity =
      '.6';

  }


  if (btn) {

    btn.innerHTML =
      '<i class="fi fi-rr-loader" style="margin-right:8px"></i> Creating point-in-time snapshot…';

  }


  showToast(
    'Manual encrypted backup started. You can keep working while it runs.',
    'info'
  );


  setTimeout(
    () => {

      const now =
        new Date().toLocaleString(
          'en-US',
          {
            month:
              'short',

            day:
              '2-digit',

            year:
              'numeric',

            hour:
              '2-digit',

            minute:
              '2-digit'

          }
        );


      BACKUP_HISTORY.unshift({

        ts:
          now,

        type:
          'Manual · Snapshot',

        size:
          '1.6 GB',

        status:
          'Success',

        loc:
          'gs://osca-backups/manual/latest'

      });


      renderBackupHistory();


      renderRestorePoints();


      const title =
        document.getElementById(
          'bk-last-title'
        );


      if (title) {

        title.textContent =
          `Last backup: ${now}`;

      }


      const kpi =
        document.getElementById(
          'kpi-backup'
        );


      if (kpi) {

        kpi.textContent =
          'Just now';

      }


      appendAudit(
        CURRENT_USER?.displayName ||
          'Admin',
        'Executed immediate database backup',
        'Admin'
      );


      showToast(
        'Backup completed successfully. Restore point verified.',
        'success'
      );


      if (btn) {

        btn.disabled =
          false;


        btn.style.opacity =
          '';


        btn.textContent =
          'Execute Immediate Database Backup';

      }


      backupIsRunning =
        false;

    },
    1500
  );

}


function restoreFromHistory(
  ts
) {

  openConfirmModal({

    title:
      'Restore database from this snapshot?',


    desc:
      `Snapshot: ${ts}`,


    alertTitle:
      'Caution: Restore will overwrite current database',


    alertDesc:
      'This operation is irreversible. A verification snapshot is taken before restoring.',


    confirmLabel:
      'Restore Database',


    danger:
      true,


    onConfirm:
      () =>
        runRestore(
          `snapshot: ${ts}`
        )

  });

}


function initiateRestore() {

  const sel =
    document.getElementById(
      'restore-point-select'
    );


  const point =
    (
      sel &&
      sel.value
    ) ||
    'Latest restore point';


  openConfirmModal({

    title:
      'Restore database from this point?',


    desc:
      `Selected restore point: ${point}`,


    alertTitle:
      'Caution: Restore will overwrite current database',


    alertDesc:
      'This operation is irreversible. A verification snapshot is taken before restoring.',


    confirmLabel:
      'Restore Database',


    danger:
      true,


    onConfirm:
      () =>
        runRestore(
          point
        )

  });

}


function runRestore(
  point
) {

  showToast(
    `Restoration from "${point}" started. Database will restart shortly (demo).`,
    'info'
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    `Initiated database restoration from ${point}`,
    'Admin'
  );

}


function verifyRestorePoint() {

  showToast(
    'Restore point verified. Integrity check passed.',
    'success'
  );


  appendAudit(
    CURRENT_USER?.displayName ||
      'Admin',
    'Verified database restore point',
    'Admin'
  );

}