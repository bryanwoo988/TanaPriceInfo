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
const SHORT = { mpob: "MPOB", fama: "FAMA", pricecatcher: "KPDN" };

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
  // Same day as today: show only the time of collection.
  const when = (iso) => (iso && iso.slice(0, 10) === todayMYT() ? iso.slice(11, 16) : fmtTime(iso));
  const kids = [
    el("div", { class: "src-top" },
      el("span", { class: `pill ${f.level}` }, f.label),
      src?.url ? el("a", { href: src.url, target: "_blank", rel: "noopener" }, `Semak di ${SHORT[key] || src.name} ↗`) : null),
    el("p", { class: "small muted" },
      `Harga ${fmtDate(src?.data_date).replace(/ \d{4}$/, "")}` +
      (f.age != null ? ` (${f.age === 0 ? "hari ini" : `${f.age} hari lalu`})` : "") +
      (src?.last_success ? ` · dikutip ${when(src.last_success)}` : "")),
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
  // A dot on the bottom tab of every source that is late or failed.
  const tabOf = { mpob: "mpob", fama: "fama", pricecatcher: "kpdn" };
  for (const [k, t] of Object.entries(tabOf)) {
    const dot = document.querySelector(`#t-${t} .dot`);
    if (dot) dot.hidden = freshness((sources || {})[k]).level === "ok";
  }
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

/* ---------- MPOB: share today's prices, FFB price calculator ---------- */
let mpobLatest = null;

function mpobShareText() {
  const m = mpobLatest;
  const lines = Object.entries(REGION_NAMES).map(([k, n]) => `${n}: RM ${rm(m.prices?.[k])}`);
  return `Harga BTS sawit MPOB (RM / 1% OER), ${fmtDate(m.date)}\n${lines.join("\n")}\n\nHarga Harian: ${APP_URL}`;
}

function renderCalc() {
  const m = mpobLatest;
  if (!m?.prices) { $("calc-out").textContent = "Tiada harga MPOB."; return; }
  const sel = $("calc-region");
  if (!sel.options.length) {
    sel.replaceChildren(...Object.entries(REGION_NAMES).map(([k, n]) => el("option", { value: k }, n)));
    sel.value = store("calc-region") || selRegion;
    $("calc-oer").value = store("calc-oer") || "20";
    $("calc-tons").value = store("calc-tons") || "1";
  }
  const region = sel.value, per1 = m.prices[region];
  const oer = parseFloat($("calc-oer").value), tons = parseFloat($("calc-tons").value);
  const out = $("calc-out");
  if (per1 == null) { out.replaceChildren(el("p", { class: "warn-text" }, "Tiada harga untuk wilayah ini.")); return; }
  if (!(oer >= 10 && oer <= 30)) {
    out.replaceChildren(el("p", { class: "warn-text" }, "Masukkan OER antara 10% dan 30% (biasanya 18–23%)."));
    return;
  }
  const perTon = per1 * oer; // MPOB quotes RM per tonne for each 1% OER
  const kids = [
    el("div", { class: "calc-main" }, el("b", {}, fmtRM(perTon)), el("span", {}, " / tan")),
    el("p", { class: "small muted" }, `${fmtRM(per1)} × ${oer}% OER · ${REGION_NAMES[region]}, harga ${fmtDate(m.date)}`),
  ];
  if (tons > 0) kids.push(el("p", { class: "calc-total" }, `Jumlah ${tons} tan: `, el("b", {}, fmtRM(perTon * tons))));
  out.replaceChildren(...kids);
}
for (const id of ["calc-region", "calc-oer", "calc-tons"]) {
  $(id).addEventListener("input", () => { store(id, $(id).value); renderCalc(); });
}
$("mpob-share").addEventListener("click", () => { if (mpobLatest?.date) shareText(mpobShareText()); });

/* ---------- shared: toast, share text, small line chart ---------- */
const fmtRM = (v) => `RM ${Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}
// Native share sheet when available; otherwise copy the text.
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("Disalin. Tampal dalam WhatsApp atau mesej."); }
  catch { toast("Tidak dapat berkongsi di pelayar ini."); }
}

/** Line chart into an <svg viewBox="0 0 320 H">; values may contain nulls (no data that day).
 *  weak[i] = true draws a hollow point (e.g. a day with very few records). */
function lineChart(svg, values, H = 120, weak = []) {
  svg.replaceChildren();
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return false;
  const W = 320, P = 14, n = values.length;
  let lo = Math.min(...pts.map(([, v]) => v)), hi = Math.max(...pts.map(([, v]) => v));
  if (hi - lo < 0.05 * hi || hi - lo < 0.1) { const pad = Math.max(0.05 * hi, 0.1); lo -= pad / 2; hi += pad / 2; }
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(n - 1, 1);
  const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
  const NS = "http://www.w3.org/2000/svg";
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  for (const v of [lo, hi]) {
    svg.append(mk("line", { class: "gd", x1: P, x2: W - P, y1: y(v), y2: y(v) }));
    // Labels on the left: the newest point (right end) stays visible.
    const t = mk("text", { x: P, y: y(v) - 3, "text-anchor": "start" }); t.textContent = v.toFixed(2); svg.append(t);
  }
  svg.append(mk("polyline", { class: "ln", points: pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ") }));
  for (const [i, v] of pts) {
    svg.append(mk("circle", weak[i] ? { class: "pt weak", cx: x(i), cy: y(v), r: 2.6 } : { class: "pt", cx: x(i), cy: y(v), r: 1.8 }));
  }
  const [li, lv] = pts[pts.length - 1];
  if (!weak[li]) svg.append(mk("circle", { class: "dot", cx: x(li), cy: y(lv), r: 3 }));
  return true;
}

/* ---------- FAMA ---------- */
const FAMA_LEVELS = ["Ladang", "Borong", "Runcit"];
const FAMA_CATS = [["", "Semua"], ["fav", "★ Kegemaran"], ["Sayur-Sayuran", "Sayur"], ["Buah-Buahan", "Buah"], ["Ternakan", "Ternakan"]];
let fama = null;       // api/fama.json: national + state
let famaDist = null;   // api/fama_daerah.json: loaded only when a district is needed
let famaDistReq = null;
const fs = {
  level: FAMA_LEVELS.includes(store("fama-level")) ? store("fama-level") : "Ladang",
  state: store("fama-state") || "",
  district: store("fama-district") || "",
  cat: "",
};

// "NEGERI SEMBILAN" -> "Negeri Sembilan", "W.P. KUALA LUMPUR" -> "W.P. Kuala Lumpur"
const tc = (s) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);
const itemKey = (e) => `${e.item}|${e.grade}|${e.unit}`;
const shortDate = (iso) => fmtDate(iso).replace(/ \d{4}$/, "");
const locLabel = (st, di) => (di ? `${tc(di)}, ${tc(st)}` : st ? tc(st) : "Seluruh Malaysia");

// Favourites: item+grade+unit, for every level and place. Kept on this phone only.
let favs = new Set();
try { favs = new Set(JSON.parse(store("fama-favs") || "[]")); } catch { /* ignore */ }
function toggleFav(key) {
  if (favs.has(key)) favs.delete(key); else favs.add(key);
  store("fama-favs", JSON.stringify([...favs]));
}

let famaTrend = null, famaTrendReq = null; // api/fama_trend.json: loaded when a detail opens
function ensureTrend() {
  if (famaTrend) return Promise.resolve(famaTrend);
  famaTrendReq ??= getJSON("api/fama_trend.json")
    .then((d) => (famaTrend = d))
    .catch((e) => { famaTrendReq = null; throw e; });
  return famaTrendReq;
}

const FEW = () => fama?.window?.few_records_below || 3;
const fewTag = (x) => (x && x.records < FEW() ? el("em", { class: "few", title: "Sedikit rekod: purata kurang tepat" }, "rekod sedikit") : null);
function changeTag(x) {
  const c = x?.change_pct;
  if (c == null || Math.abs(c) < 0.5) return null;
  return el("span", { class: `chg ${c > 0 ? "up" : "down"}`, title: "Berbanding minggu sebelumnya" },
    `${c > 0 ? "▲" : "▼"}${Math.abs(c).toFixed(1)}%`);
}

function ensureDist() {
  if (famaDist) return Promise.resolve(famaDist);
  famaDistReq ??= getJSON("api/fama_daerah.json")
    .then((d) => (famaDist = d))
    .catch((e) => { famaDistReq = null; throw e; });
  return famaDistReq;
}

function famaFind(level, st, di, key) {
  const src = di ? famaDist?.items || [] : fama?.items || [];
  return src.find((x) => x.level === level && (x.state || "") === st && (x.district || "") === di && itemKey(x) === key);
}

function renderFamaControls() {
  $("fama-levels").replaceChildren(...FAMA_LEVELS.map((l) =>
    el("button", {
      type: "button", "aria-pressed": String(l === fs.level),
      onclick: () => { fs.level = l; store("fama-level", l); renderFamaControls(); renderFama(); },
    }, l)));

  const states = Object.keys(fama?.states || {});
  if (fs.state && !states.includes(fs.state)) fs.state = fs.district = "";
  const st = $("fama-state");
  st.replaceChildren(el("option", { value: "" }, "Semua negeri"),
    ...states.map((s) => el("option", { value: s }, tc(s))));
  st.value = fs.state;

  const districts = fs.state ? fama.states[fs.state] || [] : [];
  if (fs.district && !districts.includes(fs.district)) fs.district = "";
  const di = $("fama-district");
  di.replaceChildren(el("option", { value: "" }, "Semua daerah"),
    ...districts.map((d) => el("option", { value: d }, tc(d))));
  di.value = fs.district;
  di.disabled = !fs.state;

  $("fama-cats").replaceChildren(...FAMA_CATS.map(([v, label]) =>
    el("button", {
      type: "button", "aria-pressed": String(v === fs.cat),
      onclick: () => { fs.cat = v; renderFamaControls(); renderFama(); },
    }, label)));
}

async function renderFama() {
  if (!fama) return;
  const list = $("fama-list");
  if (fs.district && !famaDist) {
    list.replaceChildren(el("li", {}, el("span", { class: "muted" }, "Memuatkan harga daerah…")));
    try { await ensureDist(); } catch {
      list.replaceChildren(el("li", {}, el("span", { class: "muted" }, "Gagal memuatkan harga daerah.")));
      return;
    }
  }
  const w = fama.window;
  $("fama-window").textContent = w
    ? `Harga ialah purata ${w.days} hari (${shortDate(w.from)} – ${fmtDate(w.to)}), ditimbang mengikut bilangan rekod FAMA. ▲▼ = berbanding minggu sebelumnya. "Rekod sedikit" = kurang ${FEW()} rekod, purata kurang tepat. Tekan barang untuk banding peringkat, lokasi dan trend.`
    : "";

  const m = matcher($("fama-search").value);
  const src = fs.district ? famaDist.items : fama.items;
  const all = src.filter((e) => e.level === fs.level && (e.state || "") === fs.state && (e.district || "") === fs.district);
  const catOk = (e) => !fs.cat || (fs.cat === "fav" ? favs.has(itemKey(e)) : e.category === fs.cat);
  const rows = all.filter((e) => catOk(e) && (!m || m.test(e.item)));
  rows.sort((a, b) => (favs.has(itemKey(b)) - favs.has(itemKey(a))) || a.item.localeCompare(b.item));
  list.replaceChildren(...rows.slice(0, LIST_LIMIT).map((e) =>
    el("li", {}, el("button", { type: "button", class: "rowbtn", onclick: () => openFamaDetail(e) },
      el("div", { class: "it" },
        el("b", {}, favs.has(itemKey(e)) ? el("span", { class: "star on", "aria-label": "Kegemaran" }, "★ ") : null, e.item),
        el("span", {}, `${e.grade} · ${e.unit}`)),
      el("div", { class: "pr" }, el("b", {}, `RM ${rm(e.price)}`), changeTag(e),
        el("span", {}, `${e.records} rekod` + (w && e.latest_date < w.to ? ` · ${shortDate(e.latest_date)}` : "")),
        fewTag(e))))));
  if (!rows.length) {
    list.append(el("li", {}, el("span", { class: "muted" },
      all.length ? (fs.cat === "fav" && !favs.size ? "Belum ada kegemaran. Buka barang dan tekan ☆ untuk simpan." : "Tiada padanan.") : `Tiada harga ${fs.level} untuk ${locLabel(fs.state, fs.district)} dalam tempoh ini.`)));
  }
  $("fama-count").textContent = `${rows.length} barang · ${fs.level} · ${locLabel(fs.state, fs.district)}`;
}

function famaShareText(e, chain) {
  const w = fama.window;
  const lines = chain.filter(([, x]) => x).map(([l, x]) =>
    `${l}: RM ${rm(x.price)}${x.records < FEW() ? " (rekod sedikit)" : ""}`);
  return `${e.item} (${e.grade}, RM/${e.unit})\n${locLabel(fs.state, fs.district)}\n${lines.join("\n")}\n` +
    (w ? `Purata ${w.days} hari ${shortDate(w.from)} – ${fmtDate(w.to)}, FAMA\n` : "") +
    `\nHarga Harian: ${APP_URL}`;
}

async function openFamaDetail(e) {
  const dlg = $("fama-detail");
  const key = itemKey(e);
  if (fs.state) { try { await ensureDist(); } catch { /* show what we have */ } }

  // 1. Same place, three levels: farm -> wholesale -> retail.
  const chain = FAMA_LEVELS.map((l) => [l, famaFind(l, fs.state, fs.district, key)]);
  const lad = chain[0][1]?.price, run = chain[2][1]?.price;
  const chainBox = el("div", { class: "chain" }, ...chain.flatMap(([l, x], i) => [
    i ? el("span", { class: "arrow", "aria-hidden": "true" }, "→") : null,
    el("div", { class: `lvl${l === fs.level ? " cur" : ""}` },
      el("span", { class: "small muted" }, l),
      el("b", {}, x ? rm(x.price) : "—"),
      el("span", { class: "small muted" }, x ? `${x.records} rekod` : "tiada data"),
      changeTag(x), fewTag(x)),
  ]));

  // 2. Same level, compare places: states (or districts of the chosen state).
  const peers = fs.state
    ? (famaDist?.items || []).filter((x) => x.level === fs.level && x.state === fs.state && itemKey(x) === key)
    : fama.items.filter((x) => x.level === fs.level && x.state && !x.district && itemKey(x) === key);
  peers.sort((a, b) => a.price - b.price);
  const max = Math.max(...peers.map((x) => x.price), 0.01);
  const lo = peers[0], hi = peers[peers.length - 1];
  const peerList = el("ul", { class: "peers" }, ...peers.map((x) => {
    const name = fs.state ? x.district : x.state;
    const cur = fs.state ? x.district === fs.district : false;
    const tag = peers.length > 1 && x === lo ? "Terendah" : peers.length > 1 && x === hi ? "Tertinggi" : "";
    return el("li", { class: cur ? "cur" : "" },
      el("span", { class: "pname" }, tc(name), tag ? el("em", { class: x === lo ? "lo" : "hi" }, tag) : null,
        x.records < FEW() ? el("em", { class: "few", title: "Sedikit rekod" }, "sedikit") : null),
      el("span", { class: "bar" }, el("i", { style: `width:${Math.round((x.price / max) * 100)}%` })),
      el("b", {}, rm(x.price)));
  }));

  // 3. Trend: daily average, last 30 days (state level when a district is chosen).
  const trendBox = el("div", { class: "trend" }, el("p", { class: "small muted" }, "Memuatkan trend…"));

  const w = fama.window;
  const star = el("button", {
    type: "button", class: `close star-btn${favs.has(key) ? " on" : ""}`,
    "aria-label": favs.has(key) ? "Buang dari kegemaran" : "Simpan sebagai kegemaran", "aria-pressed": String(favs.has(key)),
    onclick: () => {
      toggleFav(key);
      const on = favs.has(key);
      star.textContent = on ? "★" : "☆"; star.classList.toggle("on", on);
      star.setAttribute("aria-pressed", String(on));
      star.setAttribute("aria-label", on ? "Buang dari kegemaran" : "Simpan sebagai kegemaran");
      toast(on ? "Disimpan dalam Kegemaran." : "Dibuang dari Kegemaran.");
      renderFama();
    },
  }, favs.has(key) ? "★" : "☆");
  dlg.replaceChildren(
    el("div", { class: "sheet-head" },
      el("div", {}, el("h3", { id: "fd-title" }, e.item),
        el("p", { class: "small muted" }, `${e.grade} · RM / ${e.unit} · ${locLabel(fs.state, fs.district)}`)),
      el("div", { class: "head-btns" }, star,
        el("button", { type: "button", class: "close", "aria-label": "Tutup", onclick: () => dlg.close() }, "✕"))),
    el("h4", {}, "Rantaian harga"),
    chainBox,
    lad && run ? el("p", { class: "small" },
      `Harga runcit ${Math.round(((run - lad) / lad) * 100)}% lebih tinggi daripada harga ladang.`) : null,
    el("h4", {}, `Trend 30 hari (${fs.level}, ${fs.state ? tc(fs.state) : "Seluruh Malaysia"})`),
    trendBox,
    el("h4", {}, `Mengikut ${fs.state ? `daerah di ${tc(fs.state)}` : "negeri"} (${fs.level})`),
    peers.length ? peerList : el("p", { class: "small muted" }, "Tiada data lokasi lain."),
    el("button", { type: "button", class: "btn primary wide", onclick: () => shareText(famaShareText(e, chain)) }, "Kongsi harga"),
    el("p", { class: "small muted" },
      w ? `Purata ${w.days} hari (${shortDate(w.from)} – ${fmtDate(w.to)}). ` : "",
      el("a", { href: fama.sources?.fama?.url || "https://www.fama.gov.my/harga-pasaran-terkini", target: "_blank", rel: "noopener" }, "Semak di FAMA ↗")),
  );
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");

  try {
    const t = await ensureTrend();
    const raw = t.series[`${fs.level}|${fs.state}|${key}`];
    const vals = raw?.map((d) => (d ? d[0] : null));
    const weak = raw?.map((d) => !!d && d[1] < FEW()) || [];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 320 110"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "chart"); svg.setAttribute("role", "img");
    if (vals && lineChart(svg, vals, 110, weak)) {
      const days = vals.filter((v) => v != null).length;
      const nWeak = weak.filter(Boolean).length;
      svg.setAttribute("aria-label", `Trend harga ${e.item}, ${days} hari ada rekod`);
      trendBox.replaceChildren(svg,
        el("div", { class: "chart-axis small muted" }, el("span", {}, shortDate(t.dates[0])), el("span", {}, shortDate(t.dates[t.dates.length - 1]))),
        el("p", { class: "small muted" }, `Purata harian · ${days} daripada ${vals.length} hari ada rekod.` +
          (nWeak ? ` Titik kosong ○ = kurang ${FEW()} rekod hari itu (kurang tepat).` : "")));
    } else {
      trendBox.replaceChildren(el("p", { class: "small muted" }, "Tidak cukup rekod untuk trend."));
    }
  } catch {
    trendBox.replaceChildren(el("p", { class: "small muted" }, "Trend tidak dapat dimuatkan."));
  }
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

/* ---------- Info: version, changelog, collection history ---------- */
const fullTime = (iso) => (iso ? `${fmtDate(iso)}, ${iso.slice(11, 16)}` : "—"); // stored in Malaysia time
let latestGenerated = null;
let infoLoaded = 0;

function renderAppInfo() {
  const rows = [
    ["Versi", VERSION],
    ["Dikeluarkan", RELEASED ? fullTime(RELEASED) : "—"],
    ["Binaan", BUILD],
    ["Data dikemas kini", fullTime(latestGenerated)],
  ];
  $("app-info").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
}

function renderChangelog(log) {
  $("changelog").replaceChildren(...log.map((v) =>
    el("li", { class: v.version === VERSION ? "cur" : "" },
      el("div", { class: "cl-head" },
        el("b", { class: "ver" }, v.version),
        v.version === VERSION ? el("span", { class: "pill ok" }, "Versi anda") : null,
        el("span", { class: "small muted" }, v.released_at ? fullTime(v.released_at) : "Belum dikeluarkan")),
      el("p", { class: "cl-title" }, v.title),
      el("ul", {}, ...v.notes.map((n) => el("li", { class: "small" }, n))))));
}

function renderHistory(items) {
  // One row per collection run (MPOB, FAMA and PriceCatcher run together), newest first.
  const runs = new Map();
  for (const h of items) {
    const key = h.run || h.time.slice(0, 16);
    const r = runs.get(key) || { time: h.time, trigger: h.trigger, src: {} };
    if (h.time < r.time) r.time = h.time;
    r.src[h.source] = h;
    runs.set(key, r);
  }
  const list = [...runs.values()].sort((a, b) => (a.time < b.time ? 1 : -1));
  const TRIG = { auto: "Auto", manual: "Manual", local: "Lain" };
  const cell = (h) => !h ? el("td", { class: "na" }, "—")
    : el("td", { class: h.ok ? "ok" : "bad", title: h.note || "" },
      el("b", {}, h.ok ? "✓" : "✗"), el("span", { class: "t" }, h.time.slice(11, 16)));
  const head = el("tr", {}, ...["Masa", "MPOB", "FAMA", "KPDN"].map((t) => el("th", {}, t)));
  const body = list.flatMap((r) => {
    const notes = Object.entries(r.src).filter(([, h]) => h.note).map(([k, h]) => `${SHORT[k] || k}: ${h.note}`);
    return [
      el("tr", {},
        el("td", { class: "when" }, el("b", {}, fullTime(r.time).replace(/ \d{4},/, ",")),
          el("span", { class: "t" }, `${TRIG[r.trigger] || r.trigger || "—"} · ${r.time.slice(0, 4)}`)),
        cell(r.src.mpob), cell(r.src.fama), cell(r.src.pricecatcher)),
      notes.length ? el("tr", { class: "note-row" }, el("td", { colspan: "4", class: "small muted" }, notes.join(" · "))) : null,
    ];
  });
  $("hist").replaceChildren(el("thead", {}, head),
    el("tbody", {}, ...(body.length ? body : [el("tr", {}, el("td", { colspan: "4", class: "muted" }, "Tiada rekod lagi."))])));
}

async function loadInfo() {
  renderAppInfo();
  if (Date.now() - infoLoaded < DATA_REFRESH_MS) return;
  infoLoaded = Date.now();
  try {
    const [log, hist] = await Promise.all([getJSON("changelog.json"), getJSON("api/history.json")]);
    renderChangelog(log);
    renderHistory(hist.items || []);
  } catch (e) {
    infoLoaded = 0;
    $("changelog").replaceChildren(el("li", { class: "muted small" }, "Gagal memuatkan. Cuba lagi nanti."));
  }
}

/* ---------- share the app ---------- */
const APP_URL = "https://bryanwoo988.github.io/TanaPriceInfo/";
const SHARE_TEXT = "Harga Harian: harga BTS sawit (MPOB), harga pasaran FAMA dan harga runcit KPDN. Percuma, boleh dipasang di skrin utama telefon.";

function shareMsg(text) {
  $("share-msg").textContent = text;
  setTimeout(() => { if ($("share-msg").textContent === text) $("share-msg").textContent = ""; }, 4000);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(APP_URL);
    shareMsg("Pautan disalin.");
  } catch {
    // Older browsers / no permission: select the text so the user can copy it.
    const r = document.createRange(); r.selectNodeContents($("share-url"));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    shareMsg("Tekan lama pada pautan untuk salin.");
  }
}

$("share-btn").addEventListener("click", async () => {
  if (navigator.share) {
    try { await navigator.share({ title: "Harga Harian", text: SHARE_TEXT, url: APP_URL }); }
    catch (e) { if (e?.name !== "AbortError") copyLink(); } // user closed the sheet: do nothing
  } else {
    copyLink();
  }
});
$("copy-btn").addEventListener("click", copyLink);
$("qr-btn").addEventListener("click", () => {
  const d = $("qr-big");
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
});
$("qr-close").addEventListener("click", () => $("qr-big").close());
$("qr-big").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

/* ---------- install guide (first open) ---------- */
// Shown once on the first open in a browser; never inside the installed app.
// Reopen any time from Info -> "Cara pasang di skrin utama".
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const UA = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(UA);
// In-app browsers of social apps cannot install web apps.
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|musical_ly|BytedanceWebview|Twitter|Snapchat/i.test(UA);
let installEvent = null; // Chrome/Edge on Android: one-tap install

addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();          // we show our own guide instead of the mini-bar
  installEvent = e;
  if ($("install-guide").open) renderInstallGuide();
});
addEventListener("appinstalled", () => {
  installEvent = null;
  store("install-guide-seen", "installed");
  if ($("install-guide").open) $("install-guide").close();
});

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const MENU_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
const ADD_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function step(n, html) {
  const li = el("li", {}, el("span", { class: "n" }, String(n)));
  const t = el("span", { class: "t" }); t.innerHTML = html; // static text + our own icons only
  li.append(t);
  return li;
}

function renderInstallGuide() {
  const d = $("install-guide");
  const close = () => { store("install-guide-seen", "1"); d.close(); };
  let body;
  if (inAppBrowser) {
    body = [
      el("p", {}, "Pelayar dalam aplikasi ini tidak boleh memasang Harga Harian. Buka dalam pelayar biasa dahulu:"),
      el("ol", { class: "steps" },
        step(1, `Tekan menu ${MENU_ICON} atau <b>⋯</b> di penjuru atas.`),
        step(2, `Pilih <b>Buka dalam ${isIOS ? "Safari" : "Chrome"}</b> (atau <i>Open in browser</i>).`),
        step(3, "Kemudian ikut panduan pemasangan yang muncul.")),
    ];
  } else if (installEvent) {
    body = [
      el("p", {}, "Pasang Harga Harian di skrin utama untuk buka terus seperti aplikasi biasa, termasuk tanpa internet."),
      el("button", { type: "button", class: "btn primary wide", onclick: async () => {
        const ev = installEvent; installEvent = null;
        ev.prompt();
        const { outcome } = await ev.userChoice.catch(() => ({}));
        if (outcome === "accepted") close(); else renderInstallGuide();
      } }, "Pasang sekarang"),
    ];
  } else if (isIOS) {
    body = [
      el("p", {}, "Tambah Harga Harian ke skrin utama untuk buka terus seperti aplikasi biasa, termasuk tanpa internet."),
      el("ol", { class: "steps" },
        step(1, `Dalam <b>Safari</b>, tekan butang Kongsi ${SHARE_ICON} (di bawah, atau dalam menu <b>⋯</b>).`),
        step(2, `Tatal ke bawah dan pilih <b>Tambah ke Skrin Utama</b> ${ADD_ICON} <span class="muted">(Add to Home Screen)</span>.`),
        step(3, "Tekan <b>Tambah</b> di penjuru kanan atas.")),
    ];
  } else if (isAndroid) {
    body = [
      el("p", {}, "Pasang Harga Harian di skrin utama untuk buka terus seperti aplikasi biasa, termasuk tanpa internet."),
      el("ol", { class: "steps" },
        step(1, `Dalam <b>Chrome</b>, tekan menu ${MENU_ICON} di penjuru kanan atas.`),
        step(2, `Pilih <b>Pasang apl</b> atau <b>Tambah ke skrin utama</b> <span class="muted">(Install app / Add to Home screen)</span>.`),
        step(3, "Tekan <b>Pasang</b>.")),
    ];
  } else {
    body = [
      el("p", {}, "Buka laman ini di telefon dan tambah ke skrin utama. Di komputer, pelayar Chrome atau Edge menunjukkan butang Pasang di bar alamat."),
    ];
  }
  d.replaceChildren(
    el("div", { class: "sheet-head" },
      el("div", {}, el("h3", { id: "ig-title", tabindex: "-1", autofocus: "" }, "Pasang di skrin utama"),
        el("p", { class: "small muted" }, "Percuma · tiada iklan · tiada pendaftaran")),
      el("button", { type: "button", class: "close", "aria-label": "Tutup", onclick: close }, "✕")),
    ...body,
    el("button", { type: "button", class: "btn wide later", onclick: close }, "Nanti"),
  );
}

function openInstallGuide() {
  renderInstallGuide();
  const d = $("install-guide");
  if (d.open) return;
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
}
$("install-guide").addEventListener("close", () => store("install-guide-seen", store("install-guide-seen") || "1"));
$("install-guide").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
$("install-help").hidden = isStandalone();
$("install-help").addEventListener("click", openInstallGuide);

function maybeShowInstallGuide() {
  if (isStandalone() || store("install-guide-seen")) return;
  setTimeout(() => {
    // Phones (and desktop browsers that offer one-tap install); not a plain desktop.
    const useful = isIOS || isAndroid || inAppBrowser || installEvent;
    if (useful && !isStandalone() && !document.querySelector("dialog[open]")) openInstallGuide();
  }, 1500); // let the prices appear first
}

/* ---------- tabs (bottom) + Info (top-right icon) ---------- */
const TABS = ["mpob", "fama", "kpdn"];
const OLD_TABS = { utama: "mpob", runcit: "kpdn" }; // names used before v1.5.0
let lastTab = "mpob";

function showView(name) {
  const info = name === "info";
  if (!info) lastTab = name;
  for (const b of document.querySelectorAll(".tabs button")) {
    b.setAttribute("aria-selected", String(b.dataset.tab === name));
  }
  for (const t of [...TABS, "info"]) $(`tab-${t}`).hidden = t !== name;
  $("info-btn").setAttribute("aria-pressed", String(info));
  store("tab", name);
  if (info) loadInfo();
  scrollTo(0, 0);
}
const showTab = showView;

/* ---------- start ---------- */
const BUILD = "__BUILD__"; // set by scripts/build_site.py, same value as in sw.js
const VERSION = "__VERSION__";   // from web/changelog.json
const RELEASED = "__RELEASED__"; // when this version reached main (from git), Malaysia time
const DATA_REFRESH_MS = 10 * 60_000;
let lastLoad = 0;

async function load() {
  lastLoad = Date.now();
  famaDist = null; famaDistReq = null; // district prices and trend are re-read when next needed
  famaTrend = null; famaTrendReq = null;
  try {
    const [latest, mpob, famaData] = await Promise.all(
      [getJSON("api/latest.json"), getJSON("api/mpob.json"), getJSON("api/fama.json")]);
    $("updated").textContent = `Laman dikemas kini ${fmtTime(latest.generated_at)}`;
    latestGenerated = latest.generated_at;
    if (!$("tab-info").hidden) { infoLoaded = 0; loadInfo(); }
    const sources = latest.sources || {};
    for (const k of ["mpob", "fama", "pricecatcher"]) renderSource(k, sources[k]);
    renderHealth(sources);

    mpobDays = mpob.days || [];
    renderMpob(latest.mpob);
    mpobLatest = latest.mpob;
    renderCalc();
    drawChart();

    fama = famaData;
    renderFamaControls();
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
$("fama-state").addEventListener("change", () => {
  fs.state = $("fama-state").value; fs.district = "";
  store("fama-state", fs.state); store("fama-district", "");
  renderFamaControls(); renderFama();
});
$("fama-district").addEventListener("change", () => {
  fs.district = $("fama-district").value; store("fama-district", fs.district);
  renderFama();
});
$("fama-detail").addEventListener("click", (ev) => {  // tap outside the sheet closes it
  if (ev.target === ev.currentTarget) ev.currentTarget.close();
});
$("pc-search").addEventListener("input", renderPc);
$("pc-state").addEventListener("change", () => { store("state", $("pc-state").value); renderPc(); });
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => showView(b.dataset.tab));
$("info-btn").addEventListener("click", () => showView($("tab-info").hidden ? "info" : lastTab));
{
  const saved = OLD_TABS[store("tab")] || store("tab");
  if (TABS.includes(saved)) showView(saved);
  else if (saved === "info") { showView("info"); }
  else showView("mpob");
}

const setOffline = () => { $("offline").hidden = navigator.onLine; };
addEventListener("online", setOffline);
addEventListener("offline", setOffline);
setOffline();

/* ---------- updates: new app version and fresh data ---------- */
// The user is "busy" when a detail sheet is open or they are typing: don't reload under them.
const busy = () => $("fama-detail").open || $("qr-big").open || $("install-guide").open || ["INPUT", "SELECT"].includes(document.activeElement?.tagName);

function applyUpdate() {
  if (!busy()) { location.reload(); return; }
  $("update").hidden = false; // banner: tap to reload when ready
}
$("update").addEventListener("click", () => location.reload());

if ("serviceWorker" in navigator) {
  // On a first visit the service worker takes control once: that is an install, not an update.
  // Every later change of controller means a new version is active.
  let hasController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) { hasController = true; return; }
    if (reloading) return;
    reloading = true;
    applyUpdate();
  });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const check = () => reg.update().catch(() => {});
    // Installed apps are often resumed, not reopened: check whenever they come back.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    addEventListener("online", check);
    setInterval(check, 30 * 60_000);
  }).catch(() => {});
}

// Fresh prices when the app comes back after a while (resumed apps do not reload by themselves).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > DATA_REFRESH_MS && !busy()) load();
});
addEventListener("online", () => { if (Date.now() - lastLoad > 60_000) load(); });

$("build").textContent = `Versi ${VERSION} · ${BUILD}`;
load().then(maybeShowInstallGuide);
