/* =========================================================
   THEME CONTROLLER
   - Default is always light unless the user chose dark.
   - Preference is saved in localStorage under "senioridTheme".
   - Applies <html data-theme="light|dark"> (see base.css).
   - Wires the single icon toggle in each portal sidebar footer.
   The inline head script applies saved preference before first paint.
   ========================================================= */

window.Theme = (function () {

  var KEY = 'senioridTheme';
  var root = document.documentElement;

  function getSaved() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function save(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) { /* storage unavailable: keep in-memory only */ }
  }

  function syncToggles(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      var target = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + target + ' mode');
      btn.setAttribute('title', 'Switch to ' + target + ' mode');
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.querySelectorAll('[data-theme-icon]').forEach(function (icon) {
        icon.hidden = icon.getAttribute('data-theme-icon') !== target;
      });
    });
  }

  // Keep Chart.js axes/legends readable in both themes.
  function syncCharts(theme) {
    if (!window.Chart) return;

    var text = theme === 'dark' ? '#94A3B8' : '#64748B';
    var grid = theme === 'dark' ? 'rgba(148,163,184,0.15)' : 'rgba(15,23,42,0.08)';

    Chart.defaults.color = text;
    Chart.defaults.borderColor = grid;

    Object.values(Chart.instances || {}).forEach(function (chart) {
      var opts = chart.options || {};
      var scales = opts.scales || {};

      Object.keys(scales).forEach(function (key) {
        var s = scales[key];
        if (s.ticks) s.ticks.color = text;
        if (s.grid) s.grid.color = grid;
        if (s.title) s.title.color = text;
      });

      var legend = opts.plugins && opts.plugins.legend;
      if (legend && legend.labels) legend.labels.color = text;

      chart.update('none');
    });
  }

  function apply(theme, persist) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    if (persist) save(theme);
    syncToggles(theme);
    syncCharts(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  function get() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function set(theme) {
    apply(theme === 'dark' ? 'dark' : 'light', true);
  }

  function toggle() {
    set(get() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    // Default to light: only "dark" is ever read from storage.
    apply(getSaved(), false);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', toggle);
    });
  }

  // Sync across open tabs of the same portal.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(getSaved(), false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { get: get, set: set, toggle: toggle };

})();
