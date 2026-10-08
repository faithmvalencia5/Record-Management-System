const ID_MAKER_API =
  'https://management-backend-3cij.onrender.com/api/id-maker-queue';

// LOAD QUEUE FROM DATABASE

async function loadIdMakerQueueFromDatabase(showMessage = false) {
  try {
    const tbody =
      document.getElementById(
        'id-maker-queue-tbody'
      );

    if (tbody) {
      tbody.innerHTML =
        '<tr>' +
        '<td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">' +
        '<i class="fi fi-rr-spinner"></i> ' +
        'Loading print queue...' +
        '</td>' +
        '</tr>';
    }

    console.log('Loading ID Maker queue from database...');

    const response = await fetch(ID_MAKER_API);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || 'Failed to load ID Maker queue.'
      );
    }

    // Clear current queue
    ID_MAKER_QUEUE.length = 0;

    // Add database records
    if (Array.isArray(result.queue)) {

      result.queue.forEach(function(item) {

        ID_MAKER_QUEUE.push({
          ...item,

          // Keep the naming used by the existing ID Maker UI
          id:
            item.id ||
            item.application_id,

          printStatus:
            item.printStatus ||
            'Queued',

          controlNo:
            item.controlNo ||
            (
              'CTL-' +
              String(
                item.id ||
                item.application_id ||
                ''
              ).replace('SCB-', '')
            ),

          photo:
            item.photo ||
            fallbackMedia(item.name),

          signature:
            item.signature ||
            ''
        });

      });

    }

    console.log(
      'ID Maker queue loaded:',
      ID_MAKER_QUEUE.length,
      'records'
    );

    // Re-render queue
    initIdMakerQueue();

    updateIdMakerKPIs();
    updateQueueTagCounts();
    updateFilterCounts();
    updateAlertCounts();

    if (showMessage) {
      showToast(
        'ID Maker queue refreshed from database.',
        'success'
      );
    }

    return ID_MAKER_QUEUE;

  } catch (error) {

    console.error(
      'Error loading ID Maker queue:',
      error
    );

    ID_MAKER_QUEUE.length = 0;

    initIdMakerQueue();
    updateIdMakerKPIs();

    if (showMessage) {
      showToast(
        'Failed to load ID Maker queue.',
        'error'
      );
    }

    return [];

  }
}

function closeQueueFilter(){
  document.getElementById('queue-filter-wrap')?.classList.remove('open');
}

/* ── Main Queue List: search + status + barangay filters, applied together ── */
const QUEUE_FILTER_STATE = { search:'', status:'all', barangay:'all' };

function applyQueueFilters(){
  const st = QUEUE_FILTER_STATE;
  let visible = 0;
  let total = 0;

  document
    .querySelectorAll('#id-maker-queue-tbody tr')
    .forEach(r => {

      // Keep the empty-state row visible
      if (!r.dataset.appId) {
        return;
      }

      total++;

      const matchesSearch =
        !st.search ||
        r.textContent
          .toLowerCase()
          .includes(st.search);

      const matchesStatus =
        st.status === 'all' ||
        (r.dataset.printStatus || '') === st.status;

      const matchesBrgy =
        st.barangay === 'all' ||
        r.dataset.brgy === st.barangay;

      const show =
        matchesSearch &&
        matchesStatus &&
        matchesBrgy;

      r.style.display =
        show ? '' : 'none';

      if (show) {
        visible++;
      }
    });

  updateQueueFooterCount(
    visible,
    total
  );
}

function updateQueueFooterCount(visible, total){
  const footer = document.getElementById('queue-footer');
  const footerCount = document.getElementById('queue-footer-count');
  if(!footer || !footerCount) return;
  if(!total){ footer.style.display = 'none'; return; }
  footer.style.display = '';
  footerCount.textContent = visible === total
    ? 'Showing ' + total + ' print-ready application' + (total !== 1 ? 's' : '')
    : 'Showing ' + visible + ' of ' + total + ' print-ready application' + (total !== 1 ? 's' : '');
}

function filterIdMakerQueue(q){
  QUEUE_FILTER_STATE.search = (q || '').trim().toLowerCase();
  applyQueueFilters();
}

function filterQueueChip(btn,status){
  btn.closest('.filter-bar')?.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  QUEUE_FILTER_STATE.status = status || 'all';
  applyQueueFilters();
}

