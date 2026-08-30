(function () {
  "use strict";
  // The actual theme (data-bs-theme) is already set by an inline <script>
  // in <head>, before first paint, to avoid a flash of the wrong theme -
  // this only wires up the toggle buttons and reacts to later changes
  // (a click, or the OS preference changing while on "system").
  var THEME_KEY = "kaikatsu-crowd-theme";
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function currentChoice() {
    return localStorage.getItem(THEME_KEY) || "system";
  }

  function applyTheme(choice) {
    var dark = choice === "system" ? media.matches : choice === "dark";
    document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-theme-choice") === choice);
    });
  }

  applyTheme(currentChoice());
  media.addEventListener("change", function () {
    if (currentChoice() === "system") applyTheme("system");
  });
  document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var choice = btn.getAttribute("data-theme-choice");
      localStorage.setItem(THEME_KEY, choice);
      applyTheme(choice);
    });
  });

  // Matches config/stores.json's settings.timezone - this project only ever
  // covers Japanese stores, so it isn't threaded through as a parameter.
  var TZ = "Asia/Tokyo";
  var EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function nowInTz() {
    var parts = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var jsIndex = EN_WEEKDAYS.indexOf(parts.weekday);
    var pyWeekday = jsIndex === 0 ? 6 : jsIndex - 1; // Mon=0..Sun=6, matching the generator
    return { pyWeekday: pyWeekday, hour: parseInt(parts.hour, 10), minute: parseInt(parts.minute, 10) };
  }

  function slotToMinutes(slot) {
    var parts = slot.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  // Data collection is sparse for weeks/months after a store is registered
  // (or after a schema/interval change), so the exact current slot often
  // has no matching element yet - falling back to the nearest one that
  // does exist means "scroll to now" always does something useful instead
  // of silently no-op'ing whenever there's no perfect match.
  function nearestBySlot(elements, targetMinutes) {
    var best = null;
    var bestDiff = Infinity;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var slot = el.getAttribute("data-slot");
      if (!slot) continue;
      var diff = Math.abs(slotToMinutes(slot) - targetMinutes);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = el;
      }
    }
    return best;
  }

  // Reusable so the same init/scroll logic can run both at page load (for
  // whichever range panel starts visible) and again whenever a hidden
  // range panel (3m/1y) is revealed later - scrollIntoView is a no-op on
  // a display:none ancestor, so a freshly-revealed panel needs a fresh
  // attempt, not just whatever ran once at load time.
  function initHeatmapMobile(container) {
    var tabs = container.querySelectorAll(".hm-tab");
    var panels = container.querySelectorAll(".hm-day");
    var tabsBar = container.querySelector(".hm-tabs");
    if (!tabs.length || !panels.length) return;

    function activate(day, scrollCurrentIntoView) {
      tabs.forEach(function (tab) {
        tab.classList.toggle("active", tab.getAttribute("data-day") === String(day));
      });
      panels.forEach(function (panel) {
        panel.style.display = panel.getAttribute("data-day") === String(day) ? "block" : "none";
      });
      if (!scrollCurrentIntoView) return;
      container.querySelectorAll(".hm-row.now-slot").forEach(function (r) { r.classList.remove("now-slot"); });
      var now = nowInTz();
      if (String(now.pyWeekday) !== String(day)) return;
      var panel = container.querySelector('.hm-day[data-day="' + day + '"]');
      var row = panel && nearestBySlot(panel.querySelectorAll(".hm-row"), now.hour * 60 + now.minute);
      if (row) {
        row.classList.add("now-slot");
        row.scrollIntoView({ block: "center" });
      }
    }

    if (!container.dataset.hmWired) {
      container.dataset.hmWired = "1";
      tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          activate(tab.getAttribute("data-day"), false);
        });
      });
      tabsBar.style.display = "flex";
    }
    activate(nowInTz().pyWeekday, true);
  }

  function scrollHourlyToNow(wrap) {
    wrap.querySelectorAll("tr.now-slot").forEach(function (r) { r.classList.remove("now-slot"); });
    var now = nowInTz();
    var row = nearestBySlot(wrap.querySelectorAll("tr[data-slot]"), now.hour * 60 + now.minute);
    if (row) {
      row.classList.add("now-slot");
      row.scrollIntoView({ block: "center" });
    }
  }

  // Marks both the header and every body cell in the matched column so
  // "now" reads as a highlighted column, not just one header cell - a
  // wide table makes a single highlighted <th> easy to lose track of
  // once you've scrolled away from the header row.
  function scrollDesktopHeatmapToNow(wrap) {
    var headers = wrap.querySelectorAll("th[data-slot]");
    headers.forEach(function (h) { h.classList.remove("now-slot"); });
    wrap.querySelectorAll("td.now-slot").forEach(function (td) { td.classList.remove("now-slot"); });
    var now = nowInTz();
    var header = nearestBySlot(headers, now.hour * 60 + now.minute);
    if (!header) return;
    header.classList.add("now-slot");
    var index = Array.prototype.indexOf.call(headers, header);
    wrap.querySelectorAll("tbody tr").forEach(function (tr) {
      var cell = tr.querySelectorAll("td")[index];
      if (cell) cell.classList.add("now-slot");
    });
    // block:"nearest" keeps this to a horizontal scroll only - the column
    // is already vertically in view as part of the normal page flow, this
    // must not yank the whole page down to the heatmap on load.
    header.scrollIntoView({ inline: "center", block: "nearest" });
  }

  document.querySelectorAll(".heatmap-mobile").forEach(initHeatmapMobile);
  document.querySelectorAll(".hourly-wrap").forEach(scrollHourlyToNow);
  document.querySelectorAll(".heatmap-desktop").forEach(scrollDesktopHeatmapToNow);

  document.querySelectorAll(".heatmap-section").forEach(function (section) {
    var tabs = section.querySelectorAll("[data-range-choice]");
    var panels = section.querySelectorAll(".range-panel");
    var tabsBar = section.querySelector(".range-tabs");
    if (!tabs.length || !panels.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var range = tab.getAttribute("data-range-choice");
        tabs.forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        panels.forEach(function (panel) {
          var match = panel.getAttribute("data-range") === range;
          panel.style.display = match ? "block" : "none";
          if (!match) return;
          var mobile = panel.querySelector(".heatmap-mobile");
          if (mobile) initHeatmapMobile(mobile);
          var desktopHeatmap = panel.querySelector(".heatmap-desktop");
          if (desktopHeatmap) scrollDesktopHeatmapToNow(desktopHeatmap);
        });
      });
    });
    tabsBar.style.display = "flex";
  });
})();
