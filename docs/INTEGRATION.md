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

## LLM 访问模式（`AppConfig.model.mode`）

| 模式 | 行为 |
|------|------|
| `mock` | 本地模板文案，不调外部 API |
| `direct` | 浏览器直连 `baseUrl`（需对方允许 CORS） |
| `proxy` | `POST /api/llm/proxy`，由 Node 转发，适合隐藏密钥、规避 CORS |

文案生成入口：`src/services/copyGenerator.ts`。  
聊天客户端：`src/services/llmClient.ts`。

## 扣子工作流

### 工作台集成配置

顶栏 **集成配置** 可选：

- `mock` — 不调扣子  
- `workflow` — 扣子  
- `llm` — 旧版直连接口（多数能力已迁到运营后台模型配置）

开发代理：`/coze-api` → `https://api.coze.cn`（改 `vite.config.ts` 后需重启 `npm run dev`）。

### 方案 A：全流程灌入

「新闻抓取 → 立即抓取」调用 `runCozePipeline`，期望结束节点输出结构化 JSON：

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

也兼容「数组元素内带 products/copies」等形态。若只有纯文本字符串数组，会降级为占位新闻 + 文案。

**常见失败：**

1. 结束节点直接返回 `["没有推荐内容", "长文案", ...]`，无 `news`/`matches` → 网页无法灌入完整列表。  
2. 循环含多段大模型，耗时数十秒 → 同步 `/v1/workflow/run` 可能 `data` 为空，需异步或加长超时（后续可做 BFF）。  
3. 知识库未命中 → 多条「没有推荐内容」，属业务数据问题。

设置页「测试调用工作流」会优先按全流程解析验证。

### 单步文案

创作文案步在 `integration.mode === 'workflow'` 且配置就绪时，走 `runCozeWorkflow`（传入当前新闻+商品）。

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
