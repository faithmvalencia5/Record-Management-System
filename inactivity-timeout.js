/* ═══════════════════════════════════════════════════════════════════════════
   inactivity-timeout.js
   Automatic logout due to user inactivity — applies to all portal pages.

   Features
   ────────
   • Configurable timeout per role (Admin: 3 min, Staff/ID Maker: 2 min)
   • Tracks mouse, keyboard, scroll, and touch events to reset the timer
   • Multi-tab sync via localStorage key + storage event (activity in any tab
     resets the timer across all tabs)
   • Warning modal appears 30 s before logout with a live countdown
   • Gracefully clears all session data and redirects to login.html
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

(function () {

  /* ── Configuration ──────────────────────────────────────────────────────── */

  /** Timeout (ms) before auto-logout per role.  Change these as needed. */
  const TIMEOUT_BY_ROLE = {
    'Admin':    3 * 60 * 1000,   // 3 minutes
    'Staff':    2 * 60 * 1000,   // 2 minutes
    'ID Maker': 2 * 60 * 1000,   // 2 minutes
  };
  /** Fallback timeout when the role is unknown */
  const DEFAULT_TIMEOUT_MS = 2.5 * 60 * 1000;   // 2 min 30 s

  /** How many milliseconds before logout to show the warning modal */
  const WARN_BEFORE_MS = 30 * 1000;   // 30 seconds

  /** localStorage key used to broadcast activity across tabs */
  const LS_ACTIVITY_KEY = 'seniorid_last_activity';

  /** localStorage key used to broadcast an immediate logout to other tabs */
  const LS_LOGOUT_KEY = 'seniorid_inactivity_logout';

  /* ── Activity events to listen for ─────────────────────────────────────── */
  const ACTIVITY_EVENTS = [
    'mousedown', 'mousemove', 'keydown',
    'scroll',    'touchstart', 'touchmove',
    'click',     'focus'
  ];

  /* ── Internal state ─────────────────────────────────────────────────────── */
  let _timeoutId   = null;   // main expiry timer handle
  let _warnId      = null;   // warning-phase timer handle
  let _countdownId = null;   // 1-second countdown interval handle
  let _titleId     = null;   // tab-title flash interval handle
  let _originalTitle = null;
  let _isWarning   = false;  // true while the warning modal is visible
  let _active      = false;  // has the module been initialised?

  /* ═══════════════════════════════════════════════════════════════════════════
     TIMEOUT CALCULATION
     Reads CURRENT_ROLE from the global app state (set by app.js).
  ═══════════════════════════════════════════════════════════════════════════ */
  function _getTimeoutMs() {
    const role = (typeof CURRENT_ROLE !== 'undefined') ? CURRENT_ROLE : '';
    return TIMEOUT_BY_ROLE[role] || DEFAULT_TIMEOUT_MS;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SESSION CLEAR  (mirrors app.js clearAuthSession but also covers authToken)
  ═══════════════════════════════════════════════════════════════════════════ */
  function _clearAllSessions() {
    // Primary session blob used by this app
    try { sessionStorage.removeItem('senioridAuth'); } catch (_) {}
    try { localStorage.removeItem('senioridAuth');   } catch (_) {}
    // JWT token stored separately
    try { sessionStorage.removeItem('authToken'); }   catch (_) {}
    try { localStorage.removeItem('authToken');   }   catch (_) {}
    // Cleanup sync keys
    try { localStorage.removeItem(LS_ACTIVITY_KEY); } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LOGOUT
  ═══════════════════════════════════════════════════════════════════════════ */
  function _doLogout() {
    _stopTimers();
    _removeActivityListeners();
    _clearAllSessions();

    // Signal other tabs to log out immediately
    try {
      localStorage.setItem(LS_LOGOUT_KEY, Date.now().toString());
      setTimeout(() => { try { localStorage.removeItem(LS_LOGOUT_KEY); } catch(_){} }, 500);
    } catch (_) {}

    window.location.href = 'login.html?loggedout=1&reason=inactivity';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     WARNING MODAL  (injected into DOM once on first call)
  ═══════════════════════════════════════════════════════════════════════════ */
  function _ensureModalDOM() {
    if (document.getElementById('inactivity-warning-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'inactivity-warning-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'inactivity-modal-title');
    overlay.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:rgba(15,23,42,0.65)',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'z-index:999999',
      'align-items:center',
      'justify-content:center',
      'padding:20px'
    ].join(';');

    overlay.innerHTML = `
      <div id="inactivity-modal"
           style="background:#fff;border-radius:18px;width:100%;max-width:400px;
                  box-shadow:0 24px 64px rgba(0,0,0,0.22),0 4px 16px rgba(0,0,0,0.10);
                  overflow:hidden;position:relative;
                  animation:itSlideIn 0.22s cubic-bezier(.4,0,.2,1);">
        <div style="height:4px;background:linear-gradient(90deg,#D97706,#F59E0B,#EF4444);"></div>
        <div style="padding:32px 32px 28px;">
          <div style="display:flex;justify-content:center;margin-bottom:20px;">
            <div style="width:64px;height:64px;border-radius:50%;
                        background:linear-gradient(135deg,#FEF3C7,#FDE68A);
                        display:flex;align-items:center;justify-content:center;
                        box-shadow:0 4px 16px rgba(217,119,6,0.20);">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                   stroke="#D97706" stroke-width="2.2" stroke-linecap="round"
                   stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
          </div>
          <h2 id="inactivity-modal-title"
              style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;
                     font-weight:800;color:#0F172A;margin:0 0 8px;text-align:center;">
            Still there?
          </h2>
          <p style="font-size:13.5px;color:#64748B;text-align:center;
                    line-height:1.65;margin:0 0 20px;">
            For your security, you'll be signed out automatically due to
            inactivity in&nbsp;<strong id="inactivity-countdown"
              style="color:#D97706;font-weight:700;font-size:15px;">30</strong>&nbsp;seconds.
          </p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button id="inactivity-stay-btn"
              style="width:100%;padding:12px 20px;
                     background:linear-gradient(135deg,#1E40AF,#2563EB);
                     color:#fff;border:none;border-radius:10px;font-size:14px;
                     font-weight:700;font-family:inherit;cursor:pointer;
                     display:flex;align-items:center;justify-content:center;gap:8px;
                     box-shadow:0 4px 14px rgba(37,99,235,0.30);transition:opacity 0.18s;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Stay Signed In
            </button>
            <button id="inactivity-logout-btn"
              style="width:100%;padding:11px 20px;background:#F1F5F9;
                     border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;
                     font-weight:600;font-family:inherit;color:#64748B;cursor:pointer;
                     transition:background 0.18s;">
              Sign Out Now
            </button>
          </div>
        </div>
      </div>
      <style>
        @keyframes itSlideIn {
          from { opacity:0; transform:translateY(-20px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes itPulse {
          0%, 100% { box-shadow:0 24px 64px rgba(0,0,0,0.22), 0 0 0 0 rgba(217,119,6,0.55); }
          50%      { box-shadow:0 24px 64px rgba(0,0,0,0.22), 0 0 0 14px rgba(217,119,6,0); }
        }
        #inactivity-modal.it-flash { animation: itSlideIn 0.22s cubic-bezier(.4,0,.2,1), itPulse 1s ease-in-out infinite; }
        #inactivity-stay-btn:hover    { opacity: .90; }
        #inactivity-logout-btn:hover  { background:#E2E8F0 !important; }
      </style>`;

    document.body.appendChild(overlay);

    document.getElementById('inactivity-stay-btn')
      .addEventListener('click', _dismissWarning);
    document.getElementById('inactivity-logout-btn')
      .addEventListener('click', _doLogout);
  }

  /* ── Show / hide warning overlay ─────────────────────────────────────────── */
  function _showWarning() {
    _isWarning = true;
    _ensureModalDOM();
    const overlay = document.getElementById('inactivity-warning-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const modal = document.getElementById('inactivity-modal');
    if (modal) modal.classList.add('it-flash');

    // Flash the tab title so the warning is noticed even when another tab is active
    if (_originalTitle === null) _originalTitle = document.title;
    let flashOn = true;
    if (_titleId) clearInterval(_titleId);
    _titleId = setInterval(() => {
      flashOn = !flashOn;
      document.title = flashOn ? '\u26A0 Still there? - ' + _originalTitle : _originalTitle;
    }, 700);

    let secondsLeft = Math.ceil(WARN_BEFORE_MS / 1000);
    _updateCountdown(secondsLeft);
    if (_countdownId) clearInterval(_countdownId);
    _countdownId = setInterval(() => {
      secondsLeft -= 1;
      _updateCountdown(secondsLeft);
      if (secondsLeft <= 0) { clearInterval(_countdownId); _countdownId = null; }
    }, 1000);
  }

  function _updateCountdown(s) {
    const el = document.getElementById('inactivity-countdown');
    if (el) el.textContent = Math.max(0, s);
  }

  function _hideWarning() {
    _isWarning = false;
    if (_countdownId) { clearInterval(_countdownId); _countdownId = null; }
    if (_titleId) { clearInterval(_titleId); _titleId = null; }
    if (_originalTitle !== null) { document.title = _originalTitle; _originalTitle = null; }
    const modal = document.getElementById('inactivity-modal');
    if (modal) modal.classList.remove('it-flash');
    const overlay = document.getElementById('inactivity-warning-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function _dismissWarning() {
    _hideWarning();
    _resetTimers();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TIMER MANAGEMENT
  ═══════════════════════════════════════════════════════════════════════════ */
  function _stopTimers() {
    if (_timeoutId)  { clearTimeout(_timeoutId);    _timeoutId  = null; }
    if (_warnId)     { clearTimeout(_warnId);        _warnId     = null; }
    if (_countdownId){ clearInterval(_countdownId);  _countdownId= null; }
  }

  function _resetTimers() {
    _stopTimers();
    const total  = _getTimeoutMs();
    const warnAt = total - WARN_BEFORE_MS;

    _warnId = setTimeout(() => {
      _showWarning();
      _timeoutId = setTimeout(_doLogout, WARN_BEFORE_MS);
    }, Math.max(0, warnAt));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ACTIVITY HANDLER
  ═══════════════════════════════════════════════════════════════════════════ */
  function _onActivity() {
    if (_isWarning) { _dismissWarning(); return; }
    _resetTimers();
    try { localStorage.setItem(LS_ACTIVITY_KEY, Date.now().toString()); } catch (_) {}
  }

  /* Throttle high-frequency events */
  let _throttleHandle = null;
  function _throttledActivity() {
    if (_throttleHandle) return;
    _throttleHandle = setTimeout(() => { _throttleHandle = null; _onActivity(); }, 500);
  }

  const _highFreqEvents = new Set(['mousemove', 'scroll', 'touchmove']);

  function _addActivityListeners() {
    ACTIVITY_EVENTS.forEach(evt => {
      const h = _highFreqEvents.has(evt) ? _throttledActivity : _onActivity;
      document.addEventListener(evt, h, { passive: true, capture: true });
    });
  }

  function _removeActivityListeners() {
    ACTIVITY_EVENTS.forEach(evt => {
      const h = _highFreqEvents.has(evt) ? _throttledActivity : _onActivity;
      document.removeEventListener(evt, h, { capture: true });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MULTI-TAB SYNC via storage event
  ═══════════════════════════════════════════════════════════════════════════ */
  function _onStorageEvent(e) {
    if (e.key === LS_ACTIVITY_KEY && e.newValue) {
      if (!_isWarning) { _resetTimers(); }
      else { _dismissWarning(); }
    }
    if (e.key === LS_LOGOUT_KEY && e.newValue) {
      _stopTimers();
      _removeActivityListeners();
      _clearAllSessions();
      window.location.href = 'login.html?loggedout=1&reason=inactivity';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PUBLIC API — exposed on window so app.js can call them
  ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Initialise (or reset) the inactivity timer.
   * Already called in app.js DOMContentLoaded; also safe to call after role change.
   */
  window.resetInactivityTimer = function resetInactivityTimer() {
    // Do not run on the login page
    if (typeof PAGE !== 'undefined' && PAGE === 'login') return;

    // Do not run without an active session
    const raw = (typeof readAuthSession === 'function')
      ? readAuthSession()
      : (sessionStorage.getItem('senioridAuth') || localStorage.getItem('senioridAuth'));
    if (!raw) return;

    if (!_active) {
      _active = true;
      _addActivityListeners();
      window.addEventListener('storage', _onStorageEvent);

      // On tab restore from background: check if timeout already elapsed
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        try {
          const lastActivity = parseInt(localStorage.getItem(LS_ACTIVITY_KEY) || '0', 10);
          if (lastActivity > 0 && Date.now() - lastActivity >= _getTimeoutMs()) {
            _doLogout();
            return;
          }
        } catch (_) {}
        _resetTimers();
      });
    }

    _resetTimers();
  };

  /**
   * Stop all timers and remove listeners (called when user manually logs out).
   */
  window.stopInactivityTimer = function stopInactivityTimer() {
    _stopTimers();
    _removeActivityListeners();
    window.removeEventListener('storage', _onStorageEvent);
    _hideWarning();
    _active = false;
  };

})();
