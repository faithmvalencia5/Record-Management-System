/* =========================================================
   SKELETON LOADER HELPERS
   Shared by staff, admin and ID Maker portals.
   Styles live in base.css (.sk-cell, .skeleton, .is-loading).
   ========================================================= */

window.Skeleton = (function () {

  const WIDTHS = [62, 88, 45, 74, 56, 92, 40, 68, 80, 50];

  function resolveEl(target) {
    return typeof target === 'string'
      ? document.getElementById(target)
      : target;
  }

  function columnCount(tbody) {
    const head = tbody?.closest('table')?.tHead;
    const count = head?.rows?.[0]?.cells?.length;
    return count && count > 0 ? count : 5;
  }

  /** Returns HTML for `rows` skeleton table rows with `cols` cells. */
  function rowsHtml(cols, rows) {
    let html = '';
    for (let r = 0; r < (rows || 5); r++) {
      html += '<tr class="sk-row" aria-hidden="true">';
      for (let c = 0; c < cols; c++) {
        const w = WIDTHS[(r + c) % WIDTHS.length];
        html +=
          '<td><span class="skeleton sk-cell" style="width:' + w + '%"></span></td>';
      }
      html += '</tr>';
    }
    return html;
  }

  /** Replaces a tbody's contents with skeleton rows. */
  function setTable(target, rows) {
    const tbody = resolveEl(target);
    if (!tbody) return;
    tbody.innerHTML = rowsHtml(columnCount(tbody), rows || 5);
    tbody.setAttribute('aria-busy', 'true');
  }

  /** True if the tbody currently shows skeleton rows. */
  function isShowing(target) {
    const tbody = resolveEl(target);
    return Boolean(tbody && tbody.querySelector('.sk-row'));
  }

  /** Toggles the loading style on one or more KPI value elements/containers. */
  function setLoading(target, isLoading) {
    const list = typeof target === 'string'
      ? document.querySelectorAll(target)
      : (target instanceof Element ? [target] : (target || []));
    list.forEach(function (el) {
      if (!el) return;
      el.classList.toggle('is-loading', Boolean(isLoading));
    });
  }

  /** Clears the busy flag set by setTable(). */
  function clearBusy(target) {
    const tbody = resolveEl(target);
    if (tbody) tbody.removeAttribute('aria-busy');
  }

  function pageReady() {
    document.body.classList.remove('skeleton-page-loading');
    document.body.removeAttribute('aria-busy');
  }

  return {
    rowsHtml: rowsHtml,
    setTable: setTable,
    isShowing: isShowing,
    setLoading: setLoading,
    clearBusy: clearBusy,
    pageReady: pageReady,
    startLoading: startLoading,
    endLoading: endLoading
  };

  function startLoading(el) {
    const target = typeof el === 'string' ? document.querySelectorAll(el) : (el instanceof Element ? [el] : (el || []));
    target.forEach(function (e) {
      if (!e) return;
      e.classList.add('is-loading');
      if (e.tagName === 'TBODY') {
        e.setAttribute('aria-busy', 'true');
      }
    });
  }

  function endLoading(el) {
    const target = typeof el === 'string' ? document.querySelectorAll(el) : (el instanceof Element ? [el] : (el || []));
    target.forEach(function (e) {
      if (!e) return;
      e.classList.remove('is-loading');
      if (e.tagName === 'TBODY') {
        e.removeAttribute('aria-busy');
      }
    });
  }

})();
