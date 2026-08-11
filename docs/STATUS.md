# 项目现状（MVP）

更新日期：2026-08-11

## 定位

电商媒体热点营销工作台 MVP：运营在后台配置提示词 / 模型 / 商品 / 信源，在工作台走完「热点 → 选品 → 文案 → 审核」闭环。演示可用；真实发微博、真实热搜榜 API 尚未接入。

## 主路径（五步）

1. **新闻抓取** — 后台信源（内置演示榜仍为 mock；RSS 为真实拉取）+ 借势硬边界审核（`newsGate`）
2. **建议匹配** — LLM / 规则按热点从商品库推荐（`productMatch`），点选采纳
3. **确认匹配** — 人工终审；可保留建议或全库分页补选，最终绑定
4. **创作文案** — 后台提示词 + `AppConfig.model`（mock / direct / proxy）+ 机审与可选返工
5. **审核并发送** — 微博预览与模拟发布

## 架构决策

| 决策 | 说明 |
|------|------|
| 后台控主路径 | 文案与抓取以 `AppConfig` 为准，不依赖扣子 |
| 扣子旁路 | 仅顶栏集成配置「测试调用」；不拦截工作台步骤 |
| 建议 / 确认分步 | 建议页专注 AI；确认页做终审与全库补选（分页 + 吸底下一步） |
| 配置三级 | `server/data/config.json` → localStorage → 代码默认值 |

## 真实数据怎么跑

1. `npm run server` + `npm run dev`
2. 运营后台「模型」：`proxy` 或 `direct` + API Key，测通后再生成文案
3. 商品：CSV / Excel 导入或后台编辑（勿提交含密钥的 `config.json`）
4. 热点：加 RSS；内置微博等榜单仍是演示数据

不需要数据源 MCP；不需要扣子即可验提示词效果。

## 已知边界

- 内置热榜非真实榜单 API
- 发布为模拟，无真实发帖
- 扣子全流程灌入已从主路径移除，代码保留供连通测试
- `server/data/config.json` 已 gitignore，含密钥时勿提交

## 相关文档

- [README](../README.md) — 快速开始
- [ARCHITECTURE](./ARCHITECTURE.md) — 目录与数据流
- [INTEGRATION](./INTEGRATION.md) — LLM / 信源 / 扣子旁路
- [ADMIN](./ADMIN.md) — 运营后台
