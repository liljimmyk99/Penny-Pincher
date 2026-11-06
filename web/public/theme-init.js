// Sets the theme before first paint so there is no flash. Mirrors src/theme/theme.ts.
// A classic, render-blocking script loaded from index.html's <head>. It is a file
// rather than inline so the Content-Security-Policy needs no 'unsafe-inline' or hash.
(function () {
  var pref = "system";
  try {
    var stored = localStorage.getItem("pp.theme");
    if (stored === "light" || stored === "dark" || stored === "system") pref = stored;
  } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