function initIdMakerCharts() {
  var mod =
    document.getElementById(
      'mod-id-maker-analytics'
    );

  if (
    !mod ||
    !mod.classList.contains(
      'active'
    )
  ) {
    return;
  }

  updateIdMakerAnalytics();
}



function initIdMakerQueue(){
  const tbody = document.getElementById('id-maker-queue-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  const statuses = ['Queued','In Production','Printed','In Transit'];
  if (!ID_MAKER_QUEUE.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No cards in the production queue yet. They will appear here once connected to the live system.</td></tr>';
  }
  ID_MAKER_QUEUE.forEach(app=>{
    const tr = document.createElement('tr');
    tr.dataset.appId = app.id;
    tr.dataset.printStatus = app.printStatus;
    tr.dataset.brgy = app.barangay || '';
    const statusColors = { 'Queued':'var(--warning)', 'In Production':'var(--primary)', 'Printed':'var(--purple)', 'In Transit':'var(--success)' };
    const statusIcons = { 'Queued':'clock', 'In Production':'document', 'Printed':'checkmark', 'In Transit':'check-circle' };
    const curColor = statusColors[app.printStatus] || 'var(--text-muted)';
    const menuItems = statuses.map(function(s){
      const active = s === app.printStatus ? ' active' : '';
      return '<button type="button" class="qsd-option' + active + '" data-status="' + s + '" onclick="selectRowStatus(this,\'' + app.id + '\',\'' + s + '\')">' +
        '<span class="qsd-dot" style="background:' + statusColors[s] + '"></span>' + s + '</button>';
    }).join('');
    const triggerHTML = '<button type="button" class="qsd-trigger" onclick="toggleRowStatus(this,event)">' +
      '<span class="qsd-dot" style="background:' + curColor + '"></span>' +
      '<span class="qsd-label">' + app.printStatus + '</span>' +
      '<svg class="qsd-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4.5L6 7.5L9 4.5"/></svg>' +
      '</button>' +
      '<div class="qsd-menu">' + menuItems + '</div>';
    tr.innerHTML = [
      '<td data-label="Applicant">',
      '  <div class="applicant-cell">',
      '    <span class="applicant-avatar" style="background:linear-gradient(135deg,#7140D8,#5C51E0)">' + (app.name||'--').slice(0,2).toUpperCase() + '</span>',
      '    <div class="applicant-info">',
      '      <span class="applicant-name">' + app.name + '</span>',
      '      <span class="applicant-id">' + app.id + '</span>',
      '    </div>',
      '  </div>',
      '</td>',
      '<td data-label="Control No."><span class="cell-text" style="font-family:var(--font-data);font-size:12px;letter-spacing:.3px">' + (app.controlNo || '—') + '</span></td>',
      '<td data-label="Barangay"><span class="cell-text">' + app.barangay + '</span></td>',
      '<td data-label="Status"><div class="row-status-select" data-app-id="' + app.id + '">' + triggerHTML + '</div></td>',
      '<td style="text-align:right;white-space:nowrap">',
      '  <button class="row-action always-visible btn--primary" style="font-size:12px;padding:5px 12px" onclick="openDigitalIssuance(\'' + app.id + '\')">View Form</button>',
      '</td>'
    ].join('\n');
    tbody.appendChild(tr);
  });

  populateQueueFilters();
  updateQueueTagCounts();
  updateFilterCounts();
  updateAlertCounts();

  // Re-apply any active search/status/barangay filters and refresh the footer count
  applyQueueFilters();
}

async function refreshIdMakerQueue() {

  await loadIdMakerQueueFromDatabase(true);

}

function initIdMakerStatusChart() {
  var ctx =
    mkCanvas(
      'chart-idmaker-status'
    );

  if (!ctx) return;

  var counts = {
    Queued: 0,
    'In Production': 0,
    Printed: 0,
    'In Transit': 0
  };

  ID_MAKER_QUEUE.forEach(
    function (app) {
      if (
        counts[app.printStatus] !==
        undefined
      ) {
        counts[
          app.printStatus
        ]++;
      }
    }
  );

  if (
    CHARTS['idmaker-status']
  ) {
    CHARTS[
      'idmaker-status'
    ].destroy();
  }

  CHARTS[
    'idmaker-status'
  ] = new Chart(ctx, {
    type: 'doughnut',

    data: {
      labels: [
        'Queued',
        'In Production',
        'Printed',
        'In Transit'
      ],

      datasets: [
        {
          data: [
            counts.Queued,
            counts['In Production'],
            counts.Printed,
            counts['In Transit']
          ],

          backgroundColor: [
            '#FDA4AF',
            '#F43F5E',
            '#BE123C',
            '#9F1239'
          ],

          borderColor:
            '#FFFFFF',

          borderWidth: 2,

          hoverOffset: 6
        }
      ]
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,

      cutout: '68%',

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          ...TIP,

          callbacks: {
            label: function (c) {
              var total =
                counts.Queued +
                counts['In Production'] +
                counts.Printed +
                counts['In Transit'];

              var pct =
                total
                  ? Math.round(
                      c.parsed /
                      total *
                      100
                    )
                  : 0;

              return (
                ' ' +
                c.label +
                ': ' +
                c.parsed +
                ' (' +
                pct +
                '%)'
              );
            }
          }
        }
      }
    }
  });

  setText(
    'idm-awaiting-count',
    counts.Queued
  );

  setText(
    'idm-production-count',
    counts['In Production']
  );

  setText(
    'idm-completed-count',
    counts.Printed
  );

  setText(
    'idm-transit-count',
    counts['In Transit']
  );
}

