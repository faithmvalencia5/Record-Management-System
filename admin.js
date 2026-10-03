// Admin portal logic

document.addEventListener('DOMContentLoaded', () => {
  // Restore the persisted Audit Log Summary range before the first paint.
  filterAuditLog(readAuditSummaryRange(), { instant: true });

  setTimeout(() => {
    renderUserMgmtTable();
    renderAuditTable();
    renderBackupHistory();
    renderRestorePoints();
    renderServiceStatus();
  }, 100);

  ['approval', 'rejection'].forEach(kind => {
    const ta = document.getElementById('tpl-sms-' + kind);
    if (ta) ta.addEventListener('input', () => updateSmsCount('tpl-sms-' + kind, 'tpl-counter-' + kind));
  });
  updateSmsCount('tpl-sms-approval', 'tpl-counter-approval');
  updateSmsCount('tpl-sms-rejection', 'tpl-counter-rejection');

  // Confirmation modal — dismiss on backdrop click / Escape
  const confirmModalEl = document.getElementById('confirm-modal');
  if (confirmModalEl) confirmModalEl.addEventListener('click', (e) => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeConfirmModal();
  });
});

/* ── Confirmation modal (destructive backup / restore actions) ── */
let confirmModalHandler = null;

function openConfirmModal(opts = {}) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || ''; };
  setText('cf-modal-title', opts.title || 'Confirm action');
  setText('cf-modal-desc', opts.desc || '');
  setText('cf-modal-alert-title', opts.alertTitle || '');
  setText('cf-modal-alert-desc', opts.alertDesc || '');
  const btn = document.getElementById('cf-modal-confirm');
  if (btn) {
    btn.textContent = opts.confirmLabel || 'Confirm';
    const danger = opts.danger !== false;
    btn.classList.toggle('btn--danger', danger);
    btn.classList.toggle('btn--primary', !danger);
  }
  confirmModalHandler = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
  modal.classList.add('show');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal')?.classList.remove('show');
  confirmModalHandler = null;
}

function runConfirmAction() {
  const handler = confirmModalHandler;
  closeConfirmModal();
  if (handler) handler();
}

/* ── Quick Action bar shortcuts (Dashboard) ── */
function quickAddUser() {
  openUserModal('new');
}

function quickBackup() {
  executeBackup();
}

function quickExportSecurityLogs() {
  exportAuditReport();
}

function inviteUser() {
  showToast('User invitation sent! (demo)', 'success');
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Invited new user', 'Admin');
}

function sendDemoNotification() {
  showToast('Test SMS sent to applicant (demo)', 'success');
  addNotifyLog('—', 'Gateway test notification', 'SMS', 'Delivered');
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Tested SMS/Email gateway', 'Admin');
}

function updateUserRole(key, newRole) {
  if (!DEMO_USERS[key]) return;
  DEMO_USERS[key].role = newRole;
  appendAudit(CURRENT_USER?.displayName || 'Admin', `Changed ${DEMO_USERS[key].displayName} role to ${newRole}`, 'Admin');
  showToast(`Role updated: ${DEMO_USERS[key].displayName} → ${newRole}`, 'success');
}

function runSystemBackup() {
  showToast('Manual encrypted backup started. You can keep working while it runs.', 'info');
  setTimeout(() => showToast('Backup completed successfully. Restore point verified.', 'success'), 900);
}

/* NEW: Dedicated Admin Console modules (B / C / D / E) */

// Personnel accounts for Module B (RBAC)
/* Admin user accounts bootstrap */
const ADMIN_USER_ACCOUNTS = [];
let editingUserKey = null;

function roleColorMap(role) {
  const colors = { Admin: 'linear-gradient(135deg,#E0E9FF,#93B4FF)', Staff: 'linear-gradient(135deg,#FDE68A,#D97706)', 'ID Maker': 'linear-gradient(135deg,#C4B5FD,#7140D8)' };
  return colors[role] || colors.Staff;
}

