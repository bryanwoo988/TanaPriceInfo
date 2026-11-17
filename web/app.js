"use strict";

const REGION_NAMES = {
  north: "Utara", south: "Selatan", central: "Tengah",
  east_coast: "Pantai Timur", sabah: "Sabah", sarawak: "Sarawak",
};
const MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const CHART_DAYS = 30;
const LIST_LIMIT = 300;

const $ = (id) => document.getElementById(id);
const rm = (v) => (v == null ? "—" : v.toFixed(2));
// Match at the start of a word: "ayam" finds "AYAM HIDUP" but not "BAYAM".
const matcher = (q) => {
  const esc = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return esc ? new RegExp(`(^|[^A-Z0-9])${esc}`, "i") : null;
};

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (_) { /* private mode: ignore */ }
  return null;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/* ---------- sources & freshness ---------- */
const DAY = 86400000;
// "Today" in Malaysia, whatever the phone's time zone is.
const todayMYT = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const ageDays = (iso) => Math.round((Date.parse(todayMYT()) - Date.parse(iso.slice(0, 10))) / DAY);
const fmtTime = (iso) => (iso ? `${fmtDate(iso).replace(/ \d{4}$/, "")}, ${iso.slice(11, 16)}` : "—");
const SHORT = { mpob: "MPOB", fama: "FAMA", pricecatcher: "PriceCatcher" };

function freshness(src) {
  if (!src || !src.data_date) return { level: "bad", label: "Tiada data" };
  const age = ageDays(src.data_date);
  if (src.ok === false) return { level: "bad", label: "Gagal dikutip", age };
  if (age > src.max_age_days) return { level: "warn", label: `Lewat ${age} hari`, age };
  return { level: "ok", label: "Terkini", age };
}

function renderSource(key, src) {
  const box = $(`src-${key}`);
  if (!box) return null;
  const f = freshness(src);
  const dateLabel = src?.date_kind === "collected" ? "Tarikh dikutip" : "Harga bertarikh";
  const kids = [
    el("div", { class: "src-top" },
      el("span", { class: `pill ${f.level}` }, f.label),
      src?.url ? el("a", { href: src.url, target: "_blank", rel: "noopener" }, `Semak di ${src.name} ↗`) : null),
    el("p", { class: "small muted" },
      `${dateLabel}: ${fmtDate(src?.data_date)}` +
      (f.age != null ? ` (${f.age === 0 ? "hari ini" : `${f.age} hari lalu`})` : "") +
      (src?.last_success ? ` · Kutipan berjaya: ${fmtTime(src.last_success)}` : "")),
  ];
  if (src?.ok === false) {
    kids.push(el("p", { class: "small warn-text" },
      `Kutipan terakhir gagal (${fmtTime(src.last_attempt)}). Harga di bawah mungkin lama.`));
  }
  if (src?.date_kind === "collected") {
    kids.push(el("p", { class: "small muted" }, `${src.name} tidak menyatakan tarikh harga; ini tarikh data dikutip.`));
  }
  box.replaceChildren(...kids);
  return f;
}

function renderHealth(sources) {
  const bad = Object.entries(sources || {})
    .map(([k, s]) => [SHORT[k] || k, freshness(s)])
    .filter(([, f]) => f.level !== "ok");
  const h = $("health");
  h.hidden = !bad.length;
  h.textContent = bad.length ? `⚠ ${bad.map(([n, f]) => `${n}: ${f.label}`).join(" · ")}` : "";
}

/* ---------- MPOB ---------- */
let mpobDays = [];
let selRegion = store("region") || "north";

function renderMpob(latest) {
  const list = $("mpob-list");
  list.replaceChildren();
  if (!latest || !latest.date) {
    $("mpob-date").textContent = "Tiada data.";
    return;
  }
  $("mpob-date").textContent =
    latest.previous_date ? `Perubahan berbanding ${fmtDate(latest.previous_date)}` : "";
  for (const [key, name] of Object.entries(REGION_NAMES)) {
    const c = latest.change?.[key];
    const chg = c == null || c === 0 ? null
      : el("span", { class: `chg ${c > 0 ? "up" : "down"}` }, `${c > 0 ? "▲" : "▼"}${Math.abs(c).toFixed(2)}`);
    const btn = el("button", {
      type: "button", "aria-pressed": String(key === selRegion),
      onclick: () => { selRegion = key; store("region", key); renderMpob(latest); drawChart(); },
    }, el("span", { class: "name" }, name), el("span", { class: "val" }, rm(latest.prices?.[key])), chg);
    list.append(el("li", {}, btn));
  }
}

