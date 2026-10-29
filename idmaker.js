let systemAlertDismissed = false;
let ID_MAKER_ANALYTICS_DATA = null;
let ID_MAKER_ANALYTICS_UPDATED_AT = null;
let ID_MAKER_ANALYTICS_STATS = null;
let ID_MAKER_INSIGHT_REQUEST_KEY = '';
let ID_MAKER_INSIGHT_REQUEST_VERSION = 0;
let ID_MAKER_ANALYTICS_REFRESH_ERROR = false;
let ID_MAKER_COMPLETION_TIMESTAMP_AVAILABLE = true;

const ID_MAKER_ANALYTICS_CONFIG = Object.freeze({
  within24Hours: 24,
  within48Hours: 48,
  agingElevatedShare: 0.25,
  agingHighShare: 0.5,
  productionElevatedQueuedShare: 0.6,
  barangayElevatedTopShare: 0.15,
  monthlyHistory: 6,
  insightTimeoutMs: 350000,
});

const ID_MAKER_ANALYTICS_STAGES = [
  { key: 'Queued', label: 'Queued', color: '#94A3B8', icon: 'fi-rr-clock', title: 'Application is waiting to enter production.' },
  { key: 'In Production', label: 'In Production', color: '#3B82F6', icon: 'fi-rr-document', title: 'ID is currently being produced.' },
  { key: 'Printed', label: 'Printed', color: '#6366F1', icon: 'fi-rr-print', title: 'ID has been printed.' },
  { key: 'In Transit', label: 'In Transit', color: '#14B8A6', icon: 'fi-rr-truck-side', title: 'ID is on the way to its destination.' },
  { key: 'Completed', label: 'Completed', color: '#22C55E', icon: 'fi-rr-check', title: 'ID delivery or release is marked complete.' },
];

const ID_MAKER_API =
  'https://management-backend-3cij.onrender.com/api/id-maker-queue';

// LOAD QUEUE FROM DATABASE

