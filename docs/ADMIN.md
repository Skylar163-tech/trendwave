# 运营后台

入口：顶栏「运营后台」或 Hash `#/admin/<page>`。

返回工作台：后台侧栏「返回工作台」→ `#/`。

## 页面

| 路由 page | 说明 |
|-----------|------|
| `prompts` | 角色设定、素材模板、商品条目格式、返工/评审提示；支持插入占位符 |
| `model` | 访问模式、厂商预设、温度、扣子兼容字段 |
| `products` | 商品库 CRUD、图标/渐变、热点→商品推荐映射、CSV 导入导出 |
| `sources` | 内置热榜开关、RSS 源；可通过服务端拉取预览 |
| `eval` | 评测权重、字数/标签/Emoji 约束、用例管理与跑批 |

草稿编辑在内存中；保存走 `AppConfigContext.persist` → 三级配置。商品列表为空时服务端会拒绝写入，防止误清空商品库。

## 与工作台关系

- 后台改提示词 / 风格 / 商品后，工作台生成文案与推荐列表会读同一份 `AppConfig`。  
- 顶栏「集成配置」仍可单独覆盖「是否走扣子全流程」等运行时集成项（`IntegrationConfig`）。  
- 评测页用用例驱动生成 + 机审 + 可选模型打分，不替代工作台人工审核步。

## 本地数据文件

- 运行时：`server/data/config.json`（gitignore，含密钥时勿提交）  
- 写入时自动备份：`server/data/config.backup.json`（同样 gitignore）  
- 仓库示例：`server/data/config.example.json`（`apiKey` 为空）  

首次部署可复制示例：

```bash
copy server\data\config.example.json server\data\config.json
```

然后在后台「模型」页填写密钥并保存。
