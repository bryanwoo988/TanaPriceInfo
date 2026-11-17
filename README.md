# TanaPriceInfo

每日价格自动收集（MPOB + FAMA + PriceCatcher）。每天马来西亚时间下午 6:13 由 GitHub Actions 自动跑，把价格存成 CSV 提交回这个 repo，给 PWA 读取。

| 来源 | 拿什么 | 存在哪里 | 可靠度 |
|---|---|---|---|
| MPOB | 每日 FFB 参考价，6 个区（RM / 1% OER） | `data/mpob_ffb_daily.csv` | 高：每月一个 PDF |
| FAMA | Harga Pasaran Terkini（全部州、全部作物） | `data/fama_prices.csv`，每天一份在 `data/fama/` | 未验证：假设 FAMA 用 Power BI，要第一次跑过才知道 |
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

- 界面用马来文。首页：MPOB 油棕 FFB 价（6 区、和上一个交易日比较、走势图）+ FAMA 批发价（可搜索）。"Runcit" 页：PriceCatcher 按州的零售价。
- 手机加到主屏幕：iPhone 用 Safari → 分享 → 「添加到主屏幕」；Android 用 Chrome → 菜单 → 「安装应用」。
- 离线时显示上次打开时的价格。
- 每天价格收集跑完后，`Publish PWA + API` workflow 会自动重建网站；改了 `web/` 也会自动发布。

### 第一次启用（只做一次）

**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。然后到 Actions 手动跑一次 "Publish PWA + API"。

### 给其他 app 用的 JSON 接口

所有网址都是 `https://bryanwoo988.github.io/TanaPriceInfo/` 加上：

| 网址 | 内容 |
|---|---|
| `api/latest.json` | 一次拿全部：MPOB 最新一天 + FAMA 最新列表 + PriceCatcher 最新一天 |
| `api/mpob.json` | 收集到的全部 MPOB 日期 |
| `api/fama.json` | FAMA 最新一天 |
| `api/pricecatcher.json` | PriceCatcher 最新一天，全部州 |
| `data/*.csv` | 原始 CSV（例如给 Google Sheets 用） |

规则：
- 价格单位是 RM，数字类型；没有价格时是 `null`。
- 日期格式 `YYYY-MM-DD`；`generated_at` 是马来西亚时间。
- `schema` 是格式版本号。以后如果有不兼容的改动，这个数字会加 1。
- MPOB 的 `status`：`ok`、`NT`（没交易）、`PH`（公共假期）。
- FAMA 的 `verified: false` 表示数据还没和 FAMA 网站核对。
- 每天大约 6:20pm 更新一次，app 不需要频繁请求。

`api/latest.json` 例子（节录）：

```json
{
  "schema": 1,
  "generated_at": "2026-11-17T18:16:02+08:00",
  "mpob": {
    "unit": "RM per 1% OER (harga pintu kilang)",
    "date": "2026-11-16",
    "prices": {"north": 44.36, "south": 44.67, "central": 44.42, "east_coast": 44.4, "sabah": 40.07, "sarawak": 40.17},
    "previous_date": "2026-11-13",
    "change": {"north": 0.26, "south": 0.27, "central": 0.24, "east_coast": 0.26, "sabah": 0.23, "sarawak": 0.23}
  },
  "fama": {"date": "2026-11-17", "verified": false,
           "items": [{"item": "AYAM HIDUP", "grade": "F.A.Q", "unit": "Kilogram", "price": 6.88}]},
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

React Native 例子：

```js
const data = await (await fetch('https://bryanwoo988.github.io/TanaPriceInfo/api/latest.json')).json();
const north = data.mpob.prices.north;
```

本地预览：`python scripts/build_site.py` 然后 `python -m http.server -d site 8000`，打开 http://localhost:8000 。

## 第一次跑完要检查

- **MPOB**：看 `data/mpob_ffb_daily.csv`。NT = 没交易，PH = 公共假期，价格栏留空。
  日志里如果出现 `skipped unrecognised line`，表示 PDF 有些行格式不认得，把那几行发给 Claude 修。
- **FAMA**：打开 `data/fama/今天日期.csv`，看列名和内容对不对。
  不对的话：Actions 那次运行页面底部 **Artifacts → fama-raw** 下载原始 JSON，发给 Claude 修。
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
