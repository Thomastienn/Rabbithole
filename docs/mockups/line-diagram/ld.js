// Mockup only. Applies the theme and scheme picked in the bar, on a Settings swatch or in the URL hash
// (for example read.html#enamel-light), and remembers the pick across screens.
const THEMES = { main: "Main Line", enamel: "Enamel", tunnel: "Tunnel", timetable: "Timetable", ferry: "Ferry", terminus: "Terminus" };
const root = document.documentElement, lt = document.getElementById("lt");
const hash = location.hash.slice(1).split("-");
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const sel = document.createElement("select");
sel.setAttribute("aria-label", "Theme");
for (const [id, label] of Object.entries(THEMES)) sel.add(new Option(label, id));
lt.parentElement.before(sel);
function theme(id) {
  root.dataset.theme = sel.value = id;
  for (const b of document.querySelectorAll(".swt")) {
    b.classList.toggle("on", b.dataset.pick === id);
    b.setAttribute("aria-pressed", b.dataset.pick === id);
  }
}
theme(hash.find((h) => h in THEMES) ?? (get("ld-theme") in THEMES ? get("ld-theme") : "main"));
lt.checked = hash.includes("light") || (!hash.includes("dark") && get("ld-light") === "1");
sel.onchange = () => { theme(sel.value); set("ld-theme", sel.value); };
lt.onchange = () => set("ld-light", lt.checked ? "1" : "0");
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]");
  if (b) { theme(b.dataset.pick); set("ld-theme", b.dataset.pick); }
});
