"use strict";
// Interface languages: Malay (ms) and Simplified Chinese (zh).
// Commodity names, states, districts and agency names are NOT translated.
// t("key", { var: value }) fills {var} placeholders; missing keys fall back to Malay.

const LANGS = ["ms", "zh"];
let LANG = (() => {
  try {
    const saved = localStorage.getItem("lang");
    if (LANGS.includes(saved)) return saved;
  } catch (_) { /* private mode */ }
  return /^zh/i.test(navigator.language || "") ? "zh" : "ms";
})();

const STR = {
  ms: {
    "lang.switch": "中文", "lang.aria": "Tukar bahasa ke Bahasa Cina / 切换到中文",
    "info.aria": "Info: versi, rekod kemas kini, sejarah kutipan",
    "loading": "Memuatkan…",
    "updated": "Laman dikemas kini {t}",
    "load.fail": "Gagal memuatkan data. Cuba lagi nanti.",
    "update.banner": "Versi baharu tersedia — tekan untuk kemas kini",
    "offline": "Luar talian — memaparkan data terakhir yang disimpan.",
    "build": "Versi {v} · {b}",

    "fresh.none": "Tiada data", "fresh.failed": "Gagal dikutip", "fresh.late": "Lewat {n} hari", "fresh.ok": "Terkini",
    "src.check": "Semak di {s} ↗",
    "src.price": "Harga {d}", "src.today": " (hari ini)", "src.ago": " ({n} hari lalu)", "src.collected": " · dikutip {t}",
    "src.failed": "Kutipan terakhir gagal ({t}). Harga di bawah mungkin lama.",
    "no.data": "Tiada data.",

    "mpob.title": "Harga BTS Sawit (MPOB)",
    "mpob.change": "Perubahan berbanding {d}",
    "mpob.trend": "Trend {r} ({n} hari dagangan terakhir)",
    "mpob.trend.aria": "Trend harga {r}, terkini RM {v}",
    "mpob.share": "Harga BTS sawit MPOB (RM / 1% OER), {d}",
    "share": "Kongsi",
    "reg.north": "Utara", "reg.south": "Selatan", "reg.central": "Tengah",
    "reg.east_coast": "Pantai Timur", "reg.sabah": "Sabah", "reg.sarawak": "Sarawak",

    "calc.title": "Kira harga BTS anda",
    "calc.intro": "Harga MPOB adalah untuk setiap 1% kadar perahan minyak (OER). Masukkan OER dan berat buah anda.",
    "calc.region": "Wilayah", "calc.oer": "OER (%)", "calc.tons": "Berat (tan)",
    "calc.note": "Anggaran berdasarkan harga rujukan MPOB di pintu kilang. Harga sebenar bergantung pada kilang, gred buah, potongan dan kos pengangkutan.",
    "calc.noprice": "Tiada harga MPOB.", "calc.noregion": "Tiada harga untuk wilayah ini.",
    "calc.badoer": "Masukkan OER antara 10% dan 30% (biasanya 18–23%).",
    "calc.perton": " / tan",
    "calc.formula": "{p} × {o}% OER · {r}, harga {d}",
    "calc.total": "Jumlah {n} tan: ",

    "toast.copied": "Disalin. Tampal dalam WhatsApp atau mesej.",
    "toast.noshare": "Tidak dapat berkongsi di pelayar ini.",

    "fama.title": "Harga Pasaran (FAMA)",
    "fama.levels": "Peringkat harga", "state": "Negeri", "district": "Daerah", "category": "Kategori",
    "lvl.Ladang": "Ladang", "lvl.Borong": "Borong", "lvl.Runcit": "Runcit",
    "cat.all": "Semua", "cat.fav": "★ Kegemaran", "cat.veg": "Sayur", "cat.fruit": "Buah", "cat.livestock": "Ternakan",
    "fama.search": "Cari barang… (cth. ayam, cili)",
    "all.states": "Semua negeri", "all.districts": "Semua daerah", "all.malaysia": "Seluruh Malaysia",
    "few": "rekod sedikit", "few.short": "sedikit", "few.title": "Sedikit rekod: purata kurang tepat",
    "change.title": "Berbanding minggu sebelumnya",
    "dist.loading": "Memuatkan harga daerah…", "dist.fail": "Gagal memuatkan harga daerah.",
    "fama.window": "Harga ialah purata {n} hari ({from} – {to}), ditimbang mengikut bilangan rekod FAMA. ▲▼ = berbanding minggu sebelumnya. \"Rekod sedikit\" = kurang {few} rekod, purata kurang tepat. Tekan barang untuk banding peringkat, lokasi dan trend.",
    "fav": "Kegemaran",
    "records": "{n} rekod",
    "fav.none": "Belum ada kegemaran. Buka barang dan tekan ☆ untuk simpan.",
    "no.match": "Tiada padanan.",
    "fama.none": "Tiada harga {lvl} untuk {loc} dalam tempoh ini.",
    "fama.count": "{n} barang · {lvl} · {loc}",
    "share.few": " (rekod sedikit)",
    "share.window": "Purata {n} hari {from} – {to}, FAMA",
    "nodata.short": "tiada data",
    "lowest": "Terendah", "highest": "Tertinggi",
    "trend.loading": "Memuatkan trend…",
    "fav.remove": "Buang dari kegemaran", "fav.add": "Simpan sebagai kegemaran",
    "fav.added": "Disimpan dalam Kegemaran.", "fav.removed": "Dibuang dari Kegemaran.",
    "close": "Tutup",
    "chain": "Rantaian harga",
    "markup": "Harga runcit {p}% lebih tinggi daripada harga ladang.",
    "trend.title": "Trend 30 hari ({lvl}, {loc})",
    "by.district": "Mengikut daerah di {st} ({lvl})", "by.state": "Mengikut negeri ({lvl})",
    "no.peers": "Tiada data lokasi lain.",
    "share.price": "Kongsi harga",
    "window.short": "Purata {n} hari ({from} – {to}). ",
    "trend.aria": "Trend harga {item}, {n} hari ada rekod",
    "trend.days": "Purata harian · {d} daripada {n} hari ada rekod.",
    "trend.weak": " Titik kosong ○ = kurang {few} rekod hari itu (kurang tepat).",
    "trend.few": "Tidak cukup rekod untuk trend.", "trend.fail": "Trend tidak dapat dimuatkan.",

    "kpdn.title": "Harga Runcit (KPDN PriceCatcher)",
    "kpdn.search": "Cari sayur / buah…",
    "kpdn.premises": "{u} · {n} premis",
    "kpdn.note": "Harga tengah (median) daripada premis yang dilaporkan.",

    "share.title": "Kongsi aplikasi",
    "share.intro": "Imbas kod QR dengan kamera telefon untuk buka Harga Harian. Tekan kod untuk besarkan.",
    "qr.enlarge": "Besarkan kod QR", "qr.alt": "Kod QR ke {u}", "qr.big": "Kod QR besar",
    "copy.link": "Salin pautan",
    "install.help": "Cara pasang di skrin utama",
    "share.app": "Harga Harian: harga BTS sawit (MPOB), harga pasaran FAMA dan harga runcit KPDN. Percuma, boleh dipasang di skrin utama telefon.",
    "link.copied": "Pautan disalin.", "link.press": "Tekan lama pada pautan untuk salin.",

    "app": "Aplikasi", "ver": "Versi", "released": "Dikeluarkan", "buildid": "Binaan", "data.updated": "Data dikemas kini",
    "changelog": "Rekod kemas kini", "your.ver": "Versi anda", "unreleased": "Belum dikeluarkan",
    "history": "Sejarah kutipan data",
    "history.intro": "Setiap kutipan (automatik setiap hari 6:13 petang, atau manual) dalam 90 hari terakhir. Semua masa ialah waktu Malaysia.",
    "hist.time": "Masa", "trig.auto": "Auto", "trig.manual": "Manual", "trig.local": "Lain",
    "hist.none": "Tiada rekod lagi.", "info.fail": "Gagal memuatkan. Cuba lagi nanti.",

    "ig.title": "Pasang di skrin utama", "ig.sub": "Percuma · tiada iklan · tiada pendaftaran", "ig.later": "Nanti",
    "ig.inapp": "Pelayar dalam aplikasi ini tidak boleh memasang Harga Harian. Buka dalam pelayar biasa dahulu:",
    "ig.inapp1": "Tekan menu {MENU} atau <b>⋯</b> di penjuru atas.",
    "ig.inapp2": "Pilih <b>Buka dalam {B}</b> (atau <i>Open in browser</i>).",
    "ig.inapp3": "Kemudian ikut panduan pemasangan yang muncul.",
    "ig.onetap": "Pasang Harga Harian di skrin utama untuk buka terus seperti aplikasi biasa, termasuk tanpa internet.",
    "ig.install": "Pasang sekarang",
    "ig.ios": "Tambah Harga Harian ke skrin utama untuk buka terus seperti aplikasi biasa, termasuk tanpa internet.",
    "ig.ios1": "Dalam <b>Safari</b>, tekan butang Kongsi {SHARE} (di bawah, atau dalam menu <b>⋯</b>).",
    "ig.ios2": "Tatal ke bawah dan pilih <b>Tambah ke Skrin Utama</b> {ADD} <span class=\"muted\">(Add to Home Screen)</span>.",
    "ig.ios3": "Tekan <b>Tambah</b> di penjuru kanan atas.",
    "ig.and1": "Dalam <b>Chrome</b>, tekan menu {MENU} di penjuru kanan atas.",
    "ig.and2": "Pilih <b>Pasang apl</b> atau <b>Tambah ke skrin utama</b> <span class=\"muted\">(Install app / Add to Home screen)</span>.",
    "ig.and3": "Tekan <b>Pasang</b>.",
    "ig.desktop": "Buka laman ini di telefon dan tambah ke skrin utama. Di komputer, pelayar Chrome atau Edge menunjukkan butang Pasang di bar alamat.",
  },

  zh: {
    "lang.switch": "BM", "lang.aria": "切换到马来文 / Tukar ke Bahasa Melayu",
    "info.aria": "资讯：版本、更新记录、收集记录",
    "loading": "加载中…",
    "updated": "页面更新于 {t}",
    "load.fail": "数据加载失败，请稍后再试。",
    "update.banner": "有新版本 — 点击更新",
    "offline": "离线 — 显示上次保存的数据。",
    "build": "版本 {v} · {b}",

    "fresh.none": "无数据", "fresh.failed": "收集失败", "fresh.late": "延迟 {n} 天", "fresh.ok": "最新",
    "src.check": "到 {s} 核对 ↗",
    "src.price": "价格日期 {d}", "src.today": "（今天）", "src.ago": "（{n} 天前）", "src.collected": " · 收集于 {t}",
    "src.failed": "最近一次收集失败（{t}）。以下价格可能已过时。",
    "no.data": "无数据。",

    "mpob.title": "油棕鲜果串价格（MPOB）",
    "mpob.change": "与 {d} 相比的变化",
    "mpob.trend": "{r}走势（最近 {n} 个交易日）",
    "mpob.trend.aria": "{r}价格走势，最新 RM {v}",
    "mpob.share": "MPOB 油棕鲜果串价格（RM / 1% OER），{d}",
    "share": "分享",
    "reg.north": "北部", "reg.south": "南部", "reg.central": "中部",
    "reg.east_coast": "东海岸", "reg.sabah": "沙巴", "reg.sarawak": "砂拉越",

    "calc.title": "计算你的鲜果串价格",
    "calc.intro": "MPOB 价格是每 1% 出油率（OER）的价格。输入你的出油率和果串重量。",
    "calc.region": "地区", "calc.oer": "出油率 (%)", "calc.tons": "重量（吨）",
    "calc.note": "根据 MPOB 油厂门口参考价估算。实际价格取决于油厂、果串等级、扣除和运费。",
    "calc.noprice": "没有 MPOB 价格。", "calc.noregion": "此地区没有价格。",
    "calc.badoer": "请输入 10% 至 30% 之间的出油率（一般为 18–23%）。",
    "calc.perton": " / 吨",
    "calc.formula": "{p} × {o}% OER · {r}，{d} 的价格",
    "calc.total": "{n} 吨总额：",

    "toast.copied": "已复制，可贴到 WhatsApp 或短信。",
    "toast.noshare": "此浏览器无法分享。",

    "fama.title": "市场价格（FAMA）",
    "fama.levels": "价格层级", "state": "州", "district": "县", "category": "类别",
    "lvl.Ladang": "农场", "lvl.Borong": "批发", "lvl.Runcit": "零售",
    "cat.all": "全部", "cat.fav": "★ 收藏", "cat.veg": "蔬菜", "cat.fruit": "水果", "cat.livestock": "畜禽",
    "fama.search": "搜索（马来文名，例：ayam）",
    "all.states": "全部州", "all.districts": "全部县", "all.malaysia": "全马来西亚",
    "few": "记录少", "few.short": "少", "few.title": "记录少：平均价不太准确",
    "change.title": "与上一周相比",
    "dist.loading": "正在加载县级价格…", "dist.fail": "县级价格加载失败。",
    "fama.window": "价格为 {n} 天平均（{from} – {to}），按 FAMA 记录笔数加权。▲▼ = 与上一周相比。“记录少” = 少于 {few} 笔记录，平均价不太准确。点击商品可比较层级、地点和走势。",
    "fav": "收藏",
    "records": "{n} 笔记录",
    "fav.none": "还没有收藏。打开商品，点 ☆ 即可收藏。",
    "no.match": "没有符合的结果。",
    "fama.none": "此期间{loc}没有{lvl}价格。",
    "fama.count": "{n} 种商品 · {lvl} · {loc}",
    "share.few": "（记录少）",
    "share.window": "{n} 天平均 {from} – {to}，FAMA",
    "nodata.short": "无数据",
    "lowest": "最低", "highest": "最高",
    "trend.loading": "正在加载走势…",
    "fav.remove": "取消收藏", "fav.add": "加入收藏",
    "fav.added": "已加入收藏。", "fav.removed": "已取消收藏。",
    "close": "关闭",
    "chain": "价格链（农场 → 批发 → 零售）",
    "markup": "零售价比农场价高 {p}%。",
    "trend.title": "30 天走势（{lvl}，{loc}）",
    "by.district": "{st}各县（{lvl}）", "by.state": "各州（{lvl}）",
    "no.peers": "没有其他地点的数据。",
    "share.price": "分享价格",
    "window.short": "{n} 天平均（{from} – {to}）。",
    "trend.aria": "{item} 价格走势，{n} 天有记录",
    "trend.days": "每日平均 · {n} 天中有 {d} 天有记录。",
    "trend.weak": "空心点 ○ = 当天少于 {few} 笔记录（不太准确）。",
    "trend.few": "记录不足，无法显示走势。", "trend.fail": "走势加载失败。",

    "kpdn.title": "零售价格（KPDN PriceCatcher）",
    "kpdn.search": "搜索（马来文名，例：bayam）",
    "kpdn.premises": "{u} · {n} 家店",
    "kpdn.note": "价格为各店家报价的中位数。",

    "share.title": "分享应用",
    "share.intro": "用手机相机扫描二维码即可打开 Harga Harian。点击二维码可放大。",
    "qr.enlarge": "放大二维码", "qr.alt": "二维码：{u}", "qr.big": "大二维码",
    "copy.link": "复制链接",
    "install.help": "如何添加到主屏幕",
    "share.app": "Harga Harian：MPOB 油棕鲜果串价格、FAMA 市场价格、KPDN 零售价格。免费，可添加到手机主屏幕。",
    "link.copied": "链接已复制。", "link.press": "长按链接即可复制。",

    "app": "应用", "ver": "版本", "released": "发布时间", "buildid": "构建", "data.updated": "数据更新于",
    "changelog": "更新记录", "your.ver": "你的版本", "unreleased": "未发布",
    "history": "数据收集记录",
    "history.intro": "每次收集（每天下午 6:13 自动，或手动），保留最近 90 天。所有时间均为马来西亚时间。",
    "hist.time": "时间", "trig.auto": "自动", "trig.manual": "手动", "trig.local": "其他",
    "hist.none": "暂无记录。", "info.fail": "加载失败，请稍后再试。",

    "ig.title": "添加到主屏幕", "ig.sub": "免费 · 无广告 · 无需注册", "ig.later": "稍后",
    "ig.inapp": "此应用内的浏览器无法安装 Harga Harian。请先用一般浏览器打开：",
    "ig.inapp1": "点击上方的选单 {MENU} 或 <b>⋯</b>。",
    "ig.inapp2": "选择<b>在 {B} 中打开</b>（或 <i>Open in browser</i>）。",
    "ig.inapp3": "然后按照弹出的安装说明操作。",
    "ig.onetap": "把 Harga Harian 安装到主屏幕，像一般应用一样直接打开，离线也能用。",
    "ig.install": "立即安装",
    "ig.ios": "把 Harga Harian 添加到主屏幕，像一般应用一样直接打开，离线也能用。",
    "ig.ios1": "在 <b>Safari</b> 中，点击分享按钮 {SHARE}（在下方，或在 <b>⋯</b> 选单里）。",
    "ig.ios2": "向下滑动，选择<b>添加到主屏幕</b> {ADD} <span class=\"muted\">(Add to Home Screen)</span>。",
    "ig.ios3": "点击右上角的<b>添加</b>。",
    "ig.and1": "在 <b>Chrome</b> 中，点击右上角的选单 {MENU}。",
    "ig.and2": "选择<b>安装应用</b>或<b>添加到主屏幕</b> <span class=\"muted\">(Install app / Add to Home screen)</span>。",
    "ig.and3": "点击<b>安装</b>。",
    "ig.desktop": "请在手机上打开此网页并添加到主屏幕。在电脑上，Chrome 或 Edge 的网址栏会显示安装按钮。",
  },
};

function t(key, vars = {}) {
  const s = STR[LANG]?.[key] ?? STR.ms[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

// Static page text: data-i18n="key" sets the text; data-i18n-attr="placeholder:key;aria-label:key".
function applyStaticText() {
  document.documentElement.lang = LANG === "zh" ? "zh-Hans" : "ms";
  for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = t(n.dataset.i18n);
  for (const n of document.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of n.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":");
      n.setAttribute(attr, t(key, { u: "https://bryanwoo988.github.io/TanaPriceInfo/" }));
    }
  }
}