function initIdMakerBarangayChart() {
  var ctx =
    mkCanvas(
      'chart-idmaker-barangay'
    );

  if (!ctx) return;

  var barangayCounts = {};

  ID_MAKER_QUEUE.forEach(
    function (app) {
      var barangay =
        String(
          app.barangay ||
          'Unknown'
        ).trim();

      if (!barangay) {
        barangay = 'Unknown';
      }

      barangayCounts[barangay] =
        (
          barangayCounts[
            barangay
          ] || 0
        ) + 1;
    }
  );

  var sorted =
    Object.entries(
      barangayCounts
    )
      .sort(
        function (a, b) {
          return b[1] - a[1];
        }
      )
      .slice(0, 10);

  var labels =
    sorted.map(
      function (item) {
        return item[0];
      }
    );

  var values =
    sorted.map(
      function (item) {
        return item[1];
      }
    );

  var empty =
    document.getElementById(
      'empty-idmaker-barangay'
    );

  if (empty) {
    empty.style.display =
      values.length
        ? 'none'
        : 'flex';
  }

  if (
    CHARTS[
      'idmaker-barangay'
    ]
  ) {
    CHARTS[
      'idmaker-barangay'
    ].destroy();
  }

  CHARTS[
    'idmaker-barangay'
  ] = new Chart(ctx, {
    type: 'bar',

    data: {
      labels,

      datasets: [
        {
          label:
            'Applications',

          data: values,

          backgroundColor:
            'rgba(37,99,235,0.65)',

          borderRadius: 6,

          borderSkipped: false
        }
      ]
    },

    options: {
      indexAxis: 'y',

      responsive: true,

      maintainAspectRatio:
        false,

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          ...TIP
        }
      },

      scales: {
        x: {
          beginAtZero: true,

          ticks: {
            precision: 0
          }
        },

        y: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

async function inlineStatusChange(appId, newStatus) {

  const queueItem = ID_MAKER_QUEUE.find(function(a) {
    return String(a.id) === String(appId);
  });

  if (!queueItem) {
    showToast(
      'Queue item not found.',
      'error'
    );
    return;
  }

  const oldStatus = queueItem.printStatus;

  try {

    // ========================================
    // SAVE STATUS TO DATABASE
    // ========================================

    const response = await fetch(
      ID_MAKER_API + '/' + encodeURIComponent(appId),
      {
        method: 'PUT',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          print_status: newStatus
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        'Failed to update queue status.'
      );
    }

    // ========================================
    // UPDATE LOCAL PAGE STATE
    // ========================================

    queueItem.printStatus = newStatus;

    const queueRow =
      document.querySelector(
        '#id-maker-queue-tbody tr[data-app-id="' +
        appId +
        '"]'
      );

    if (queueRow) {
      queueRow.dataset.printStatus = newStatus;
    }

    // ========================================
    // SYNC APPLICATION WORKFLOW STATUS
    // ========================================

    const applicationStatus =
      newStatus === 'In Transit'
        ? 'Ready for Release'
        : 'In Process';

    const applicationStatusResponse = await fetch(
      'https://management-backend-3cij.onrender.com/api/applications/' +
      encodeURIComponent(appId) +
      '/status',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: applicationStatus
        })
      }
    );

    const applicationStatusResult =
      await applicationStatusResponse.json();

    if (
      !applicationStatusResponse.ok ||
      !applicationStatusResult.success
    ) {
      throw new Error(
        applicationStatusResult.message ||
        'Failed to update application status.'
      );
    }

    // Update local state after database update succeeds
    if (
      typeof APP_DB !== 'undefined' &&
      APP_DB[appId]
    ) {
      APP_DB[appId].status = applicationStatus;
    }

    if (
      typeof syncApplicationsTableBadge ===
      'function'
    ) {
      syncApplicationsTableBadge(
        appId,
        applicationStatus
      );
    }

    // ========================================
    // REFRESH UI
    // ========================================

    updateIdMakerKPIs();

    appendAudit(
      CURRENT_USER?.displayName ||
      'ID Maker',

      'Status set to: ' +
      newStatus,

      CURRENT_ROLE
    );

    showToast(
      'Status updated to "' +
      newStatus +
      '" for ' +
      (queueItem.name || appId),

      'success'
    );

    applyQueueFilters();

  } catch (error) {

    console.error(
      'Error updating ID Maker queue status:',
      error
    );

    // Restore previous UI state
    queueItem.printStatus = oldStatus;

    showToast(
      error.message ||
      'Failed to update queue status.',

      'error'
    );

    // Re-render to restore correct status
    initIdMakerQueue();
  }
}