function renderUserMgmtTable() {
  const tbody = document.getElementById('user-mgmt-tbody');
  if (!tbody) return;
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  const roleF = document.getElementById('user-role-filter')?.value || '';
  const statusF = document.getElementById('user-status-filter')?.value || '';

  const filtered = ADMIN_USER_ACCOUNTS.filter(u => {
    const matchQ = !q || (u.fullName + ' ' + u.username + ' ' + u.role + ' ' + u.designation).toLowerCase().includes(q);
    const matchRole = !roleF || u.role === roleF;
    const matchStatus = !statusF || u.status === statusF;
    return matchQ && matchRole && matchStatus;
  });

  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fi fi-rr-users"></i> No user accounts yet. They will appear here once connected to the live system.</td></tr>';
  }
  filtered.forEach(u => {
    const initials = u.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isActive = u.status === 'Active';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="User"><div class="applicant-cell"><div class="applicant-avatar" style="background:${roleColorMap(u.role)}">${initials}</div><div class="applicant-info"><span class="applicant-name" title="${u.fullName}">${u.fullName}</span><span class="applicant-id" title="${u.email}">${u.email}</span></div></div></td>
      <td data-label="Username"><span class="cell-text" title="${u.username}">${u.username}</span></td>
      <td data-label="Role"><span class="badge ${u.role === 'Admin' ? 'badge-issued' : u.role === 'Staff' ? 'badge-active' : 'badge-review'}">${u.role}</span></td>
      <td data-label="Position"><span class="cell-text" title="${u.designation}">${u.designation}</span></td>
      <td data-label="Status"><span class="badge status-pill ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}"><span class="status-dot ${isActive ? 'dot-active' : 'dot-inactive'}"></span>${u.status}</span></td>
      <td data-label="Last Active"><span class="cell-text" title="${u.lastActive}">${u.lastActive}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <div class="row-actions">
          <button class="icon-btn" title="Edit Account" aria-label="Edit Account" onclick="editUser('${u.key}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
          <button class="icon-btn" title="Reset Password" aria-label="Reset Password" onclick="openUserActions('${u.key}')"><i class="fi fi-rr-rotate-left"></i></button>
          <button class="icon-btn ${isActive ? 'danger' : 'success'}" title="${isActive ? 'Disable Account' : 'Enable Account'}" aria-label="${isActive ? 'Disable' : 'Enable'} Account" onclick="toggleMgmtUserStatus('${u.key}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  const footer = document.getElementById('user-mgmt-footer');
  if (footer) footer.textContent = `Showing ${filtered.length} of ${ADMIN_USER_ACCOUNTS.length} accounts`;
  const totalEl = document.getElementById('users-total'); if (totalEl) totalEl.textContent = ADMIN_USER_ACCOUNTS.length;
  const activeEl = document.getElementById('users-active'); if (activeEl) activeEl.textContent = ADMIN_USER_ACCOUNTS.filter(u => u.status === 'Active').length;
  const inactiveEl = document.getElementById('users-inactive'); if (inactiveEl) inactiveEl.textContent = ADMIN_USER_ACCOUNTS.filter(u => u.status !== 'Active').length;
  const idmEl = document.getElementById('users-idmaker'); if (idmEl) idmEl.textContent = ADMIN_USER_ACCOUNTS.filter(u => u.role === 'ID Maker').length;
}

function filterUsers() {
  renderUserMgmtTable();
}

function openUserModal(mode, key) {
  editingUserKey = (mode === 'edit') ? key : null;
  const title = document.getElementById('user-modal-title');
  const sub = document.getElementById('user-modal-sub');
  title.textContent = editingUserKey ? 'Edit User' : 'Add New User';
  sub.textContent = editingUserKey ? 'Update OSCA personnel account' : 'Register OSCA personnel';

  if (editingUserKey) {
    const u = ADMIN_USER_ACCOUNTS.find(x => x.key === key);
    if (u) {
      document.getElementById('um-fullname').value = u.fullName;
      document.getElementById('um-designation').value = u.designation;
      document.getElementById('um-username').value = u.username;
      document.getElementById('um-email').value = u.email;
      document.getElementById('um-role').value = u.role;
      document.getElementById('um-status').value = u.status;
      document.getElementById('um-password').value = '';
    }
  } else {
    ['um-fullname', 'um-designation', 'um-username', 'um-email', 'um-password'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('um-role').value = 'Staff';
    document.getElementById('um-status').value = 'Active';
  }
  updateRolePermHint();
  document.getElementById('user-modal').classList.add('show');
}

function closeUserModal() {
  document.getElementById('user-modal')?.classList.remove('show');
}

function updateRolePermHint() {
  const role = document.getElementById('um-role')?.value || 'Staff';
  const textEl = document.getElementById('role-perm-hint-text');
  if (!textEl) return;
  if (role === 'ID Maker') {
    textEl.textContent = 'OSCA ID Maker accounts are locked to printing functionalities (print queue, status updates, and card production only). No application review or export access.';
  } else if (role === 'Admin') {
    textEl.textContent = 'Admin accounts receive full access: user management, audit logs, system configuration, backups, and all review capabilities.';
  } else {
    textEl.textContent = 'OSCA Staff accounts receive application review access (approve/reject/export), applicant management, and ID issuance.';
  }
}

function isStrongPassword(password) {
  const value = String(password || '');

  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function validatePasswordField(
  inputId,
  errorId = 'um-password-error'
) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);

  if (!input) return false;

  const password = input.value || '';

  if (!isStrongPassword(password)) {

    if (error) {
      error.textContent =
        'Password must be at least 8 characters and include at least one capital letter, one number, and one special character.';
      error.style.display = 'block';
    }

    input.setCustomValidity(
      'Password must be at least 8 characters and include at least one capital letter, one number, and one special character.'
    );

    return false;
  }

  if (error) {
    error.textContent = '';
    error.style.display = 'none';
  }

  input.setCustomValidity('');

  return true;
}

function saveUser() {
  const fullName = document.getElementById('um-fullname').value.trim();
  const username = document.getElementById('um-username').value.trim();
  const password = document.getElementById('um-password')?.value || '';
  if (!fullName || !username) {
    showToast('Full Name and Username are required.', 'error');
    return;
  }

  // Password is required when creating a new account.
  if (!editingUserKey && !password) {
    showToast(
      'A strong password is required for new accounts.',
      'error'
    );

    document.getElementById('um-password')?.focus();
    return;
  }

  // If a password is entered during editing,
  // it must also follow the strong-password rule.
  if (password && !isStrongPassword(password)) {
    showToast(
      'Password must be at least 8 characters and include a capital letter, a number, and a special character.',
      'error'
    );

    document.getElementById('um-password')?.focus();
    return;
  }

  const role = document.getElementById('um-role').value;
  const status = document.getElementById('um-status').value;
  const designation = document.getElementById('um-designation').value.trim() || (role === 'ID Maker' ? 'ID Card Producer' : 'OSCA Staff');

  if (editingUserKey) {
    const u = ADMIN_USER_ACCOUNTS.find(x => x.key === editingUserKey);
    if (u) {
      u.fullName = fullName; u.username = username; u.role = role; u.status = status;
      u.designation = designation;
      u.email = document.getElementById('um-email').value.trim() || u.email;
    }
    appendAudit(CURRENT_USER?.displayName || 'Admin', `Updated user: ${fullName} (role → ${role})`, 'Admin');
    showToast(`User ${fullName} updated successfully`, 'success');
  } else {
    ADMIN_USER_ACCOUNTS.push({ key: 'u' + Date.now(), fullName, username, designation, role, email: document.getElementById('um-email').value.trim(), status, lastActive: 'Never logged in' });
    appendAudit(CURRENT_USER?.displayName || 'Admin', `Created user: ${fullName} (${role})`, 'Admin');
    showToast(`User ${fullName} created successfully`, 'success');
  }
  closeUserModal();
  renderUserMgmtTable();
  renderAuditUserFilter();
}

function editUser(key) {
  openUserModal('edit', key);
}

function toggleMgmtUserStatus(key) {
  const u = ADMIN_USER_ACCOUNTS.find(x => x.key === key);
  if (!u) return;
  u.status = u.status === 'Active' ? 'Inactive' : 'Active';
  appendAudit(CURRENT_USER?.displayName || 'Admin', `${u.status === 'Inactive' ? 'Deactivated' : 'Reactivated'} user: ${u.fullName}`, 'Admin');
  showToast(`${u.fullName} ${u.status === 'Inactive' ? 'deactivated' : 'reactivated'} (history preserved)`, u.status === 'Inactive' ? 'error' : 'success');
  renderUserMgmtTable();
}

function openUserActions(key) {
  window._resetUserKey = key;
  const u = ADMIN_USER_ACCOUNTS.find(x => x.key === key);
  document.getElementById('ua-modal-title').textContent = `Reset Credentials — ${u ? u.fullName : ''}`;
  document.getElementById('ua-modal-desc').textContent = 'Force a secure login credential update for this account.';
  setResetPassword(generateTempPassword());
  document.getElementById('user-actions-modal').classList.add('show');
}

/* ── Reset credentials: random, masked temporary password ── */
function generateTempPassword(length = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?+='];
  const all = sets.join('');
  const rand = (max) => {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  // Guarantee one character from each class, fill, then shuffle.
  const chars = sets.map(s => s[rand(s.length)]);
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function setResetPassword(value) {
  const input = document.getElementById('ua-new-password');
  if (input) { input.value = value; input.type = 'password'; }
  const icon = document.querySelector('#ua-pw-reveal i');
  if (icon) { icon.classList.add('fi-rr-eye'); icon.classList.remove('fi-rr-eye-crossed'); }
}

function regenerateResetPassword() {
  setResetPassword(generateTempPassword());
  showToast('New temporary password generated.', 'info');
}

function toggleResetPwVisibility() {
  const input = document.getElementById('ua-new-password');
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  const icon = document.querySelector('#ua-pw-reveal i');
  if (icon) {
    icon.classList.toggle('fi-rr-eye', !reveal);
    icon.classList.toggle('fi-rr-eye-crossed', reveal);
  }
}

function closeUserActionsModal() {
  document.getElementById('user-actions-modal')?.classList.remove('show');
}

function resetUserCredentials() {
  const key = window._resetUserKey;
  const u = ADMIN_USER_ACCOUNTS.find(x => x.key === key);
  const input = document.getElementById('ua-new-password');
  const newPassword = ((input && input.value) || '').trim();
  if (!newPassword) {
    showToast('Generate a temporary password before resetting credentials.', 'error');
    return;
  }
  if (!isStrongPassword(newPassword)) {
    showToast(
      'Password must be at least 8 characters and include a capital letter, a number, and a special character.',
      'error'
    );

    input?.focus();
    return;
  }
  if (u) {
    appendAudit(CURRENT_USER?.displayName || 'Admin', `Reset credentials for: ${u.fullName}`, 'Admin');
    // The password itself is never echoed to toasts/logs — it stays masked in the modal.
    showToast(`Credentials reset for ${u.fullName}. Password change forced on next login.`, 'success');
  }
  closeUserActionsModal();
}

function exportUsers() {
  showToast('User list exported with DPA-safe metadata (demo).', 'success');
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Exported user accounts list (CSV)', 'Admin');
}

/* ── Module C: Audit Logs
   AUDIT_LOG_DATA — EMPTY bootstrap.
   All demo log events have been removed. Each audit entry keeps
   the shape: { ts, user, role, action, ip, device } so the table
   can render events from the other application system (e.g. a
   tamper-proof audit endpoint).
   TODO(integration): load audit events from the live system.
*/

const AUDIT_LOG_DATA = [];

function determineAuditActionType(action) {
  const a = action.toLowerCase();
  // Rejections are tested FIRST — a string like "Status Updated: Rejected"
  // contains both "status" and "rejected", and was previously bucketed as
  // 'approve' (via the old approve||rejected rule) or 'status'.
  if (a.includes('reject')) return 'reject';
  if (a.includes('approve')) return 'approve';
  if (a.includes('status') || a.includes('print')) return 'status';
  if (a.includes('export')) return 'export';
  if (a.includes('login') || a.includes('failed')) return 'login';
  if (a.includes('backup') || a.includes('restor')) return 'backup';
  if (a.includes('user') || a.includes('role') || a.includes('password') || a.includes('two-factor')) return 'user';
  return 'other';
}
/*
   AUDIT USER FILTER — populated from ADMIN_USER_ACCOUNTS
   (plus any audit-only actors such as "System").
*/

const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderAuditUserFilter() {
  const sel = document.getElementById('audit-user-filter');
  if (!sel) return;
  const current = sel.value;
  const names = [];
  ADMIN_USER_ACCOUNTS.forEach(u => { if (u.fullName && !names.includes(u.fullName)) names.push(u.fullName); });
  AUDIT_LOG_DATA.forEach(e => { if (e.user && !names.includes(e.user)) names.push(e.user); });
  sel.innerHTML = '<option value="">All Users</option>' +
    names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = names.includes(current) ? current : ''; // safe fallback: All Users
}

function renderAuditTable() {
  renderAuditUserFilter();
  const tbody = document.getElementById('audit-logs-tbody');
  if (!tbody) return;
  const f = readAuditFilterInputs();

  const filtered = AUDIT_LOG_DATA.filter(e => auditEventMatches(e, f));

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fi fi-rr-shield-check"></i> No audit events yet. They will appear here once connected to the live system.</td></tr>';
  } else {
    tbody.innerHTML = filtered.map(e => {
      const roleBadge = e.role === 'Admin' ? 'badge-issued' : (e.role === 'ID Maker' ? 'badge-review' : (e.role === 'System' ? 'badge-inactive' : 'badge-active'));
      return `<tr>
        <td data-label="Time"><span class="cell-text">${e.ts}</span></td>
        <td data-label="User"><span class="cell-text">${e.user}</span></td>
        <td data-label="Role"><span class="badge ${roleBadge}">${e.role}</span></td>
        <td data-label="Action"><span class="cell-text">${e.action}</span></td>
        <td data-label="IP Address"><span class="cell-text" style="font-family:var(--font-data)">${e.ip}</span></td>
        <td data-label="Device"><span class="cell-text">${e.device}</span></td>
      </tr>`;
    }).join('');
  }

  const footer = document.getElementById('audit-logs-footer');
  if (footer) footer.textContent = `Showing ${filtered.length} of ${AUDIT_LOG_DATA.length} events`;
  const label = document.getElementById('audit-count-label');
  if (label) label.textContent = `${filtered.length} of ${AUDIT_LOG_DATA.length} system events`;
}

function filterAuditLogs() { renderAuditTable(); }

/* ── Shared filter predicate (used by the table AND the CSV export) ── */
function readAuditFilterInputs() {
  return {
    q: (document.getElementById('audit-search')?.value || '').toLowerCase(),
    userF: document.getElementById('audit-user-filter')?.value || '',
    actionF: document.getElementById('audit-action-filter')?.value || '',
    from: document.getElementById('audit-date-from')?.value || '',
    to: document.getElementById('audit-date-to')?.value || ''
  };
}

/* e.ts is a display string ("Apr 08, 2026, 10:18 AM") produced by
   appendAudit()/toLocaleString, or an ISO string from the live system —
   Date.parse handles both in modern browsers. Parsed once per entry. */
function auditEventTime(e) {
  if (e._tsMs === undefined) {
    const parsed = (e.ts instanceof Date) ? e.ts.getTime() : Date.parse(e.ts);
    e._tsMs = Number.isNaN(parsed) ? null : parsed;
  }
  return e._tsMs;
}

function auditEventMatches(e, f) {
  const matchQ = !f.q || (e.action + ' ' + e.user + ' ' + e.role + ' ' + e.ip).toLowerCase().includes(f.q);
  const matchUser = !f.userF || e.user === f.userF;
  const matchAction = !f.actionF || determineAuditActionType(e.action) === f.actionF;

  // Date range — inclusive on both ends (from 00:00:00.000 → to 23:59:59.999).
  let matchDate = true;
  const ts = auditEventTime(e);
  if (f.from || f.to) {
    if (ts === null) return false; // can't verify a dated entry against a date filter
    if (f.from) {
      const fromMs = Date.parse(f.from + 'T00:00:00');
      if (!Number.isNaN(fromMs) && ts < fromMs) matchDate = false;
    }
    if (matchDate && f.to) {
      const toMs = Date.parse(f.to + 'T23:59:59.999');
      if (!Number.isNaN(toMs) && ts > toMs) matchDate = false;
    }
  }
  return matchQ && matchUser && matchAction && matchDate;
}

/* ── Audit Log Summary: dropdown range filter (persisted + micro-state) ── */
const AUDIT_SUMMARY_RANGES = {
  '5': 'Last 5 sensitive actions',
  '24h': 'Sensitive actions (last 24 hours)',
  '7d': 'Sensitive actions (last 7 days)'
};
const AUDIT_SUMMARY_DEFAULT_RANGE = '5';
const AUDIT_SUMMARY_STORAGE_KEY = 'osca.auditSummaryRange';
const AUDIT_SUMMARY_FADE_MS = 160;
let auditSummaryTimer = null;

function readAuditSummaryRange() {
  try {
    const saved = window.localStorage.getItem(AUDIT_SUMMARY_STORAGE_KEY);
    return AUDIT_SUMMARY_RANGES[saved] ? saved : AUDIT_SUMMARY_DEFAULT_RANGE;
  } catch (_err) {
    return AUDIT_SUMMARY_DEFAULT_RANGE;
  }
}

function persistAuditSummaryRange(period) {
  try { window.localStorage.setItem(AUDIT_SUMMARY_STORAGE_KEY, period); }
  catch (_err) { /* private mode — preference just won't persist */ }
}

function setAuditSummaryUpdating(updating) {
  const body = document.querySelector('#audit-summary-tbody')?.closest('.log-card__body');
  if (body) {
    body.classList.toggle('is-updating', updating);
    body.setAttribute('aria-busy', updating ? 'true' : 'false');
  }
  const filter = document.getElementById('audit-summary-filter');
  if (filter) filter.classList.toggle('is-loading', updating);
}

function filterAuditLog(period, options = {}) {
  const range = AUDIT_SUMMARY_RANGES[period] ? period : AUDIT_SUMMARY_DEFAULT_RANGE;

  // Control state: select value, active cue, reset visibility, persistence
  const select = document.getElementById('audit-summary-range');
  if (select && select.value !== range) select.value = range;
  const isFiltered = range !== AUDIT_SUMMARY_DEFAULT_RANGE;
  const filter = document.getElementById('audit-summary-filter');
  if (filter) filter.classList.toggle('is-filtered', isFiltered);
  const reset = document.getElementById('audit-summary-reset');
  if (reset) reset.hidden = !isFiltered;
  persistAuditSummaryRange(range);

  const apply = () => {
    const rows = document.querySelectorAll('#audit-summary-tbody tr');
    rows.forEach(r => {
      const tags = (r.dataset.period || '').split(',');
      r.style.display = (!r.dataset.period || tags.includes(range)) ? '' : 'none';
    });
    const label = document.getElementById('audit-summary-sub');
    if (label) {
      const visible = Array.from(rows).filter(r => r.style.display !== 'none').length;
      const total = rows.length;
      label.textContent = AUDIT_SUMMARY_RANGES[range];
      if (isFiltered && total && visible < total) label.textContent += ` · ${visible}/${total} shown`;
    }
    setAuditSummaryUpdating(false);
  };

  clearTimeout(auditSummaryTimer);
  if (options.instant) { apply(); return; }
  setAuditSummaryUpdating(true); // fade / loading micro-state while switching
  auditSummaryTimer = setTimeout(apply, AUDIT_SUMMARY_FADE_MS);
}

function resetAuditLogFilter() {
  filterAuditLog(AUDIT_SUMMARY_DEFAULT_RANGE);
  showToast('Audit summary filter reset to default', 'info');
}

function exportAuditLog() {
  const rows = Array.from(document.querySelectorAll('#audit-summary-tbody tr')).filter(r => r.style.display !== 'none');
  const data = rows.map(r =>
    Array.from(r.querySelectorAll('td')).slice(0, 3)
      .map(td => csvCell(td.textContent)).join(',')
  );
  downloadCsvFile(`audit-summary-${new Date().toISOString().slice(0, 10)}.csv`, ['Time', 'User', 'Action'], data);
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Exported audit summary (CSV)', 'Admin');
  showToast('Audit summary exported (' + rows.length + ' rows) — DPA-safe CSV', 'success');
}

function resetAuditFilters() {
  ['audit-search', 'audit-user-filter', 'audit-action-filter', 'audit-date-from', 'audit-date-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderAuditTable();
}

/* ── CSV helpers shared by the summary widget and the audit page ── */
function csvCell(v) {
  return String(v ?? '').replace(/,/g, ';').trim();
}

function downloadCsvFile(filename, header, rows) {
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* Dedicated Audit Logs page export — real CSV of the audit trail,
   honoring the currently active filters (search / user / action / dates). */
function exportAuditReport() {
  const f = readAuditFilterInputs();
  const filtered = AUDIT_LOG_DATA.filter(e => auditEventMatches(e, f));
  const header = ['Time', 'User', 'Role', 'Action', 'IP Address', 'Device'];
  const data = filtered.map(e => [e.ts, e.user, e.role, e.action, e.ip, e.device].map(csvCell).join(','));
  downloadCsvFile(`audit-trail-${new Date().toISOString().slice(0, 10)}.csv`, header, data);
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Exported audit trail report (CSV)', 'Admin');
  showToast(`Audit trail exported (${filtered.length} rows) — DPA-safe CSV`, 'success');
}

/* ── Module D: AI & API Service Status
   SERVICE_STATUS — EMPTY bootstrap.
   All demo service monitors have been removed. Each entry keeps
   the shape: { name, desc, icon, status, latency, action? }
   (status: 'ok' | 'warn'; action: optional global fn name for
   the card icon) so the grid can render monitors from the other
   application system (e.g. GET /services/status).
   TODO(integration): load service status from the live system.
*/

const SERVICE_STATUS = [];

function renderServiceStatus() {
  const grid = document.getElementById('service-status-grid');
  if (!grid) return;
  if (!SERVICE_STATUS.length) {
    grid.innerHTML = '<div class="table-empty" style="grid-column:1/-1"><i class="fi fi-rr-cloud"></i> No external service connections configured yet. Monitors will appear here once connected to the live system.</div>';
    return;
  }
  grid.innerHTML = SERVICE_STATUS.map(s => {
    const ok = s.status === 'ok';
    const iconAttr = s.action ? ` onclick="${s.action}()" style="cursor:pointer" title="Send test notification"` : '';
    return `<article class="admin-service-card">
      <div class="admin-service-card__head">
        <div class="admin-service-card__icon"${iconAttr}><i class="fi ${s.icon}"></i></div>
        <div>
          <div class="admin-service-card__name">${s.name}</div>
          <div class="admin-service-card__desc">${s.desc}</div>
        </div>
      </div>
      <div class="admin-service-card__status ${ok ? 'ok' : 'warn'}"><i class="fi ${ok ? 'fi-rr-check-circle' : 'fi-rr-exclamation'}"></i> ${ok ? 'Operational' : 'Degraded'}
        <span class="badge ${ok ? 'badge-approved' : 'badge-review'}">${s.latency}</span></div>
    </article>`;
  }).join('');
}

/* ── Module D: System Configuration ── */
function saveSystemConfig() {
  const open = document.getElementById('cfg-open-time')?.value || '07:00';
  const close = document.getElementById('cfg-close-time')?.value || '18:00';
  appendAudit(CURRENT_USER?.displayName || 'Admin', `Updated system configuration (office hours ${open}–${close})`, 'Admin');
  showToast('System configuration saved successfully.', 'success');
}

/* ── Module D: SMS template counters & actions ── */
const DEFAULT_SMS_TEMPLATES = {
  approval: 'Dear {name}, your Senior Citizen ID application (ID: {id}) has been APPROVED. Please visit the OSCA office within 7 days to claim your ID card. - OSCA {barangay}',
  rejection: 'Dear {name}, your Senior Citizen ID application (ID: {id}) requires additional documentation. Please visit OSCA office with the required papers. - OSCA {barangay}'
};

function countSmsSegments(text) {
  const len = (text || '').length;
  if (len === 0) return { len: 0, segments: 0, capacity: 160 };
  const segments = len <= 160 ? 1 : Math.ceil(len / 153);
  const capacity = segments === 1 ? 160 : segments * 153;
  return { len, segments, capacity };
}

function updateSmsCount(taId, counterId) {
  const el = document.getElementById(taId);
  const counter = document.getElementById(counterId);
  if (!el || !counter) return;
  const { len, segments, capacity } = countSmsSegments(el.value);
  counter.textContent = `${len}/${capacity} characters • ${segments} SMS`;
  counter.classList.toggle('over', len > 160);
}

function tplReset() {
  const approval = document.getElementById('tpl-sms-approval');
  const rejection = document.getElementById('tpl-sms-rejection');
  const barangay = document.getElementById('tpl-barangay-select');
  if (approval) approval.value = DEFAULT_SMS_TEMPLATES.approval;
  if (rejection) rejection.value = DEFAULT_SMS_TEMPLATES.rejection;
  if (barangay) barangay.value = '';
  updateSmsCount('tpl-sms-approval', 'tpl-counter-approval');
  updateSmsCount('tpl-sms-rejection', 'tpl-counter-rejection');
  showToast('SMS templates reset to defaults', 'info');
}

function tplSave() {
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Updated SMS notification templates', 'Admin');
  showToast('SMS templates saved successfully', 'success');
}

/* ── Module E: Backup & Recovery
let backupIsRunning = false;
   BACKUP_HISTORY — EMPTY bootstrap.
   All demo backup records have been removed. Each entry keeps the
   shape: { ts, type, size, status, loc } so the history table can
   render backups from the other application system.
   TODO(integration): load backup history from the live system.
*/
const BACKUP_HISTORY = [];

function renderBackupHistory() {
  const tbody = document.getElementById('backup-history-tbody');
  if (!tbody) return;
  if (!BACKUP_HISTORY.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fi fi-rr-database"></i> No backups yet. Run a backup or check back once connected to the live system.</td></tr>';
    return;
  }
  tbody.innerHTML = BACKUP_HISTORY.map(b => {
    const typeBadge = b.type.includes('Manual') ? 'badge-review' : (b.type.includes('Weekly') ? 'badge-issued' : 'badge-active');
    return `<tr>
      <td data-label="Timestamp"><span class="cell-text">${b.ts}</span></td>
      <td data-label="Type"><span class="badge ${typeBadge}">${b.type}</span></td>
      <td data-label="Size"><span class="cell-text" style="font-family:var(--font-data)">${b.size}</span></td>
      <td data-label="Status"><span class="badge badge-approved">${b.status}</span></td>
      <td data-label="Location"><span class="cell-text" style="font-family:var(--font-data)">${b.loc}</span></td>
      <td style="text-align:right"><button class="row-action always-visible" onclick="restoreFromHistory('${b.ts}')">Restore</button></td>
    </tr>`;
  }).join('');
}
/*
   RESTORE POINT SELECT — options are bound to BACKUP_HISTORY
   (newest first) instead of hardcoded literals.
*/

function renderRestorePoints() {
  const sel = document.getElementById('restore-point-select');
  if (!sel) return;
  if (!BACKUP_HISTORY.length) {
    sel.innerHTML = '<option value="">No restore points available</option>';
    return;
  }
  const current = sel.value;
  sel.innerHTML = BACKUP_HISTORY.map(b => `<option value="${b.ts}">${b.type} — ${b.ts}</option>`).join('');
  if (BACKUP_HISTORY.some(b => b.ts === current)) sel.value = current;
}

function executeBackup() {
  if (backupIsRunning) return;
  openConfirmModal({
    title: 'Run manual backup now?',
    desc: 'Creates an encrypted point-in-time snapshot of the OSCA database.',
    alertTitle: 'A new snapshot will be added to backup history',
    alertDesc: 'Existing snapshots are kept. The backup button shows progress while the snapshot is created.',
    confirmLabel: 'Run Backup',
    danger: false,
    onConfirm: runBackupNow
  });
}

function runBackupNow() {
  if (backupIsRunning) return;
  backupIsRunning = true;
  const btn = document.getElementById('btn-execute-backup');
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
  if (btn) btn.innerHTML = '<i class="fi fi-rr-loader" style="margin-right:8px"></i> Creating point-in-time snapshot…';
  showToast('Manual encrypted backup started. You can keep working while it runs.', 'info');

  setTimeout(() => {
    const now = new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    BACKUP_HISTORY.unshift({ ts: now, type: 'Manual · Snapshot', size: '1.6 GB', status: 'Success', loc: 'gs://osca-backups/manual/latest' });
    renderBackupHistory();
    renderRestorePoints();
    const title = document.getElementById('bk-last-title');
    if (title) title.textContent = `Last backup: ${now}`;
    const kpi = document.getElementById('kpi-backup');
    if (kpi) kpi.textContent = 'Just now';
    appendAudit(CURRENT_USER?.displayName || 'Admin', 'Executed immediate database backup', 'Admin');
    showToast('Backup completed successfully. Restore point verified.', 'success');
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = 'Execute Immediate Database Backup'; }
    backupIsRunning = false;
  }, 1500);
}

function restoreFromHistory(ts) {
  openConfirmModal({
    title: 'Restore database from this snapshot?',
    desc: `Snapshot: ${ts}`,
    alertTitle: 'Caution: Restore will overwrite current database',
    alertDesc: 'This operation is irreversible. A verification snapshot is taken before restoring.',
    confirmLabel: 'Restore Database',
    danger: true,
    onConfirm: () => runRestore(`snapshot: ${ts}`)
  });
}

function initiateRestore() {
  const sel = document.getElementById('restore-point-select');
  const point = (sel && sel.value) || 'Latest restore point';
  openConfirmModal({
    title: 'Restore database from this point?',
    desc: `Selected restore point: ${point}`,
    alertTitle: 'Caution: Restore will overwrite current database',
    alertDesc: 'This operation is irreversible. A verification snapshot is taken before restoring.',
    confirmLabel: 'Restore Database',
    danger: true,
    onConfirm: () => runRestore(point)
  });
}

function runRestore(point) {
  showToast(`Restoration from "${point}" started. Database will restart shortly (demo).`, 'info');
  appendAudit(CURRENT_USER?.displayName || 'Admin', `Initiated database restoration from ${point}`, 'Admin');
}

function verifyRestorePoint() {
  showToast('Restore point verified. Integrity check passed.', 'success');
  appendAudit(CURRENT_USER?.displayName || 'Admin', 'Verified database restore point', 'Admin');
}