async function loadIdMakerQueueFromDatabase(showMessage = false) {
  if (typeof Skeleton !== 'undefined') {
    Skeleton.setKpiLoading('#mod-id-maker-dashboard .admin-kpi-strip', true);
    Skeleton.setLoading(
      document.querySelectorAll(
        '#mod-id-maker-dashboard .stat-card, #mod-id-maker-dashboard .chart-card, #mod-id-maker-analytics .stat-card, #mod-id-maker-analytics .chart-card, #mod-id-maker-analytics .donut-card'
      ),
      true
    );
  }

  try {
    const tbody =
      document.getElementById(
        'id-maker-queue-tbody'
      );

    if (tbody && typeof Skeleton !== 'undefined') {
      Skeleton.setTable(tbody, 6);
    } else if (tbody) {
      tbody.innerHTML =
        '<tr>' +
        '<td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">' +
        '<i class="fi fi-rr-spinner"></i> ' +
        'Loading print queue...' +
        '</td>' +
        '</tr>';
    }

    console.log('Loading ID Maker queue from database...');
    if (!ID_MAKER_ANALYTICS_DATA) {
      ID_MAKER_ANALYTICS_REFRESH_ERROR = false;
      updateIdMakerAnalytics();
    }

    const response = await fetch(ID_MAKER_API);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || 'Failed to load ID Maker queue.'
      );
    }

    // A fresh server response is a new alert snapshot.
    systemAlertDismissed = false;
    ID_MAKER_COMPLETION_TIMESTAMP_AVAILABLE = result.completion_timestamp_available !== false;

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

    // Analytics use only the successfully refreshed database result. The
    // legacy local queue remains available to the operational table only.
    ID_MAKER_ANALYTICS_DATA = ID_MAKER_QUEUE.map(item => ({ ...item }));
    ID_MAKER_ANALYTICS_UPDATED_AT = new Date();
    ID_MAKER_ANALYTICS_REFRESH_ERROR = false;
    ID_MAKER_INSIGHT_REQUEST_KEY = '';
    updateAnalyticsRefreshStamp();

        // Merge any locally queued items from localStorage
    const localQueue = (typeof getLocalIdMakerQueue === 'function') ? getLocalIdMakerQueue() : [];
    if (Array.isArray(localQueue)) {
      localQueue.forEach(function(localItem) {
        const localId = String(localItem.id || localItem.application_id);
        const idx = ID_MAKER_QUEUE.findIndex(item => String(item.id || item.application_id) === localId);
        if (idx === -1) {
          ID_MAKER_QUEUE.unshift(localItem);
        } else {
          // Keep the database record authoritative so an older local status
          // cannot overwrite the status just fetched from the server.
          ID_MAKER_QUEUE[idx] = Object.assign({}, localItem, ID_MAKER_QUEUE[idx]);
        }
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
    updateIdMakerAnalytics();

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

    ID_MAKER_ANALYTICS_DATA = null;
    ID_MAKER_ANALYTICS_REFRESH_ERROR = true;
    updateIdMakerAnalytics();

    ID_MAKER_QUEUE.length = 0;
    const localQueue = (typeof getLocalIdMakerQueue === 'function') ? getLocalIdMakerQueue() : [];
    if (Array.isArray(localQueue) && localQueue.length > 0) {
      localQueue.forEach(item => ID_MAKER_QUEUE.push(item));
    }
    initIdMakerQueue();
    updateIdMakerKPIs();

    if (showMessage) {
      showToast(
        'Failed to load ID Maker queue.',
        'error'
      );
    }

    return [];

  } finally {
    if (typeof Skeleton !== 'undefined') {
      Skeleton.setKpiLoading('#mod-id-maker-dashboard .admin-kpi-strip', false);
      Skeleton.setLoading(
        document.querySelectorAll(
          '#mod-id-maker-dashboard .stat-card, #mod-id-maker-dashboard .chart-card, #mod-id-maker-analytics .stat-card, #mod-id-maker-analytics .chart-card, #mod-id-maker-analytics .donut-card'
        ),
        false
      );
    }
  }
}

function closeQueueFilter(){
  const wrap = document.getElementById('queue-filter-wrap');
  wrap?.classList.remove('open');
  const menu = document.getElementById('queue-filter-menu');
  if (menu?.classList.contains('queue-filter-menu--portal')) {
    menu.classList.remove('queue-filter-menu--portal');
    menu.style.cssText = '';
    wrap?.appendChild(menu);
  }
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
  if (typeof Skeleton !== 'undefined') Skeleton.clearBusy(tbody);
  const statuses = ['Queued','In Production','Printed','In Transit','Completed'];
  if (!ID_MAKER_QUEUE.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No cards in the production queue yet. They will appear here once connected to the live system.</td></tr>';
  }
  ID_MAKER_QUEUE.forEach(app=>{
    const tr = document.createElement('tr');
    tr.dataset.appId = app.id;
    tr.dataset.printStatus = app.printStatus;
    tr.dataset.brgy = app.barangay || '';
    const statusColors = { 'Queued':'var(--warning)', 'In Production':'var(--primary)', 'Printed':'var(--purple)', 'In Transit':'var(--success)', 'Completed':'var(--success)' };
    const statusIcons = { 'Queued':'clock', 'In Production':'document', 'Printed':'checkmark', 'In Transit':'check-circle', 'Completed':'check-circle' };
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
      '  <button type="button" class="row-action always-visible row-action--icon" data-tooltip="View form" aria-label="View form" onclick="openDigitalIssuance(\'' + app.id + '\')">' +
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.75"/></svg>' +
      '  </button>',
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

function computeIdMakerAnalyticsStats(records, now = new Date()) {
  const data = Array.isArray(records) ? records : [];
  const total = data.length;
  const stageCounts = Object.fromEntries(ID_MAKER_ANALYTICS_STAGES.map(stage => [stage.key, 0]));
  let unknownStatuses = 0;
  data.forEach(app => {
    if (Object.prototype.hasOwnProperty.call(stageCounts, app.printStatus)) {
      stageCounts[app.printStatus]++;
    } else {
      unknownStatuses++;
    }
  });

  const safePercent = (value, denominator) => denominator
    ? Math.round((value / denominator) * 100)
    : 0;
  const percentages = Object.fromEntries(Object.entries(stageCounts).map(([stage, count]) => [
    stage,
    safePercent(count, total),
  ]));
  const activeItems = data.filter(app => app.printStatus === 'Queued' || app.printStatus === 'In Production');
  const active = activeItems.length;

  const barangayCounts = new Map();
  let missingBarangay = 0;
  data.forEach(app => {
    const barangay = String(app.barangay || '').trim();
    if (!barangay) {
      missingBarangay++;
      return;
    }
    barangayCounts.set(barangay, (barangayCounts.get(barangay) || 0) + 1);
  });
  const barangayRanking = [...barangayCounts.entries()]
    .map(([name, count]) => ({ name, count, percent: safePercent(count, total) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);
  const topThreeBarangays = barangayRanking.slice(0, 3);
  const topThreeCount = topThreeBarangays.reduce((sum, item) => sum + item.count, 0);

  const ageBuckets = { within24: 0, from24To48: 0, over48: 0, unknown: 0 };
  const ageEntries = [];
  activeItems.forEach(app => {
    const timestamp = app.sentAt ? new Date(app.sentAt).getTime() : NaN;
    const hours = Number.isFinite(timestamp) ? (now.getTime() - timestamp) / 3600000 : NaN;
    if (!Number.isFinite(hours) || hours < 0) {
      ageBuckets.unknown++;
      ageEntries.push({ app, hours: null });
      return;
    }
    if (hours <= ID_MAKER_ANALYTICS_CONFIG.within24Hours) ageBuckets.within24++;
    else if (hours <= ID_MAKER_ANALYTICS_CONFIG.within48Hours) ageBuckets.from24To48++;
    else ageBuckets.over48++;
    ageEntries.push({ app, hours });
  });
  const oldestEntry = ageEntries
    .filter(entry => entry.hours !== null)
    .sort((a, b) => b.hours - a.hours)[0] || null;
  const formatAge = hours => {
    const wholeHours = Math.floor(hours);
    const days = Math.floor(wholeHours / 24);
    const remainingHours = wholeHours % 24;
    if (days && remainingHours) return `${days} days ${remainingHours} hours`;
    if (days) return `${days} days`;
    return `${wholeHours} hours`;
  };
  const agingPercentages = {
    within24: safePercent(ageBuckets.within24, active),
    from24To48: safePercent(ageBuckets.from24To48, active),
    over48: safePercent(ageBuckets.over48, active),
    unknown: safePercent(ageBuckets.unknown, active),
  };

  const monthly = [];
  for (let offset = ID_MAKER_ANALYTICS_CONFIG.monthlyHistory - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    monthly.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      count: 0,
    });
  }
  const monthlyByKey = new Map(monthly.map(month => [month.key, month]));
  let completedWithoutTimestamp = 0;
  let completedWithTimestamp = 0;
  data.forEach(app => {
    if (app.printStatus === 'Completed' && !app.completedAt) completedWithoutTimestamp++;
    if (!app.completedAt) return;
    const completedAt = new Date(app.completedAt);
    if (!Number.isFinite(completedAt.getTime())) {
      if (app.printStatus === 'Completed') completedWithoutTimestamp++;
      return;
    }
    completedWithTimestamp++;
    const key = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}`;
    const month = monthlyByKey.get(key);
    if (month) month.count++;
  });
  const latestMonth = monthly[monthly.length - 1];
  const previousMonth = monthly[monthly.length - 2];
  const completedTotal = monthly.reduce((sum, month) => sum + month.count, 0);
  const monthlyAverage = Math.round((completedTotal / monthly.length) * 10) / 10;
  const monthlyDirection = latestMonth.count > previousMonth.count
    ? 'up'
    : latestMonth.count < previousMonth.count ? 'down' : 'unchanged';

  const agingState = ageBuckets.unknown > 0 || active === 0
    ? null
    : ageBuckets.over48 / active > ID_MAKER_ANALYTICS_CONFIG.agingHighShare
      ? 'High'
      : ageBuckets.over48 / active > ID_MAKER_ANALYTICS_CONFIG.agingElevatedShare ? 'Elevated' : 'Normal';
  const productionState = total && unknownStatuses === 0
    ? (stageCounts.Queued / total > ID_MAKER_ANALYTICS_CONFIG.productionElevatedQueuedShare ? 'Elevated' : 'Normal')
    : null;
  const barangayState = total && missingBarangay === 0
    ? (barangayRanking[0]?.count / total > ID_MAKER_ANALYTICS_CONFIG.barangayElevatedTopShare ? 'Elevated' : 'Normal')
    : null;
  const monthlyState = !ID_MAKER_COMPLETION_TIMESTAMP_AVAILABLE || completedWithoutTimestamp > 0 || completedTotal === 0
    ? null
    : (latestMonth.count < previousMonth.count ? 'Elevated' : 'Normal');

  const productionPct = percentages.Queued;
  const productionExpectedLead = `**${productionPct}% of total applications (${stageCounts.Queued} of ${total}) are currently queued.**`;
  const productionFallback = `${productionExpectedLead} ${stageCounts['In Production']} are in production, ${stageCounts.Printed} printed, ${stageCounts['In Transit']} in transit, and ${stageCounts.Completed} completed.`;
  const top = topThreeBarangays[0];
  const barangayExpectedLead = top
    ? `**${top.name} has the highest workload with ${top.count} applications (${top.percent}% of total applications).**`
    : null;
  const barangayFollow = topThreeBarangays.slice(1).map(item => `${item.name} (${item.count})`).join(' and ');
  const barangayFallback = top
    ? `${barangayExpectedLead}${barangayFollow ? ` It is followed by ${barangayFollow}.` : ''} The top three barangays account for ${safePercent(topThreeCount, total)}% of total applications.`
    : 'No data available for this period.';
  const agingExpectedLead = `**${ageBuckets.over48} of ${active} active applications (${agingPercentages.over48}%) have waited over ${ID_MAKER_ANALYTICS_CONFIG.within48Hours} hours.**`;
  const agingFallback = `${agingExpectedLead} ${ageBuckets.from24To48} (${agingPercentages.from24To48}%) have waited 24 to 48 hours and ${ageBuckets.within24} (${agingPercentages.within24}%) within 24 hours.${oldestEntry ? ` The oldest record has waited ${formatAge(oldestEntry.hours)}.` : ''}`;
  const monthlyExpectedLead = `**${latestMonth.count} IDs were completed in ${latestMonth.label}, ${monthlyDirection} from ${previousMonth.count} in ${previousMonth.label}.**`;
  const monthlyFallback = `${monthlyExpectedLead} ${completedTotal} IDs were completed over the last ${monthly.length} months, averaging ${monthlyAverage} per month.`;

  const noUnknownStageData = unknownStatuses === 0;
  return {
    data,
    total,
    stageCounts,
    percentages,
    unknownStatuses,
    unknownStatusPercent: safePercent(unknownStatuses, total),
    active,
    barangayRanking,
    topThreeBarangays,
    topThreeCount,
    missingBarangay,
    ageBuckets,
    agingPercentages,
    ageEntries,
    oldestEntry,
    formatAge,
    monthly,
    completedWithoutTimestamp,
    completedWithTimestamp,
    completedTotal,
    monthlyAverage,
    latestMonth,
    previousMonth,
    monthlyDirection,
    cards: {
      production: {
        hasData: total > 0 && noUnknownStageData,
        previousPeriodComparison: null,
        total,
        active,
        queued: stageCounts.Queued,
        inProduction: stageCounts['In Production'],
        printed: stageCounts.Printed,
        inTransit: stageCounts['In Transit'],
        completed: stageCounts.Completed,
        queuedPercent: percentages.Queued,
        productionPercent: percentages['In Production'],
        printedPercent: percentages.Printed,
        transitPercent: percentages['In Transit'],
        completedPercent: percentages.Completed,
        queuedElevatedThresholdPercent: ID_MAKER_ANALYTICS_CONFIG.productionElevatedQueuedShare * 100,
        statusLabel: productionState,
        expectedLead: productionExpectedLead,
        fallback: productionFallback,
      },
      barangay: {
        hasData: total > 0 && missingBarangay === 0 && topThreeBarangays.length > 0,
        previousPeriodComparison: null,
        total,
        ranking: topThreeBarangays.map(item => ({ barangay: item.name, count: item.count, percent: item.percent })),
        topThreePercent: safePercent(topThreeCount, total),
        elevatedThresholdPercent: ID_MAKER_ANALYTICS_CONFIG.barangayElevatedTopShare * 100,
        statusLabel: barangayState,
        expectedLead: barangayExpectedLead,
        fallback: barangayFallback,
      },
      aging: {
        hasData: active > 0 && ageBuckets.unknown === 0,
        previousPeriodComparison: null,
        active,
        within24: ageBuckets.within24,
        within24Percent: agingPercentages.within24,
        from24To48: ageBuckets.from24To48,
        from24To48Percent: agingPercentages.from24To48,
        over48: ageBuckets.over48,
        over48Percent: agingPercentages.over48,
        oldestAge: oldestEntry ? formatAge(oldestEntry.hours) : null,
        unknownTimestamps: ageBuckets.unknown,
        thresholdsHours: [ID_MAKER_ANALYTICS_CONFIG.within24Hours, ID_MAKER_ANALYTICS_CONFIG.within48Hours],
        elevatedThresholdPercent: ID_MAKER_ANALYTICS_CONFIG.agingElevatedShare * 100,
        highThresholdPercent: ID_MAKER_ANALYTICS_CONFIG.agingHighShare * 100,
        statusLabel: agingState,
        expectedLead: agingExpectedLead,
        fallback: agingFallback,
      },
      monthly: {
        hasData: ID_MAKER_COMPLETION_TIMESTAMP_AVAILABLE && completedTotal > 0 && completedWithoutTimestamp === 0,
        months: monthly.map(month => ({ ...month })),
        latestMonth: latestMonth.label,
        latestCount: latestMonth.count,
        previousMonth: previousMonth.label,
        previousCount: previousMonth.count,
        comparison: monthlyDirection,
        previousPeriodComparison: {
          latestMonth: latestMonth.label,
          latestCount: latestMonth.count,
          previousMonth: previousMonth.label,
          previousCount: previousMonth.count,
          direction: monthlyDirection,
        },
        elevatedWhenLatestBelowPrevious: true,
        completedTotal,
        monthCount: monthly.length,
        averagePerMonth: monthlyAverage,
        completedWithoutTimestamp,
        statusLabel: monthlyState,
        expectedLead: monthlyExpectedLead,
        fallback: monthlyFallback,
      },
    },
    statusLabels: {
      production: productionState,
      barangay: barangayState,
      aging: agingState,
      monthly: monthlyState,
    },
  };
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

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ||
        result.message ||
        'Failed to update queue status.'
      );
    }

    // ========================================
    // UPDATE LOCAL PAGE STATE
    // ========================================

    queueItem.printStatus = newStatus;
    queueItem.updatedAt = result.queue?.updated_at || new Date().toISOString();
    if (result.queue?.completed_at) queueItem.completedAt = result.queue.completed_at;
    const analyticsRecord = ID_MAKER_ANALYTICS_DATA?.find(item => String(item.application_id || item.id) === String(appId));
    if (analyticsRecord) {
      analyticsRecord.printStatus = newStatus;
      analyticsRecord.updatedAt = queueItem.updatedAt;
      analyticsRecord.completedAt = result.queue?.completed_at || analyticsRecord.completedAt || null;
    }
    systemAlertDismissed = false;
    updateAlertCounts();
    if (typeof saveLocalIdMakerQueue === 'function') {
      saveLocalIdMakerQueue(queueItem);
    }

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
      newStatus === 'Completed'
        ? 'Ready for Release'
        : 'In Process';

    // The print queue status is the primary operation. Keep it saved even if
    // the separate application workflow sync fails (for example, if that
    // endpoint is temporarily unavailable or rejects the transition).
    try {
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
        console.warn(
          'Queue status saved, but application workflow status sync failed:',
          applicationStatusResult.message || applicationStatusResponse.status
        );
      } else {
        // Update local application records only after the server confirms.
        if (typeof APP_DB !== 'undefined' && APP_DB[appId]) {
          APP_DB[appId].status = applicationStatus;
        }
        if (typeof LIVE_APPLICATIONS !== 'undefined' && Array.isArray(LIVE_APPLICATIONS)) {
          const liveApp = LIVE_APPLICATIONS.find(item => String(item.application_id || item.id) === String(appId));
          if (liveApp) liveApp.status = applicationStatus;
        }
        if (typeof FULL_APPLICANTS !== 'undefined' && Array.isArray(FULL_APPLICANTS)) {
          const fullApp = FULL_APPLICANTS.find(item => String(item.id) === String(appId));
          if (fullApp) fullApp.status = applicationStatus;
        }

        if (typeof syncApplicationsTableBadge === 'function') {
          syncApplicationsTableBadge(appId, applicationStatus);
        }
      }
    } catch (syncError) {
      console.warn(
        'Queue status saved, but application workflow status sync failed:',
        syncError
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
  var completed = 0;
  var errors = 0;
  const printQueueItems = ID_MAKER_QUEUE.filter(app => app.inPrintQueue !== false);

  printQueueItems.forEach(function(app){

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
    else if (app.printStatus === 'Completed') {
      completed++;
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
    completed,
    printQueueItems.length
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
    'Completed':'badge-issued',
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
  const root = opt.closest('.row-status-select') || document.querySelector('.row-status-select.open');
  if (!root) return;
  const statusColors = { 'Queued':'var(--warning)', 'In Production':'var(--primary)', 'Printed':'var(--purple)', 'In Transit':'var(--success)', 'Completed':'var(--success)' };
  const menu = opt.closest('.qsd-menu') || document.querySelector('.qsd-menu--portal');
  root.querySelector('.qsd-label').textContent = newStatus;
  root.querySelector('.qsd-trigger .qsd-dot').style.background = statusColors[newStatus] || 'var(--text-muted)';
  (menu || root).querySelectorAll('.qsd-option').forEach(o => o.classList.toggle('active', o.dataset.status === newStatus));
  root.classList.remove('open');
  if (menu) {
    menu.classList.remove('qsd-menu--portal');
    menu.style.cssText = '';
    root.appendChild(menu);
  }
  inlineStatusChange(appId, newStatus);
}

function toggleQueueFilter(event){
  event?.stopPropagation();
  const wrap = document.getElementById('queue-filter-wrap');
  const wasOpen = wrap.classList.contains('open');
  closeQueueFilter();
  if (wasOpen) return;

  wrap.classList.add('open');
  const trigger = wrap.querySelector('.queue-filter-trigger');
  const menu = document.getElementById('queue-filter-menu');
  if (!trigger || !menu) return;

  // Keep the filter menu out of the scrollable table and position it beside
  // the trigger, opening upward when the viewport has limited room below.
  menu.classList.add('queue-filter-menu--portal');
  document.body.appendChild(menu);
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 6;
  const width = Math.min(200, window.innerWidth - viewportPadding * 2);
  const maxHeight = Math.max(120, window.innerHeight - viewportPadding * 2);
  menu.style.position = 'fixed';
  menu.style.left = `${Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding))}px`;
  menu.style.width = `${width}px`;
  menu.style.minWidth = '0';
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.overflowY = 'auto';
  menu.style.zIndex = '10000';
  menu.style.top = `${viewportPadding}px`;

  const menuHeight = Math.min(menu.scrollHeight, maxHeight);
  const below = window.innerHeight - rect.bottom - viewportPadding - gap;
  const above = rect.top - viewportPadding - gap;
  const openBelow = below >= menuHeight || below >= above;
  const top = openBelow
    ? Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding)
    : Math.max(viewportPadding, rect.top - menuHeight - gap);
  menu.style.top = `${top}px`;
}

function toggleRowStatus(btn, event){
  event.stopPropagation();
  const root = btn.closest('.row-status-select');
  const wasOpen = root.classList.contains('open');
  document.querySelectorAll('.row-status-select.open').forEach(r => {
    r.classList.remove('open');
    const menu = document.querySelector('.qsd-menu--portal') || r.querySelector('.qsd-menu');
    if (menu) {
      menu.classList.remove('qsd-menu--portal');
      menu.style.cssText = '';
      r.appendChild(menu);
    }
  });
  if (wasOpen) return;

  root.classList.add('open');
  const menu = root.querySelector('.qsd-menu');
  if (!menu) return;

  // Move the open menu out of the scrollable table so it cannot be clipped or
  // offset by the table's containing block.
  menu.classList.add('qsd-menu--portal');
  document.body.appendChild(menu);

  const rect = btn.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 4;
  const maxHeight = Math.max(120, window.innerHeight - viewportPadding * 2);
  menu.style.position = 'fixed';
  menu.style.left = `${Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 170) - viewportPadding))}px`;
  menu.style.width = `${Math.max(rect.width, 170)}px`;
  menu.style.minWidth = '0';
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.overflowY = 'auto';
  menu.style.zIndex = '10000';
  menu.style.bottom = 'auto';
  menu.style.top = `${viewportPadding}px`;

  const menuHeight = Math.min(menu.scrollHeight, maxHeight);
  const below = window.innerHeight - rect.bottom - viewportPadding - gap;
  const above = rect.top - viewportPadding - gap;
  const openBelow = below >= menuHeight || below >= above;
  const top = openBelow
    ? Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding)
    : Math.max(viewportPadding, rect.top - menuHeight - gap);
  menu.style.top = `${top}px`;
}

function updateFilterCounts(){
  const counts = { Queued:0, 'In Production':0, Printed:0, 'In Transit':0, Completed:0 };
  ID_MAKER_QUEUE.forEach(a => { if(counts[a.printStatus] !== undefined) counts[a.printStatus]++; });
  const total = ID_MAKER_QUEUE.length;
  const allCount = document.getElementById('qf-count-all');
  const q = document.getElementById('qf-count-queued');
  const p = document.getElementById('qf-count-production');
  const pr = document.getElementById('qf-count-printed');
  const t = document.getElementById('qf-count-transit');
  const c = document.getElementById('qf-count-completed');
  if(allCount) allCount.textContent = total;
  if(q) q.textContent = counts.Queued;
  if(p) p.textContent = counts['In Production'];
  if(pr) pr.textContent = counts.Printed;
  if(t) t.textContent = counts['In Transit'];
  if(c) c.textContent = counts.Completed;
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
  const counts = { Queued:0, 'In Production':0, Printed:0, 'In Transit':0, Completed:0 };
  ID_MAKER_QUEUE.forEach(a => { if(counts[a.printStatus] !== undefined) counts[a.printStatus]++; });
  const map = { 'qt-queued': counts.Queued, 'qt-production': counts['In Production'], 'qt-printed': counts.Printed, 'qt-transit': counts['In Transit'], 'qt-completed': counts.Completed };
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
  systemAlertDismissed = true;
  if(b) b.style.display = 'none';
}

function updateAlertCounts(){
  const banner = document.getElementById('system-alert-banner');
  if (!banner) return;

  const title = banner.querySelector('.alert-banner__title');
  const list = banner.querySelector('.alert-banner__list');
  if (!list) return;

  const now = Date.now();
  const staleAfterMs = 48 * 60 * 60 * 1000;
  const getAge = value => {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp <= now
      ? now - timestamp
      : null;
  };

  const staleQueued = ID_MAKER_QUEUE.filter(app =>
    app.printStatus === 'Queued' &&
    (getAge(app.sentAt) ?? 0) > staleAfterMs
  ).length;
  const staleProduction = ID_MAKER_QUEUE.filter(app =>
    app.printStatus === 'In Production' &&
    (getAge(app.updatedAt) ?? 0) > staleAfterMs
  ).length;
  const staleTransit = ID_MAKER_QUEUE.filter(app =>
    app.printStatus === 'In Transit' &&
    (getAge(app.updatedAt) ?? 0) > staleAfterMs
  ).length;

  const delayedCount = staleQueued + staleProduction + staleTransit;
  if (title) title.textContent = delayedCount ? 'Queue needs attention' : 'Queue status';
  list.replaceChildren();
  const item = document.createElement('li');
  item.textContent = delayedCount
    ? `${delayedCount} queue ${delayedCount === 1 ? 'item needs' : 'items need'} attention due to delays.`
    : 'No delayed queue items right now.';
  list.appendChild(item);

  banner.style.display = systemAlertDismissed ? 'none' : '';
}

/* ── Queue Analytics additions: insights & optimization ── */
function updateIdMakerKPIs() {
  const counts = {
    Queued: 0,
    'In Production': 0,
    Printed: 0,
    'In Transit': 0,
    Completed: 0
  };

  const printQueueItems = ID_MAKER_QUEUE.filter(app => app.inPrintQueue !== false);

  printQueueItems.forEach(
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
      .textContent = counts.Completed;
  }

  if (cards[5]) {
    cards[5]
      .querySelector('.stat-card__value')
      .textContent = printQueueItems.length;
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

// Queue Analytics uses one computed snapshot for every visualization,
// threshold label, insight payload, and the oldest-items listing.
function updateAnalyticsRefreshStamp() {
  const stamp = document.getElementById('analytics-last-updated');
  if (!stamp) return;
  stamp.textContent = ID_MAKER_ANALYTICS_REFRESH_ERROR
    ? 'Last updated: unavailable (queue refresh failed)'
    : ID_MAKER_ANALYTICS_UPDATED_AT
      ? `Last updated: ${ID_MAKER_ANALYTICS_UPDATED_AT.toLocaleString()}`
      : 'Last updated: waiting for data';
}

function analyticsEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function analyticsRenderBoldText(element, text) {
  if (!element) return;
  const escaped = analyticsEscapeHtml(text);
  element.innerHTML = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function analyticsSetCardState(id, message, visible) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.display = visible ? 'flex' : 'none';
}

function initIdMakerStatusChart() {
  const ctx = mkCanvas('chart-idmaker-status');
  const stats = ID_MAKER_ANALYTICS_STATS;
  if (!ctx || !stats) return;

  const labels = ID_MAKER_ANALYTICS_STAGES.map(stage => stage.label);
  const values = ID_MAKER_ANALYTICS_STAGES.map(stage => stats.stageCounts[stage.key]);
  if (stats.unknownStatuses) {
    labels.push('Unrecognized');
    values.push(stats.unknownStatuses);
  }
  const total = stats.total;
  const empty = total === 0;
  analyticsSetCardState(
    'status-chart-state',
    ID_MAKER_ANALYTICS_REFRESH_ERROR
      ? 'Queue data could not be loaded.'
      : 'No data available for this period.',
    empty
  );

  setText('idm-total-count', total);
  const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#334155';
  ID_MAKER_ANALYTICS_STAGES.forEach(stage => {
    const countId = {
      'Queued': 'idm-awaiting-count',
      'In Production': 'idm-production-count',
      'Printed': 'idm-completed-count',
      'In Transit': 'idm-transit-count',
      'Completed': 'idm-done-count',
    }[stage.key];
    const shareId = {
      'Queued': 'idm-awaiting-share',
      'In Production': 'idm-production-share',
      'Printed': 'idm-printed-share',
      'In Transit': 'idm-transit-share',
      'Completed': 'idm-done-share',
    }[stage.key];
    setText(countId, stats.stageCounts[stage.key]);
    setText(shareId, `${stats.percentages[stage.key]}% of total`);
  });
  const unknownRow = document.getElementById('idm-unknown-row');
  if (unknownRow) unknownRow.style.display = stats.unknownStatuses ? '' : 'none';
  setText('idm-unknown-count', stats.unknownStatuses);
  setText('idm-unknown-share', `${stats.unknownStatusPercent}% of total`);

  if (CHARTS['idmaker-status']) CHARTS['idmaker-status'].destroy();
  CHARTS['idmaker-status'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [...ID_MAKER_ANALYTICS_STAGES.map(stage => stage.color), ...(stats.unknownStatuses ? ['#64748B'] : [])],
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#FFFFFF',
        borderWidth: 2,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TIP,
          callbacks: {
            label: context => ` ${context.label}: ${context.parsed} (${context.label === 'Unrecognized' ? stats.unknownStatusPercent : stats.percentages[context.label]}% of total applications)`,
          },
        },
      },
    },
  });
}

function initIdMakerBarangayChart() {
  const ctx = mkCanvas('chart-idmaker-barangay');
  const stats = ID_MAKER_ANALYTICS_STATS;
  if (!ctx || !stats) return;

  const ranking = stats.barangayRanking;
  const labels = ranking.map(item => item.name);
  const values = ranking.map(item => item.count);
  const empty = document.getElementById('empty-idmaker-barangay');
  if (empty) {
    empty.textContent = ID_MAKER_ANALYTICS_REFRESH_ERROR
      ? 'Queue data could not be loaded.'
      : stats.total === 0 || stats.missingBarangay > 0
        ? 'No complete barangay data available for this period.'
        : 'No data available for this period.';
    empty.style.display = (!stats.total || stats.missingBarangay > 0) ? 'flex' : 'none';
  }

  if (CHARTS['idmaker-barangay']) CHARTS['idmaker-barangay'].destroy();
  const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#334155';
  const valueLabels = {
    id: 'idmaker-barangay-values',
    afterDatasetsDraw(chart) {
      const { ctx: canvasContext } = chart;
      canvasContext.save();
      canvasContext.font = '600 11px sans-serif';
      canvasContext.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#334155';
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        canvasContext.textAlign = 'left';
        canvasContext.textBaseline = 'middle';
        canvasContext.fillText(String(values[index]), bar.x + 7, bar.y);
      });
      canvasContext.restore();
    },
  };

  CHARTS['idmaker-barangay'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Applications',
        data: values,
        backgroundColor: values.map((value, index) => index === 0 ? '#2563EB' : '#93B4F5'),
        borderRadius: 5,
        borderSkipped: false,
        maxBarThickness: 24,
      }],
    },
    plugins: [valueLabels],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 28 } },
      plugins: { legend: { display: false }, tooltip: { ...TIP } },
      scales: {
        x: { display: false, beginAtZero: true, suggestedMax: Math.max(1, ...(values.length ? values : [1])) * 1.15, grid: { display: false } },
        y: { grid: { display: false }, ticks: { color: axisColor, font: { size: 11 } }, border: { display: false } },
      },
    },
  });
}

function initIdMakerMonthlyOutputChart() {
  const ctx = mkCanvas('chart-idmaker-monthly-output');
  const stats = ID_MAKER_ANALYTICS_STATS;
  if (!ctx || !stats) return;
  const values = stats.monthly.map(month => month.count);
  const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#334155';
  const empty = document.getElementById('empty-idmaker-monthly-output');
  const incomplete = stats.completedWithoutTimestamp > 0;
  if (empty) {
    empty.textContent = ID_MAKER_ANALYTICS_REFRESH_ERROR
      ? 'Queue data could not be loaded.'
      : !ID_MAKER_COMPLETION_TIMESTAMP_AVAILABLE
        ? 'Monthly output is unavailable until the completion timestamp migration is applied.'
      : incomplete
        ? 'No data available for this period. Completion timestamps are missing for some completed records.'
        : 'No data available for this period.';
    empty.style.display = stats.cards.monthly.hasData ? 'none' : 'flex';
  }

  if (CHARTS['idmaker-monthly-output']) CHARTS['idmaker-monthly-output'].destroy();
  const valueLabels = {
    id: 'idmaker-monthly-values',
    afterDatasetsDraw(chart) {
      const { ctx: canvasContext } = chart;
      canvasContext.save();
      canvasContext.font = '700 11px sans-serif';
      canvasContext.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#334155';
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        if (!values[index]) return;
        canvasContext.textAlign = 'center';
        canvasContext.textBaseline = 'bottom';
        canvasContext.fillText(String(values[index]), bar.x, bar.y - 5);
      });
      canvasContext.restore();
    },
  };
  CHARTS['idmaker-monthly-output'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stats.monthly.map(month => month.label),
      datasets: [{
        label: 'Completed IDs',
        data: values,
        backgroundColor: '#22C55E',
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 48,
        categoryPercentage: 0.88,
        barPercentage: 0.92,
      }],
    },
    plugins: [valueLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      plugins: { legend: { display: false }, tooltip: { ...TIP } },
      scales: {
        x: { ticks: { color: axisColor, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1, color: axisColor }, grid: { color: 'rgba(100,116,139,.14)' } },
      },
    },
  });
}

function initIdMakerSLA() {
  const stats = ID_MAKER_ANALYTICS_STATS;
  if (!stats) return;
  const total = stats.active;
  const dataState = document.getElementById('sla-data-state');
  if (dataState) {
    const unavailable = total === 0
      ? 'No data available for this period.'
      : total > 0 && stats.active === 0
        ? 'No active applications are available for queue aging.'
        : '';
    dataState.textContent = unavailable;
    dataState.style.display = unavailable ? 'block' : 'none';
  }
  const aging = stats.ageBuckets;
  setText('sla-active', total);
  setText('sla-within24', aging.within24);
  setText('sla-24to48', aging.from24To48);
  setText('sla-over48', aging.over48);

  const unknownNote = document.getElementById('sla-unknown-note');
  if (unknownNote) {
    unknownNote.hidden = aging.unknown === 0;
    unknownNote.textContent = aging.unknown
      ? `${aging.unknown} active ${aging.unknown === 1 ? 'record has' : 'records have'} no valid sent timestamp; shown as unknown.`
      : '';
  }

  const segments = [
    ['sla-bar-on-time', aging.within24, '#16A34A'],
    ['sla-bar-24h', aging.from24To48, '#F59E0B'],
    ['sla-bar-48h', aging.over48, '#DC2626'],
    ['sla-bar-unknown', aging.unknown, '#94A3B8'],
  ];
  segments.forEach(([id, count, color]) => {
    const segment = document.getElementById(id);
    if (!segment) return;
    segment.style.flexGrow = String(count);
    segment.style.flexBasis = '0';
    segment.style.minWidth = count ? '4px' : '0';
    segment.style.backgroundColor = color;
  });
  const bar = document.querySelector('.sla-segmented-bar');
  if (bar) {
    bar.setAttribute('aria-label', `Queue aging: ${aging.within24} within 24 hours, ${aging.from24To48} from 24 to 48 hours, ${aging.over48} over 48 hours, ${aging.unknown} unknown; ${total} active applications total.`);
  }
}

function renderIdMakerInsightCard(key, insight, stats) {
  const prefix = {
    production: 'idmaker-status',
    barangay: 'idmaker-barangay',
    aging: 'idmaker-aging',
    monthly: 'idmaker-monthly',
  }[key];
  if (!prefix) return;
  const statusElement = document.getElementById(`${prefix}-status`);
  const sourceElement = document.getElementById(`${prefix}-source`);
  const textElement = document.getElementById(`${prefix}-insight-text`);
  const card = document.querySelector(`[data-insight-card="${key}"]`);
  if (!textElement || !stats) return;

  const status = stats.statusLabel || 'Incomplete';
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.dataset.status = status.toLowerCase();
  }
  if (sourceElement) sourceElement.textContent = insight?.source === 'ai'
    ? 'AI-generated from live data'
    : 'Generated from live data';
  if (card) {
    card.dataset.status = status.toLowerCase();
    card.dataset.source = insight?.source === 'ai' ? 'ai' : 'fallback';
  }
  analyticsRenderBoldText(textElement, insight?.text || stats.fallback || 'No data available for this period.');
}

function renderIdMakerFallbackInsights(stats) {
  if (!stats) return;
  Object.entries(stats.cards).forEach(([key, cardStats]) => {
    const text = cardStats.hasData
      ? cardStats.fallback
      : 'No data available for this period.';
    renderIdMakerInsightCard(key, { text, source: 'fallback' }, cardStats);
  });
}

async function generateIdMakerInsights(stats) {
  const requestKey = JSON.stringify(stats.cards);
  if (requestKey === ID_MAKER_INSIGHT_REQUEST_KEY) return;
  ID_MAKER_INSIGHT_REQUEST_KEY = requestKey;
  const requestVersion = ++ID_MAKER_INSIGHT_REQUEST_VERSION;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ID_MAKER_ANALYTICS_CONFIG.insightTimeoutMs);
  try {
    const response = await fetch(`${ID_MAKER_API}/analytics-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ cards: stats.cards }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `Insight request failed (${response.status})`);
    if (requestVersion !== ID_MAKER_INSIGHT_REQUEST_VERSION) return;
    Object.entries(stats.cards).forEach(([key, cardStats]) => {
      const insight = result.insights?.[key];
      if (cardStats.hasData && insight?.text) renderIdMakerInsightCard(key, insight, cardStats);
    });
  } catch (error) {
    console.warn('[ID Maker analytics] Insight request failed; live-data summaries remain visible.', error);
  } finally {
    clearTimeout(timeout);
  }
}