function updateIdMakerKPIs() {

  var queued = 0;
  var production = 0;
  var printed = 0;
  var transit = 0;
  var errors = 0;

  ID_MAKER_QUEUE.forEach(function(app){

    if (app.printStatus === 'Queued') {
      queued++;
    }

    else if (
      app.printStatus === 'In Production'
    ) {
      production++;
    }

    else if (
      app.printStatus === 'Printed'
    ) {
      printed++;
    }

    else if (
      app.printStatus === 'In Transit'
    ) {
      transit++;
    }

  });


  // ---------------------------------------
  // KPI CARD 1 — Pending Export
  // ---------------------------------------

  var cards =
    document.querySelectorAll(
      '.admin-kpi-strip .stat-card'
    );

  if (!cards.length) return;


  var values = [
    queued,
    production,
    printed,
    transit,
    errors
  ];


  cards.forEach(function(card, index){

    var value =
      card.querySelector(
        '.stat-card__value'
      );

    var trend =
      card.querySelector(
        '.stat-card__trend'
      );

    if (value) {
      value.textContent =
        values[index];
    }

    if (trend) {
      trend.textContent =
        values[index];
    }

  });

}

function queueBadgeClass(status){
  const map = {
    'Queued':'badge-pending',
    'In Production':'badge-review',
    'Printed':'badge-issued',
    'In Transit':'badge-approved',
    'Released':'badge-approved',
    'Rejected':'badge-rejected'
  };
  return map[status] || 'badge-review';
}

function selectQueueFilter(btn,status){
  document.querySelectorAll('.queue-filter-option').forEach(o=>o.classList.remove('active'));
  btn.classList.add('active');
  const label = document.getElementById('queue-filter-label');
  if(label) label.textContent = btn.querySelector('.qfo-label').textContent;
  QUEUE_FILTER_STATE.status = status || 'all';
  applyQueueFilters();
  closeQueueFilter();
}

function selectRowStatus(opt, appId, newStatus){
  const root = opt.closest('.row-status-select');
  const statusColors = { 'Queued':'var(--warning)', 'In Production':'var(--primary)', 'Printed':'var(--purple)', 'In Transit':'var(--success)' };
  root.querySelector('.qsd-label').textContent = newStatus;
  root.querySelector('.qsd-trigger .qsd-dot').style.background = statusColors[newStatus] || 'var(--text-muted)';
  root.querySelectorAll('.qsd-option').forEach(o => o.classList.toggle('active', o.dataset.status === newStatus));
  root.classList.remove('open');
  inlineStatusChange(appId, newStatus);
}

function toggleQueueFilter(){
  document.getElementById('queue-filter-wrap').classList.toggle('open');
}

function toggleRowStatus(btn, event){
  event.stopPropagation();
  const root = btn.closest('.row-status-select');
  const wasOpen = root.classList.contains('open');
  document.querySelectorAll('.row-status-select.open').forEach(r => r.classList.remove('open'));
  if(!wasOpen) root.classList.add('open');
}

