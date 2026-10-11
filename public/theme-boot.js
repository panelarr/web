// SPDX-License-Identifier: GPL-3.0-or-later
// Applies the saved theme before the app loads, so there is no flash of the wrong colours.
// A separate file rather than an inline script, so the strict CSP holds. The app (src/theme)
// writes what this reads; keep the two in step.
(function () {
  var root = document.documentElement;
  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    var cache = JSON.parse(localStorage.getItem("panelarr.theme") || "null");
    if (cache && cache.version === 1) {
      var theme = cache.system && dark ? cache.dark : cache.light;
      for (var name in theme.vars) root.style.setProperty(name, theme.vars[name]);
      root.classList.toggle("dark", theme.dark);
      root.style.colorScheme = theme.dark ? "dark" : "light";
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta && theme.vars["--background"]) meta.setAttribute("content", theme.vars["--background"]);
      return;
    }
  } catch (e) {
    // Storage blocked or corrupt: fall through to the system's light or dark.
  }
  root.classList.toggle("dark", dark);
  root.style.background = dark ? "#0b0b0f" : "#ffffff";
})();
