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
- **PWA**：repo 设 Public 的话，PWA 直接读
  `https://raw.githubusercontent.com/bryanwoo988/TanaPriceInfo/main/data/mpob_ffb_daily.csv`。
  Private 的话要另外发布（例如 GitHub Pages）。

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