function updateFilterCounts(){
  const counts = { Queued:0, 'In Production':0, Printed:0, 'In Transit':0 };
  ID_MAKER_QUEUE.forEach(a => { if(counts[a.printStatus] !== undefined) counts[a.printStatus]++; });
  const total = ID_MAKER_QUEUE.length;
  const allCount = document.getElementById('qf-count-all');
  const q = document.getElementById('qf-count-queued');
  const p = document.getElementById('qf-count-production');
  const pr = document.getElementById('qf-count-printed');
  const t = document.getElementById('qf-count-transit');
  if(allCount) allCount.textContent = total;
  if(q) q.textContent = counts.Queued;
  if(p) p.textContent = counts['In Production'];
  if(pr) pr.textContent = counts.Printed;
  if(t) t.textContent = counts['In Transit'];
}

/* ── Dashboard additions: barangay filter, quick tags, batch export ── */
function populateQueueFilters(){
  const sel = document.getElementById('queue-barangay-filter');
  if(!sel) return;
  const current = sel.value;
  // Keep the full static barangay list from the page, then merge in any
  // queue barangays that are not listed yet (so live data never loses options).
  const brgys = [];
  Array.prototype.forEach.call(sel.options, o => {
    if(o.value && o.value !== 'all' && brgys.indexOf(o.value) === -1) brgys.push(o.value);
  });
  ID_MAKER_QUEUE.forEach(a => { if(a.barangay && brgys.indexOf(a.barangay) === -1) brgys.push(a.barangay); });
  brgys.sort((a, b) => a.localeCompare(b));
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const allLabel = (sel.options[0] && sel.options[0].value === 'all') ? sel.options[0].textContent : 'Barangay: All';
  sel.innerHTML = '<option value="all">' + esc(allLabel) + '</option>' +
    brgys.map(b => '<option value="' + esc(b) + '">Barangay: ' + esc(b) + '</option>').join('');
  sel.value = (current && brgys.indexOf(current) !== -1) ? current : 'all';
  QUEUE_FILTER_STATE.barangay = sel.value;
}

function filterQueueByBarangay(value){
  QUEUE_FILTER_STATE.barangay = value || 'all';
  applyQueueFilters();
}

function updateQueueTagCounts(){
  const counts = { Queued:0, 'In Production':0, Printed:0, 'In Transit':0 };
  ID_MAKER_QUEUE.forEach(a => { if(counts[a.printStatus] !== undefined) counts[a.printStatus]++; });
  const map = { 'qt-queued': counts.Queued, 'qt-production': counts['In Production'], 'qt-printed': counts.Printed, 'qt-transit': counts['In Transit'] };
  Object.keys(map).forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent = map[id];
  });
}

function filterQueueByStatusTag(btn, status){
  const bar = btn.closest('.ops-toolbar');
  if(bar) bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  QUEUE_FILTER_STATE.status = status || 'all';
  applyQueueFilters();
}

function dismissSystemAlert(){
  const b = document.getElementById('system-alert-banner');
  if(b) b.style.display = 'none';
}

function updateAlertCounts(){
  const counts = { Queued:0, 'In Production':0, Printed:0, 'In Transit':0 };
  ID_MAKER_QUEUE.forEach(a => { if(counts[a.printStatus] !== undefined) counts[a.printStatus]++; });
}

/* ── Queue Analytics additions: insights & optimization ── */
function initIdMakerInsightCharts() {
  initIdMakerBarangayChart();
  initIdMakerSLA();
}

function initIdMakerSLA() {
  const now =
    Date.now();

  let onTime = 0;
  let over24 = 0;
  let over48 = 0;

  const activeItems =
    ID_MAKER_QUEUE.filter(
      function (app) {
        return (
          app.printStatus ===
            'Queued' ||
          app.printStatus ===
            'In Production'
        );
      }
    );

  activeItems.forEach(
    function (app) {
      if (!app.sentAt) {
        onTime++;
        return;
      }

      const sentTime =
        new Date(
          app.sentAt
        ).getTime();

      if (
        Number.isNaN(
          sentTime
        )
      ) {
        onTime++;
        return;
      }

      const hours =
        (
          now -
          sentTime
        ) /
        (
          1000 *
          60 *
          60
        );

      if (hours > 48) {
        over48++;
      } else if (hours > 24) {
        over24++;
      } else {
        onTime++;
      }
    }
  );

  const total =
    activeItems.length;

  setText(
    'sla-24h',
    over24 + over48
  );

  setText(
    'sla-48h',
    over48
  );

  setText(
    'sla-on-time',
    onTime
  );

  setText(
    'sla-total',
    total
  );

  const denominator =
    total || 1;

  const onTimeBar =
    document.getElementById(
      'sla-bar-on-time'
    );

  const over24Bar =
    document.getElementById(
      'sla-bar-24h'
    );

  const over48Bar =
    document.getElementById(
      'sla-bar-48h'
    );

  if (onTimeBar) {
    onTimeBar.style.width =
      (
        onTime /
        denominator *
        100
      ) + '%';
  }

  if (over24Bar) {
    over24Bar.style.width =
      (
        over24 /
        denominator *
        100
      ) + '%';
  }

  if (over48Bar) {
    over48Bar.style.width =
      (
        over48 /
        denominator *
        100
      ) + '%';
  }
}

