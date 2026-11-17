# React Native 例子

读取 TanaPriceInfo 价格接口（`api/latest.json`）的现成代码。

| 文件 | 作用 | 需要吗 |
|---|---|---|
| `tanaPrices.ts` | 类型定义、请求、离线缓存、新鲜度判断、格式化 | **必须**，不依赖 React |
| `usePrices.ts` | React hook：先显示存起来的数据，再从网络更新；app 回到前台超过 30 分钟会自动更新 | 推荐 |
| `PricesScreen.tsx` | 示范页面：MPOB 6 区价格 + FAMA 全国价格（Ladang/Borong/Runcit 切换、可搜索），有来源链接、新鲜度标签、下拉刷新 | 参考用，按你的设计改 |

## 安装

1. 把这 3 个文件复制进你的项目（例如 `src/tana/`）。
2. 安装离线缓存要用的套件：

   ```
   npm install @react-native-async-storage/async-storage
   ```

   用 Expo 的话：`npx expo install @react-native-async-storage/async-storage`

3. 在你的导航里放 `PricesScreen`，或者在自己的页面用 `usePrices()`。

```tsx
import { usePrices } from './tana/usePrices';
import { freshness } from './tana/tanaPrices';

function MyWidget() {
  const { data, fromCache, refresh } = usePrices();
  if (!data) return null;
  const north = data.mpob.prices?.north;           // number | null
  const f = freshness(data.sources.mpob);          // { level, label, ageDays }
  // f.level: 'ok' | 'late' | 'failed' | 'none'
  ...
}
```

不用 React 的地方（例如后台任务）可以直接用 `loadPrices(AsyncStorage)`。

## 行为说明

- **网络优先，失败就用缓存**：没网络时显示上次存的数据，`fromCache` 是 `true`。
- **格式变了会报错，不会显示错的数字**：接口 `schema` 不是 2 时抛出 `SchemaError`，提示用户更新 app。
- **价格可能是 `null`**：显示成"—"，不要当成 0。
- **新鲜度规则和 PWA 一样**：上次抓取失败 → `failed`；价格日期距今天（马来西亚时间）超过 `max_age_days` → `late`；其他 → `ok`。
- **FAMA 州和县的价格**：`latest.json` 只有全国价格；要按州用 `api/fama.json`，按县用 `api/fama_daerah.json`，结构相同。
- **请求频率**：数据每天只更新一次（约 6:20pm），这个 hook 不会频繁请求。

## 已测试

- `tanaPrices.ts`：用真实接口数据测试了在线、离线有缓存、离线没缓存、格式版本变更、跨时区的"今天"、新鲜度各种状态。
- 3 个文件用 TypeScript strict 模式，对照 React Native 0.81 的类型检查通过。
- **没有在真机或模拟器上运行过**：`PricesScreen.tsx` 的画面效果请在你的 app 里看。
