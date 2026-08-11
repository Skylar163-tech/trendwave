# 集成说明：扣子 / LLM / 配置

## 配置层级（三级）

| 优先级 | 来源 | 何时使用 |
|--------|------|----------|
| 1 | `GET /api/config` → `server/data/config.json` | 已启动 `npm run server` |
| 2 | `localStorage` | 无服务或服务不可达 |
| 3 | `DEFAULT_APP_CONFIG` | 首次进入 |

顶栏徽章会显示当前来源（服务端 / 本机浏览器 / 默认）。

密钥存放建议：

- 浏览器直连：运营后台「模型」页的 `apiKey`（随配置存服务端或 localStorage）  
- 服务端中转：环境变量 `TRENDWAVE_LLM_KEY`，请求体可不带 key  
- 扣子：顶栏「集成配置」的 `pat_`（另存 integration 本地配置）

**禁止**使用 `VITE_*` 存放密钥。

## 借势硬边界与商品智能匹配

### 热点借势审核（新闻抓取后）

「立即抓取」拉取信源后，会调用 `runNewsGate`（[`src/services/newsGate.ts`](../src/services/newsGate.ts)）：

- 提示词：`AppConfig.prompts.newsGateSystemRole` / `newsGateUserTemplate`（运营后台可改、可试运行）
- 结果写入 `NewsItem.gateStatus` / `gateCategories` / `gateReason`
- 卡片标注「需人工审核 · 涉及…」；进入下一步需确认
- `model.mode === mock` 时走本地关键词规则
- **输出契约**：JSON `{"results":[{"id","status":"clear|needs_review","categories","reason"}]}`；不要改成 `SKIP_SENSITIVE` 等纯文本标签

### 商品智能匹配（建议匹配 → 确认匹配）

进入建议匹配后自动（或手动「重新 AI 匹配」）调用 `matchProductsForNews`（[`src/services/productMatch.ts`](../src/services/productMatch.ts)）：

- 提示词：`productMatchSystemRole` / `productMatchUserTemplate`
- 只允许返回商品库中已有 `id`；失败时降级标签/品类启发
- 卡片下展示匹配理由；点选「采纳」后进入确认匹配
- 确认匹配：可保留 AI 结果，或分页搜索全库补选并最终绑定
- **输出契约**：JSON `{"matches":[{"productId","score","reason"}]}`；无自然关联时返回空数组，不要只输出关键词或「没有对应内容」

详见运营后台「提示词」页中的对应区块。

### 文案创作契约

- `systemRole` + `materialTemplate` 生成**一条微博纯正文**（可含 Emoji / `#话题`）
- 不要改成「新闻标题 / 推荐决策 / 经营指标 / 微博文案」多字段报告，否则机审与返工链路会失效
- 单件商品格式可含条件块：`{{#product_monthly_sales}}` 等经营指标（无数据则省略）

## LLM 访问模式（`AppConfig.model.mode`）


| 模式 | 行为 |
|------|------|
| `mock` | 本地模板文案，不调外部 API |
| `direct` | 浏览器直连 `baseUrl`（需对方允许 CORS） |
| `proxy` | `POST /api/llm/proxy`，由 Node 转发，适合隐藏密钥、规避 CORS |

后台「模型 → 分场景温度」可分别调节文案创作 / 借势审核 / 商品匹配 / 返工评审，并支持「恢复默认温度」。旧配置只有单一 `temperature` 时会映射为创作温度。

文案生成入口：`src/services/copyGenerator.ts`。  
聊天客户端：`src/services/llmClient.ts`（`resolveSceneTemperature`）。

## 扣子工作流（可选，不挡主路径）

工作台「立即抓取 / 生成文案」**只走运营后台**：信源 + 提示词 + `AppConfig.model`。  
顶栏集成配置里的「扣子」仅用于本页「测试调用工作流」，验证连通与结束节点 JSON 形态；**不会**灌入工作台步骤。

### 工作台相关配置

- **提示词 / 模型 / 商品 / 信源**：运营后台（`AppConfig`）  
- **集成配置**：密钥旁路、可选扣子连通测试字段  

开发代理：`/coze-api` → `https://api.coze.cn`（改 `vite.config.ts` 后需重启 `npm run dev`）。

### 连通测试期望的 JSON

设置页「测试调用工作流」期望结束节点输出结构化 JSON（也可包在 output 字符串里）：

```json
{
  "news": [{ "id": "n1", "title": "...", "summary": "...", "tags": ["..."] }],
  "matches": [{
    "newsId": "n1",
    "products": [{
      "name": "...",
      "brand": "...",
      "price": 99,
      "sellingPoints": ["..."],
      "matchScore": 80
    }],
    "copies": ["微博文案1", "微博文案2", "微博文案3"]
  }]
}
```

也兼容「数组元素内带 products/copies」等形态。

**常见失败：**

1. 结束节点直接返回 `["没有推荐内容", "长文案", ...]`，无 `news`/`matches`。  
2. 循环含多段大模型，耗时数十秒 → 同步 `/v1/workflow/run` 可能 `data` 为空。  
3. 知识库未命中 → 多条「没有推荐内容」，属业务数据问题。

### 遗留单步文案接口

[`src/services/cozeWorkflow.ts`](../src/services/cozeWorkflow.ts) 仍可供连通测试回退探测；工作台创作步不再调用。

## 提示词模板

引擎：`src/services/promptEngine.ts`。

- `{{key}}` 替换  
- `{{#key}}...{{/key}}` 条件块（值非空才保留）  
- 未知占位符原样保留  

占位符清单见 `src/config/defaults.ts` 中 `PLACEHOLDERS`。

## 环境变量

见仓库根目录 `.env.example`：

| 变量 | 说明 |
|------|------|
| `TRENDWAVE_PORT` | 配置服务端口，默认 `8787` |
| `TRENDWAVE_LLM_KEY` | 中转模式默认上游密钥（可选） |
