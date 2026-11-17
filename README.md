# TanaPriceInfo

每日价格自动收集（MPOB + FAMA + PriceCatcher）。每天马来西亚时间下午 6:13 由 GitHub Actions 自动跑，把价格存成 CSV 提交回这个 repo，给 PWA 读取。

| 来源 | 拿什么 | 存在哪里 | 可靠度 |
|---|---|---|---|
| MPOB | 每日 FFB 参考价，6 个区（RM / 1% OER） | `data/mpob_ffb_daily.csv` | 高：每月一个 PDF |
| FAMA | Panduan Harga Harian：Ladang / Borong / Runcit，按日期、州、县、作物 | `data/fama/YYYY-MM.csv` | 中：已和 FAMA 网站核对一致；但靠抓 Power BI，FAMA 改版就可能坏 |
| PriceCatcher（备用） | KPDN 每日蔬菜水果零售价，按州 | `data/pricecatcher/` | 高：data.gov.my 开放数据 |

## 设置（只做一次）

1. **Settings → Actions → General → Workflow permissions** 选 **Read and write permissions**，保存。
2. 把包含 `.github/workflows/daily.yml` 的分支合并进 **默认分支（main）**。GitHub 只会在默认分支上按时间表自动跑。
3. **Actions** 页 → "Harga harian (FAMA + MPOB)" → **Run workflow**。
   第一次可以在 `mpob_backfill` 填 `2020-07`，把 MPOB 从 2020 年 7 月（开始用 1% OER）到现在的数据一次拿完。
4. 跑完后看 `data/` 有没有新文件。之后每天自动跑，哪个来源失败 GitHub 会发 email。

## 用手机操作

脚本不在手机上跑，在 GitHub 的服务器上跑。手机只负责启动和查看：

- **手动跑一次**：GitHub App 或手机浏览器打开 repo → Actions → 选这个 workflow → Run workflow。
- **看结果**：同一页能看到每次是成功还是失败，点进去看日志。
- **看数据**：repo 里打开 `data/` 下的 CSV。
- **看价格**：打开 PWA（见下面），可以加到主屏幕。

## PWA 和数据接口

网址：**https://bryanwoo988.github.io/TanaPriceInfo/**

- 界面用马来文。底部三个标签：**MPOB**（油棕 FFB 价：6 区、涨跌、走势图）、**FAMA**（Ladang/Borong/Runcit、州、县、分类、搜索；点产品看三个层级和各州/各县比较）、**KPDN**（PriceCatcher 按州零售价）。右上角 ⓘ 是 Info（版本、更新记录、抓取历史）。某个来源过期或抓取失败时，它的标签旁有红点。
- 手机加到主屏幕：iPhone 用 Safari → 分享 → 「添加到主屏幕」；Android 用 Chrome → 菜单 → 「安装应用」。
- 离线时显示上次打开时的价格。
- **语言**：右上角语言选单，三种语言：马来文（BM）、中文（简体）、英文（EN）。第一次打开时先弹出语言选择（English 默认、Bahasa Melayu、中文；不选直接关闭 = 英文），之后记住选择，安装教学在选好语言后才出现。FAMA / KPDN 商品名、州名、县名不翻译。
  所有界面文字在 `web/i18n.js`（`ms`、`zh`、`en` 三份，键必须一致）；HTML 里用 `data-i18n="键"`，JS 里用 `t("键", {变量})`。新增文字时三种语言都要加，缺的会显示马来文。
  更新记录的翻译写在 `web/changelog.json` 的 `title_zh` / `notes_zh` / `title_en` / `notes_en`。
- **MPOB 计算器**：MPOB 页下方，输入地区、出油率（OER %）和吨数，得出每吨参考价和总额（MPOB 价格 × OER）。
- **FAMA**：列表显示和上星期比的 ▲▼ %（同一批县比较，两周都至少 3 笔记录才显示）；等级 F.A.Q（一般平均品质）不显示，A/B/C 等真正等级才显示；点产品看 30 天走势（空心点 = 当天少于 3 笔）；☆ 收藏（存在手机里，排在最前，可用"★ Kegemaran"筛选）；"Kongsi harga"分享价格文字。MPOB 页也可分享当天 6 区价格。
- **安装教学**：第一次在手机浏览器打开时，从底部弹出"加到主屏幕"教学，按手机类型显示：iPhone Safari 步骤、Android Chrome 一键"Pasang sekarang"（不支持时显示选单步骤）、在 Facebook/Instagram 等 app 内打开时先教用 Safari/Chrome 打开。关掉后不再自动出现；已安装（从主屏幕打开）不会出现；电脑不自动出现。Info 页的"Cara pasang di skrin utama"可再打开。
- **分享**：Info 页最上面有 QR code（点一下放大）、"Kongsi"（手机分享选单）和"Salin pautan"（复制网址）。
  QR 图是 `web/icons/qr.svg`，内容固定为 `https://bryanwoo988.github.io/TanaPriceInfo/`。**repo 改名或换网址时要重新生成**：
  `pip install segno` 然后 `python -c "import segno; segno.make('新网址', error='m').save('web/icons/qr.svg', border=4)"`，并改 `web/app.js` 里的 `APP_URL`。
