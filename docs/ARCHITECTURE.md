# 架构与目录

## 运行时结构

```mermaid
flowchart TB
  browser[浏览器]
  vite[Vite_dev_5173]
  nodeServer[Node_server_8787]
  coze[api.coze.cn]
  llm[LLM_Provider]

  browser --> vite
  vite -->|"/api/*"| nodeServer
  vite -->|"/coze-api/*"| coze
  nodeServer -->|"/api/llm/proxy"| llm
  browser -->|"direct 模式"| llm
```

- **工作台**：Hash 路由 `#/`，五步流水线状态在 `WorkflowContext`。  
- **运营后台**：`#/admin/*`，读写 `AppConfig`（`AppConfigContext`）。  
- **配置三级**：`server` → `localStorage` → 代码内 `DEFAULT_APP_CONFIG`。

## 目录说明

```
trendwave/
├── docs/                     # 项目文档
├── server/
│   ├── index.mjs             # 配置 / LLM 中转 / RSS
│   └── data/
│       ├── .gitkeep
│       ├── config.example.json
│       └── config.json       # 本地运行时（gitignore）
├── src/
│   ├── admin/                # 运营后台 UI
│   ├── components/           # 工作台布局与步骤
│   ├── config/               # AppConfig 类型、默认值、合并与存取
│   ├── context/              # AppConfig / Integration / Workflow
│   ├── data/mock.ts          # 演示新闻与商品种子
│   ├── services/             # 扣子、LLM、提示词、质检、信源等
│   └── types/                # 工作流与集成类型
└── vite.config.ts            # /api、/coze-api 代理
```

## 核心数据流

### 文案生成

1. 工作台选中新闻 + 商品 → `generateWeiboCopy`（[`src/services/copyGenerator.ts`](../src/services/copyGenerator.ts)）。  
2. 若集成模式为扣子且配置就绪 → `runCozeWorkflow`。  
3. 否则按 `AppConfig.model.mode`：`mock` / `direct` / `proxy`，用 [`promptEngine`](../src/services/promptEngine.ts) 渲染模板后调 [`llmClient`](../src/services/llmClient.ts)。  
4. [`copyQA`](../src/services/copyQA.ts) 机审；失败时可 [`copyReview.autoReworkCopy`](../src/services/copyReview.ts) 返工。

### 配置读写

[`src/config/store.ts`](../src/config/store.ts) `loadConfigTiered` / `saveConfigTiered`：

1. 尝试 `GET/PUT /api/config`  
2. 失败则读写 `localStorage`  
3. 再失败用 `DEFAULT_APP_CONFIG`

### 扣子全流程（方案 A）

「立即抓取」→ [`runCozePipeline`](../src/services/cozePipeline.ts) → 解析结束节点 JSON → 灌入 `newsList` / 商品 / 预生成文案。约定见 [INTEGRATION.md](INTEGRATION.md)。

## 关键类型

| 类型 | 位置 | 用途 |
|------|------|------|
| `AppConfig` | `src/config/types.ts` | 提示词、模型、商品、信源、评测 |
| `IntegrationConfig` | `src/types/integration.ts` | 工作台顶栏「集成配置」（mock/workflow/llm） |
| `NewsItem` / `Product` / `CopyVariant` | `src/types/workflow.ts` | 流水线运行时实体 |
| `PipelineHydration` | `src/types/pipeline.ts` | 扣子全流程灌入结果 |