function drawChart() {
  const svg = $("mpob-chart");
  svg.replaceChildren();
  const pts = mpobDays
    .filter((d) => d.status === "ok" && d.prices[selRegion] != null)
    .slice(-CHART_DAYS)
    .map((d) => ({ date: d.date, v: d.prices[selRegion] }));
  $("chart-title").textContent = `Trend ${REGION_NAMES[selRegion]} (${pts.length} hari dagangan terakhir)`;
  if (pts.length < 2) {
    $("chart-from").textContent = ""; $("chart-to").textContent = "";
    return;
  }
  const W = 320, H = 120, P = 14;
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  if (hi - lo < 0.5) { lo -= 0.25; hi += 0.25; }
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
  const NS = "http://www.w3.org/2000/svg";
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  for (const v of [lo, hi]) {
    svg.append(mk("line", { class: "gd", x1: P, x2: W - P, y1: y(v), y2: y(v) }));
    const t = mk("text", { x: W - P, y: y(v) - 3, "text-anchor": "end" }); t.textContent = v.toFixed(2); svg.append(t);
  }
  svg.append(mk("polyline", { class: "ln", points: pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ") }));
  const last = pts[pts.length - 1];
  svg.append(mk("circle", { class: "dot", cx: x(pts.length - 1), cy: y(last.v), r: 3 }));
  svg.setAttribute("aria-label", `Trend harga ${REGION_NAMES[selRegion]}, terkini RM ${last.v.toFixed(2)}`);
  $("chart-from").textContent = fmtDate(pts[0].date);
  $("chart-to").textContent = fmtDate(last.date);
}

/* ---------- FAMA ---------- */
let famaItems = [];

function renderFama() {
  const m = matcher($("fama-search").value);
  const rows = famaItems.filter((r) => !m || m.test(r.item));
  const list = $("fama-list");
  list.replaceChildren(...rows.slice(0, LIST_LIMIT).map((r) =>
    el("li", {},
      el("div", { class: "it" }, el("b", {}, r.item), el("span", {}, [r.grade, r.unit].filter(Boolean).join(" · "))),
      el("div", { class: "pr" }, el("b", {}, r.price == null ? "—" : `RM ${rm(r.price)}`)))));
  $("fama-count").textContent = famaItems.length
    ? `${rows.length} daripada ${famaItems.length} barang`
    : "Tiada data.";
}

/* ---------- PriceCatcher ---------- */
let pcItems = [];

function renderPc() {
  const state = $("pc-state").value;
  const m = matcher($("pc-search").value);
  const rows = pcItems.filter((r) => r.state === state && (!m || m.test(r.item)));
  $("pc-list").replaceChildren(...rows.map((r) =>
    el("li", {},
      el("div", { class: "it" }, el("b", {}, r.item), el("span", {}, `${r.unit} · ${r.premises} premis`)),
      el("div", { class: "pr" }, el("b", {}, `RM ${rm(r.median)}`), el("span", {}, `${rm(r.min)} – ${rm(r.max)}`)))));
  if (!rows.length) $("pc-list").append(el("li", {}, el("span", { class: "muted" }, "Tiada data.")));
}

function fillStates() {
  const states = [...new Set(pcItems.map((r) => r.state))].sort();
  const saved = store("state");
  const sel = $("pc-state");
  sel.replaceChildren(...states.map((s) => el("option", { value: s }, s)));
  if (saved && states.includes(saved)) sel.value = saved;
}

/* ---------- tabs ---------- */
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs button")) {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", String(on));
    $(`tab-${b.dataset.tab}`).hidden = !on;
  }
  store("tab", name);
}

/* ---------- start ---------- */
async function load() {
  try {
    const [latest, mpob] = await Promise.all([getJSON("api/latest.json"), getJSON("api/mpob.json")]);
    $("updated").textContent = `Laman dikemas kini ${fmtTime(latest.generated_at)}`;
    const sources = latest.sources || {};
    for (const k of ["mpob", "fama", "pricecatcher"]) renderSource(k, sources[k]);
    renderHealth(sources);

    mpobDays = mpob.days || [];
    renderMpob(latest.mpob);
    drawChart();

    const f = latest.fama || {};
    famaItems = f.items || [];
    $("fama-badge").hidden = $("fama-note").hidden = f.verified !== false;
    renderFama();

    const p = latest.pricecatcher || {};
    pcItems = p.items || [];
    fillStates();
    renderPc();
  } catch (e) {
    $("updated").textContent = "Gagal memuatkan data. Cuba lagi nanti.";
    console.error(e);
  }
}

$("fama-search").addEventListener("input", renderFama);
$("pc-search").addEventListener("input", renderPc);
$("pc-state").addEventListener("change", () => { store("state", $("pc-state").value); renderPc(); });
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));
showTab(store("tab") === "runcit" ? "runcit" : "utama");

const setOffline = () => { $("offline").hidden = navigator.onLine; };
addEventListener("online", setOffline);
addEventListener("offline", setOffline);
setOffline();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
load();