- **自动更新**：每次发布，`build_site.py` 按 `web/` 的内容算出版本号写进 `sw.js`，所以代码一改，手机就检测得到。已加到主屏幕的 app 在打开或从背景切回来时会检查新版本：有就自动重新加载（正在看产品详情或打字时，改为顶部提示"Versi baharu tersedia"，点一下更新）。切回来时数据超过 10 分钟也会重新拿。页面底部显示版本号（`Versi …`），也可以看 `version.json`。
- 网页文件和数据都是"先上网拿最新，4 秒内拿不到才用缓存"。

### 版本号、更新记录、抓取历史

PWA 的 **Info** 页显示这三样，所有时间都是马来西亚时间，不受手机时区影响。

- **发布新版本**：在 `web/changelog.json` 最上面加一项（`version`、`title`、`notes`），合并进 `main` 就会发布。
  **发布时间不用写**：`build_site.py` 从 git 取这个版本合并进 `main` 的时间（合并提交的时间），换成马来西亚时间。
  `changelog.json` 出现之前的版本，用 `commit` 指向当时的合并提交。
- **版本号规则**：新功能加中间那位（1.3.0 → 1.4.0），只修问题加最后一位（1.4.0 → 1.4.1），接口有不兼容改动才加第一位。
- **抓取历史**：`data/history.json`，每次抓取每个来源一笔（时间、成功与否、备注、GitHub 运行编号、自动或手动），保留 90 天；接口：`api/history.json`。
- 网站上也有 `version.json`（当前版本、发布时间、构建号）和 `changelog.json`（完整更新记录）。
- 每天价格收集跑完后，`Publish PWA + API` workflow 会自动重建网站；改了 `web/` 也会自动发布。

### 第一次启用（只做一次）

**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。然后到 Actions 手动跑一次 "Publish PWA + API"。

### 给其他 app 用的 JSON 接口

所有网址都是 `https://bryanwoo988.github.io/TanaPriceInfo/` 加上：

| 网址 | 内容 |
|---|---|
| `api/latest.json` | 一次拿全部：MPOB 最新一天 + FAMA 全国价格 + PriceCatcher 最新一天 |
| `api/mpob.json` | 收集到的全部 MPOB 日期 |
| `api/fama.json` | FAMA 全国 + 各州价格（三个层级），加 `states`：每州有哪些县 |
| `api/fama_daerah.json` | FAMA 各县价格（文件较大，需要时才读） |
| `api/pricecatcher.json` | PriceCatcher 最新一天，全部州 |
| `data/*.csv` | 原始 CSV（例如给 Google Sheets 用） |

规则：
- 价格单位是 RM，数字类型；没有价格时是 `null`。
- 日期格式 `YYYY-MM-DD`；`generated_at` 是马来西亚时间。
- `schema` 是格式版本号。以后如果有不兼容的改动，这个数字会加 1。
- MPOB 的 `status`：`ok`、`NT`（没交易）、`PH`（公共假期）。
- FAMA 价格是最近 7 天（`window.from` 到 `window.to`）的平均，按 FAMA 记录笔数加权，和 FAMA 网站的 "Harga Purata" 算法一样（FAMA 网站默认是 30 天）。
  每一项：`level`（Ladang/Borong/Runcit）、`state`、`district`（`null` = 全部）、`item`、`grade`、`unit`、`category`、`price`、`records`（几笔记录）、`latest_date`（窗口内最新一笔的日期）、
  `few_records`（少于 `window.few_records_below` 笔，平均不太可靠）、`prev_price`（前 7 天所有地点的平均）、`change_pct`（和前 7 天比的 %，**同地比较**：只用两周都有报价的县，每县两周用同一权重 = 该县两周记录数合计；任一周少于 3 笔记录则为 `null`）、`change_basis`（用了几个县、两周各几笔记录）。
- `api/fama_trend.json`：最近 30 天每天的平均价，全国和各州（县太少，不提供）。`series` 的键是 `层级|州|作物|等级|单位`（州空白 = 全国），值按 `dates` 排列，每天是 `[价格, 记录笔数]` 或 `null`（当天没有记录）。
- 每天大约 6:20pm 更新一次，app 不需要频繁请求。

每个文件都有 `sources`，用来核对来源和判断数据新不新：

| 字段 | 意思 |
|---|---|
| `url` | 官方来源网址（MPOB 是那份月度 PDF） |
| `data_date` | 最新价格的日期 |
| `max_age_days` | 跟今天（马来西亚时间）比，`data_date` 超过这么多天就算过期 |
| `last_attempt` / `last_success` | 上次尝试抓取的时间 / 上次成功的时间 |
| `ok` | 上次抓取是否成功；`false` 时价格可能是旧的 |

