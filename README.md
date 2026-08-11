# TrendWave · 电商媒体热点营销工作台

从「新闻抓取 → 商品匹配 → 多风格文案生成 → 质检返工 → 审核发布」的运营工作台，附轻量运营后台与本地配置服务。

## 快速开始

```bash
npm install

# 终端 1：配置服务（端口 8787：配置读写 / LLM 中转 / RSS / 热榜）
npm run server

# 终端 2：前端（Vite，默认 5173）
npm run dev
```

浏览器打开 `http://localhost:5173`。

| 入口 | 地址 |
|------|------|
| 工作台 | `#/` |
| 运营后台 | 顶栏「运营后台」或 `#/admin/prompts` |

不启动 `npm run server` 时，配置落在本机 `localStorage`（顶栏显示「本机浏览器」）；服务可用时保存优先写入 `server/data/config.json`。

## 功能概览

### 工作台（五步业务流）

1. **新闻抓取** — 按运营信源拉取后，做借势硬边界审核（高风险标注「需人工审核」）；多列卡片展示  
2. **建议匹配** — 可配置提示词的 LLM 从商品库智能匹配（后台可试运行）  
3. **确认匹配** — 审定最终投放商品，支持全库分页补选  
4. **创作文案** — 按后台提示词与创作风格调用 LLM（或本地模拟）+ 质检返工  
5. **审核并发送** — 预览、通过、模拟发布  

扣子工作流为可选连通测试，**不拦截**工作台抓取与文案主路径。

### 运营后台

- **提示词** — system / 素材模板 / 单件格式 / 返工与评审提示（`{{占位符}}`）  
- **模型** — mock / 浏览器直连 / 服务端中转；DeepSeek 等预设  
- **商品** — 商品库与热点推荐关系；支持 CSV  
- **信源** — 内置热榜开关（今日头条为真实热榜）+ RSS  
- **评测** — 用例、权重与跑批（机审 + 模型评审）  

### 本地配置服务

[`server/index.mjs`](server/index.mjs)（无第三方依赖）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET/PUT | `/api/config` | 三级配置读写（写入前备份） |
| POST | `/api/llm/proxy` | OpenAI 兼容聊天中转 |
| GET | `/api/sources/fetch?url=` | 服务端拉取 RSS |
| GET | `/api/sources/hotboard?platform=toutiao` | 今日头条热榜（真实） |

Vite 将 `/api` 代理到 `127.0.0.1:8787`，`/coze-api` 代理到 `https://api.coze.cn`。

## 文档

- [架构与目录](docs/ARCHITECTURE.md)  
- [集成：扣子 / LLM / 配置层级](docs/INTEGRATION.md)  
- [运营后台说明](docs/ADMIN.md)  
- [项目现状（MVP）](docs/STATUS.md)  

## 安全注意

- **不要**把 API Key 写进 `VITE_*`（会打进前端包）。  
- 密钥放在：运营后台模型页、集成配置、或服务端环境变量 `TRENDWAVE_LLM_KEY`。  
- `server/data/config.json` 含本地运行时配置与密钥，**已加入 `.gitignore`**；仓库内仅提交 [`server/data/config.example.json`](server/data/config.example.json)。  
- 参考变量名见 [`.env.example`](.env.example)。

## 技术栈

- Vite 8 + React 19 + TypeScript  
- Tailwind CSS v4（`@tailwindcss/vite`）  
- 配置服务：Node 内置 `http` / `fs`  

## 脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 前端开发服务器 |
| `npm run server` | 本地配置 / 代理服务 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run lint` | oxlint |
| `npm run preview` | 预览构建产物 |