function updateIdMakerAnalyticsInsights() {
  const stats = ID_MAKER_ANALYTICS_STATS;
  if (!stats) {
    ['production', 'barangay', 'aging', 'monthly'].forEach(key => {
      const prefix = { production: 'idmaker-status', barangay: 'idmaker-barangay', aging: 'idmaker-aging', monthly: 'idmaker-monthly' }[key];
      const text = document.getElementById(`${prefix}-insight-text`);
      const status = document.getElementById(`${prefix}-status`);
      const source = document.getElementById(`${prefix}-source`);
      if (text) text.textContent = ID_MAKER_ANALYTICS_REFRESH_ERROR ? 'Queue data could not be loaded.' : 'Loading live data…';
      if (status) {
        status.textContent = ID_MAKER_ANALYTICS_REFRESH_ERROR ? 'Unavailable' : 'Loading';
        status.dataset.status = ID_MAKER_ANALYTICS_REFRESH_ERROR ? 'unavailable' : 'incomplete';
      }
      if (source) source.textContent = 'Generated from live data';
    });
    return;
  }
  renderIdMakerFallbackInsights(stats);
  generateIdMakerInsights(stats);
}

function updateIdMakerAnalytics() {
  updateAnalyticsRefreshStamp();
  if (!ID_MAKER_ANALYTICS_DATA) {
    ID_MAKER_ANALYTICS_STATS = null;
    const stateText = ID_MAKER_ANALYTICS_REFRESH_ERROR ? 'Queue data could not be loaded.' : 'Loading live data…';
    analyticsSetCardState('status-chart-state', stateText, true);
    analyticsSetCardState('empty-idmaker-barangay', stateText, true);
    analyticsSetCardState('empty-idmaker-monthly-output', stateText, true);
    const slaState = document.getElementById('sla-data-state');
    if (slaState) {
      slaState.textContent = stateText;
      slaState.style.display = 'block';
    }
    updateIdMakerAnalyticsInsights();
    return;
  }

  ID_MAKER_ANALYTICS_STATS = computeIdMakerAnalyticsStats(ID_MAKER_ANALYTICS_DATA, ID_MAKER_ANALYTICS_UPDATED_AT || new Date());
  const module = document.getElementById('mod-id-maker-analytics');
  if (!module || !module.classList.contains('active')) return;
  initIdMakerStatusChart();
  initIdMakerBarangayChart();
  initIdMakerSLA();
  initIdMakerMonthlyOutputChart();
  updateIdMakerAnalyticsInsights();
}

