// Runs before first paint. Default theme is LIGHT regardless of the OS setting; the toggle keeps the choice for this tab session only, so every new visit opens Light.
(function () {
  var t = 'light';
  try { var s = sessionStorage.getItem('bf-theme'); if (s === 'dark' || s === 'light') t = s; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#000000' : '#EEF1F5');
})();
