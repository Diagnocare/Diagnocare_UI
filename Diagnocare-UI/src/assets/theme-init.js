// Applies the saved theme before Angular bootstraps (kept external so CSP can forbid inline script).
  (function () {
    try {
      var valid = ['light', 'dark', 'midnight', 'warm', 'system'];
      var theme = null;
      // Primary: user-specific key (requires a live token in sessionStorage)
      var token = sessionStorage.getItem('authToken');
      if (token) {
        var parts = token.split('.');
        if (parts.length >= 2) {
          var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          var username = payload && payload.sub;
          if (username) {
            theme = localStorage.getItem('diagnocare_theme_' + username);
          }
        }
      }
      // Fallback: last-applied theme written by ThemeService.apply()
      // Covers the case where the token was already cleared before the full
      // page reload (e.g. logout flow: clearAuth() → window.location.href = '/').
      if (!theme || valid.indexOf(theme) === -1) {
        theme = localStorage.getItem('diagnocare_theme_last');
      }
      if (valid.indexOf(theme) !== -1) {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch (e) { /* silently ignore — Angular will apply the theme after bootstrap */ }
  })();