function updateIdMakerAnalytics() {

  var mod =
    document.getElementById(
      'mod-id-maker-analytics'
    );

  if (
    !mod ||
    !mod.classList.contains(
      'active'
    )
  ) {
    return;
  }

  initIdMakerStatusChart();

  initIdMakerBarangayChart();

  initIdMakerSLA();

  updateIdMakerAnalyticsInsights();
}

function updateIdMakerAnalyticsInsights() {

  const statusInsight =
    document.getElementById(
      'idmaker-status-insight-text'
    );

  const barangayInsight =
    document.getElementById(
      'idmaker-barangay-insight-text'
    );

  const slaInsight =
    document.getElementById(
      'idmaker-sla-insight-text'
    );


  if (
    !statusInsight ||
    !barangayInsight ||
    !slaInsight
  ) {
    return;
  }


  /* =====================================================
     BASIC QUEUE DATA
     ===================================================== */

  const counts = {
    Queued: 0,
    'In Production': 0,
    Printed: 0,
    'In Transit': 0
  };


  ID_MAKER_QUEUE.forEach(
    function(app) {

      if (
        counts[app.printStatus] !==
        undefined
      ) {

        counts[app.printStatus]++;

      }

    }
  );


  const total =
    ID_MAKER_QUEUE.length;


  /* =====================================================
     NO DATA
     ===================================================== */

  if (!total) {

    statusInsight.textContent =
      'There are currently no applications in the production queue.';

    barangayInsight.textContent =
      'Barangay workload data will appear when applications enter the queue.';

    slaInsight.textContent =
      'There are currently no active applications to evaluate for queue aging.';

    return;
  }


  /* =====================================================
     INSIGHT 1 — PRODUCTION STATUS
     ===================================================== */

  const queuedPct =
    Math.round(
      (
        counts.Queued /
        total
      ) * 100
    );


  const productionPct =
    Math.round(
      (
        counts['In Production'] /
        total
      ) * 100
    );


  const printedPct =
    Math.round(
      (
        counts.Printed /
        total
      ) * 100
    );


  const transitPct =
    Math.round(
      (
        counts['In Transit'] /
        total
      ) * 100
    );


  if (queuedPct >= 70) {

    statusInsight.textContent =
      counts.Queued +
      ' of ' +
      total +
      ' applications (' +
      queuedPct +
      '%) are still queued, indicating that the largest workload is waiting to enter production.';

  } else if (
    productionPct >= 30
  ) {

    statusInsight.textContent =
      counts['In Production'] +
      ' applications (' +
      productionPct +
      '%) are currently in production, indicating a relatively high active processing workload.';

  } else if (
    (printedPct + transitPct) >= 25
  ) {

    statusInsight.textContent =
      counts.Printed +
      ' printed and ' +
      counts['In Transit'] +
      ' in-transit applications show that ' +
      (printedPct + transitPct) +
      '% of the queue has progressed beyond active production.';

  } else {

    statusInsight.textContent =
      'The queue is distributed across production stages, with ' +
      counts.Queued +
      ' queued, ' +
      counts['In Production'] +
      ' in production, ' +
      counts.Printed +
      ' printed, and ' +
      counts['In Transit'] +
      ' in transit.';

  }


  /* =====================================================
     INSIGHT 2 — BARANGAY
     ===================================================== */

  const barangayCounts = {};


  ID_MAKER_QUEUE.forEach(
    function(app) {

      const barangay =
        String(
          app.barangay ||
          'Unknown'
        ).trim() ||
        'Unknown';


      barangayCounts[barangay] =
        (
          barangayCounts[barangay] ||
          0
        ) + 1;

    }
  );


  const barangayRanking =
    Object.entries(
      barangayCounts
    ).sort(
      function(a, b) {
        return b[1] - a[1];
      }
    );


  if (
    barangayRanking.length
  ) {

    const top =
      barangayRanking[0];

    const topName =
      top[0];

    const topCount =
      top[1];

    const topPct =
      Math.round(
        (
          topCount /
          total
        ) * 100
      );


    barangayInsight.textContent =
      topName +
      ' has the highest current workload with ' +
      topCount +
      ' applications (' +
      topPct +
      '% of the queue), making it the barangay with the largest production demand.';

  } else {

    barangayInsight.textContent =
      'No barangay workload data is currently available.';

  }


  /* =====================================================
     INSIGHT 3 — SLA / QUEUE AGING
     ===================================================== */

  const now =
    Date.now();


  let onTime = 0;
  let over24 = 0;
  let over48 = 0;


  const activeItems =
    ID_MAKER_QUEUE.filter(
      function(app) {

        return (
          app.printStatus ===
            'Queued' ||

          app.printStatus ===
            'In Production'
        );

      }
    );


  activeItems.forEach(
    function(app) {

      if (!app.sentAt) {

        onTime++;

        return;
      }


      const sentTime =
        new Date(
          app.sentAt
        ).getTime();


      if (
        Number.isNaN(
          sentTime
        )
      ) {

        onTime++;

        return;
      }


      const hours =
        (
          now -
          sentTime
        ) /
        (
          1000 *
          60 *
          60
        );


      if (
        hours > 48
      ) {

        over48++;

      } else if (
        hours > 24
      ) {

        over24++;

      } else {

        onTime++;

      }

    }
  );


  const activeTotal =
    activeItems.length;


  const delayed =
    over24 +
    over48;


  if (!activeTotal) {

    slaInsight.textContent =
      'There are currently no queued or in-production applications requiring SLA monitoring.';

  } else if (
    over48 > 0
  ) {

    slaInsight.textContent =
      over48 +
      ' active applications have exceeded 48 hours, indicating records that should receive immediate processing attention.';

  } else if (
    over24 > 0
  ) {

    slaInsight.textContent =
      delayed +
      ' of ' +
      activeTotal +
      ' active applications have been waiting more than 24 hours, indicating that older records should be prioritized.';

  } else {

    slaInsight.textContent =
      'All ' +
      activeTotal +
      ' active applications are currently within the 24-hour queue threshold.';

  }

}