function downloadIdMakerAnalyticsReport() {
  if (!ID_MAKER_ANALYTICS_STATS) {
    showToast('Queue analytics are unavailable; refresh the queue before exporting.', 'error');
    return;
  }
  const previousTitle = document.title;
  const date = (ID_MAKER_ANALYTICS_UPDATED_AT || new Date()).toISOString().slice(0, 10);
  document.title = `ID Maker Queue Analytics ${date}`;
  window.print();
  window.setTimeout(() => { document.title = previousTitle; }, 1000);
}

document.addEventListener('themechange', () => {
  const analyticsModule = document.getElementById('mod-id-maker-analytics');
  if (analyticsModule?.classList.contains('active')) updateIdMakerAnalytics();
});

document.addEventListener('click',function(e){
  if(!e.target.closest('.queue-filter-dropdown')) closeQueueFilter();
});

document.addEventListener('click', () => document.querySelectorAll('.row-status-select.open').forEach(r => r.classList.remove('open')));

document.addEventListener('DOMContentLoaded', async function () {

  // Load queue from Supabase
  await loadIdMakerQueueFromDatabase(false);

});

// Real-time synchronization with Staff Portal Small Form Generator
window.addEventListener('storage', function(e) {
  if (e.key === 'seniorid_id_maker_local_queue') {
    try {
      const updatedList = JSON.parse(e.newValue || '[]');
      if (Array.isArray(updatedList)) {
        updatedList.forEach(function(item) {
          const itemId = String(item.id || item.application_id);
          const idx = ID_MAKER_QUEUE.findIndex(q => String(q.id || q.application_id) === itemId);
          if (idx >= 0) {
            ID_MAKER_QUEUE[idx] = Object.assign({}, ID_MAKER_QUEUE[idx], item);
          } else {
            ID_MAKER_QUEUE.unshift(item);
          }
        });
        initIdMakerQueue();
        updateIdMakerKPIs();
      }
    } catch (err) {
      console.warn('Storage sync error:', err);
    }
  }
});

if (typeof BroadcastChannel !== 'undefined') {
  try {
    const queueChannel = new BroadcastChannel('idmaker_queue_channel');
    queueChannel.onmessage = function(event) {
      if (event.data && event.data.type === 'QUEUE_UPDATED' && event.data.entry) {
        const item = event.data.entry;
        const itemId = String(item.id || item.application_id);
        const idx = ID_MAKER_QUEUE.findIndex(q => String(q.id || q.application_id) === itemId);
        if (idx >= 0) {
          ID_MAKER_QUEUE[idx] = Object.assign({}, ID_MAKER_QUEUE[idx], item);
        } else {
          ID_MAKER_QUEUE.unshift(item);
        }
        initIdMakerQueue();
        updateIdMakerKPIs();
      }
    };
  } catch (err) {}
}
