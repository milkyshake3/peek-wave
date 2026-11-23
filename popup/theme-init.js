(function () {
  try {
    var t = localStorage.getItem('peekWaveTheme');
    var normalized = (t === 'light' || t === 'auto' || t === 'dark') ? t : 'dark';
    document.documentElement.setAttribute('data-theme', normalized);
  } catch {}
})();