function updateIdMakerKPIs() {
  const counts = {
    Queued: 0,
    'In Production': 0,
    Printed: 0,
    'In Transit': 0
  };

  ID_MAKER_QUEUE.forEach(
    function (app) {
      if (
        counts[app.printStatus] !==
        undefined
      ) {
        counts[app.printStatus]++;
      }
    }
  );

  const cards =
    document.querySelectorAll(
      '#mod-id-maker-dashboard .stat-card'
    );

  if (cards[0]) {
    cards[0]
      .querySelector(
        '.stat-card__value'
      )
      .textContent =
      counts.Queued;
  }

  if (cards[1]) {
    cards[1]
      .querySelector(
        '.stat-card__value'
      )
      .textContent =
      counts['In Production'];
  }

  if (cards[2]) {
    cards[2]
      .querySelector(
        '.stat-card__value'
      )
      .textContent =
      counts.Printed;
  }

  if (cards[3]) {
    cards[3]
      .querySelector(
        '.stat-card__value'
      )
      .textContent =
      counts['In Transit'];
  }

  if (cards[4]) {
    cards[4]
      .querySelector(
        '.stat-card__value'
      )
      .textContent =
      ID_MAKER_QUEUE.length;
  }

  updateFilterCounts();
  updateQueueTagCounts();
  updateAlertCounts();

  if (
    typeof updateIdMakerAnalytics ===
    'function'
  ) {
    updateIdMakerAnalytics();
  }
}

document.addEventListener('click',function(e){
  if(!e.target.closest('.queue-filter-dropdown')) closeQueueFilter();
});

document.addEventListener('click', () => document.querySelectorAll('.row-status-select.open').forEach(r => r.classList.remove('open')));

document.addEventListener('DOMContentLoaded', async function () {

  // Load queue from Supabase
  await loadIdMakerQueueFromDatabase(false);

});