建议你的 app 用这个规则显示状态：`ok == false` → 抓取失败；今天减 `data_date` 大于 `max_age_days` → 过期；其他 → 最新。PWA 用的就是这个规则。

## 数据新鲜度

- 每个来源的结果记在 `data/status.json`（每天由收集脚本写入）。
- PWA 每张卡片显示：最新 / 过期 N 天 / 抓取失败，加上价格日期、上次成功抓取时间，以及一个直接打开官方来源的链接。
- 有任何来源不是"最新"，页面顶部会出现黄色提醒。
- 新鲜度按你打开页面的时间计算，所以离线打开很久以前的数据也会显示过期。

`api/latest.json` 例子（节录）：

```json
{
  "schema": 2,
  "generated_at": "2026-11-17T18:16:02+08:00",
  "sources": {
    "mpob": {"name": "MPOB", "url": "https://price.mpob.gov.my/pdf/daily/ffb/2026-11-16",
             "data_date": "2026-11-16", "date_kind": "price", "max_age_days": 2,
             "last_attempt": "2026-11-17T18:14:05+08:00", "last_success": "2026-11-17T18:14:05+08:00", "ok": true}
  },
  "mpob": {
    "unit": "RM per 1% OER (harga pintu kilang)",
    "date": "2026-11-16",
    "prices": {"north": 44.36, "south": 44.67, "central": 44.42, "east_coast": 44.4, "sabah": 40.07, "sarawak": 40.17},
    "previous_date": "2026-11-13",
    "change": {"north": 0.26, "south": 0.27, "central": 0.24, "east_coast": 0.26, "sabah": 0.23, "sarawak": 0.23}
  },
  "fama": {"date": "2026-11-17", "window": {"from": "2026-11-11", "to": "2026-11-17", "days": 7},
           "items": [{"level": "Ladang", "state": null, "district": null, "item": "PISANG BERANGAN",
                      "grade": "F.A.Q", "unit": "Kilogram", "category": "Buah-Buahan",
                      "price": 2.97, "records": 85, "latest_date": "2026-11-17"}]},
  "pricecatcher": {"date": "2026-11-16",
                   "items": [{"state": "Johor", "item": "BAYAM HIJAU", "unit": "1kg", "category": "SAYUR-SAYURAN",
                              "premises": 86, "median": 6.0, "min": 3.78, "max": 14.0}]}
}
```

Flutter 例子：

```dart
final r = await http.get(Uri.parse('https://bryanwoo988.github.io/TanaPriceInfo/api/latest.json'));
final data = jsonDecode(utf8.decode(r.bodyBytes));
final north = data['mpob']['prices']['north'];   // double 或 null
```

React Native：完整的现成代码（请求、离线缓存、新鲜度、示范页面）在 [`examples/react-native/`](examples/react-native/)。最简单的读法：

```js
const data = await (await fetch('https://bryanwoo988.github.io/TanaPriceInfo/api/latest.json')).json();
const north = data.mpob.prices.north;
```

本地预览：`python scripts/build_site.py` 然后 `python -m http.server -d site 8000`，打开 http://localhost:8000 。

## 第一次跑完要检查

- **MPOB**：看 `data/mpob_ffb_daily.csv`。NT = 没交易，PH = 公共假期，价格栏留空。
  日志里如果出现 `skipped unrecognised line`，表示 PDF 有些行格式不认得，把那几行发给 Claude 修。
- **FAMA**：日志里的 `CHECK Ladang/All/All` 几行，是用同样方法重算 FAMA 网站默认画面（Ladang、全部州、全部日期）的价格，可以和网站对比。
  出问题时：日志会印出 FAMA 的数据结构和网页查询；原始数据在那次运行页面的 **Artifacts → fama-raw**。
  出现 `table is incomplete` 表示超过 30000 行被截断，数据已保存但不完整。
- **PriceCatcher**：每月 1–3 号新月份文件可能还没发布，会显示 `not published yet`，不算失败。

## 可能遇到的问题

- **政府网站挡外国 IP**：GitHub 服务器在美国／欧洲。如果某个来源一直连不上，多半是这个原因，只能改在马来西亚的电脑上跑（见下面）。
- **FAMA 改版**：脚本会失败并发 email，下载 fama-raw 发给 Claude 修。

## 在自己电脑上跑（Windows）

```
pip install -r requirements.txt
python -m playwright install chromium
python scripts/mpob_ffb.py
python scripts/fama_prices.py
python scripts/pricecatcher_sayur.py
```

每天自动跑：用 Windows「任务计划程序」每天 6pm 执行上面三行。
调试 FAMA：`python scripts/fama_prices.py --show` 会打开看得见的浏览器，并截图到 `data/fama_debug.png`。
