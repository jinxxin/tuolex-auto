# 路线图 · Roadmap

**简体中文** ｜ [English](ROADMAP.en.md)

这里只列「打算做」和「明确不做」，不承诺时间。社区版按 best-effort 维护，按季度吸收上游改动。

## 近期（v0.1.x）

- [ ] 编辑器升级到 Tiptap 3（修掉当前 1 条 moderate 依赖告警）
- [ ] 预构建镜像支持 linux/arm64（Apple Silicon / ARM 服务器）
- [ ] 英文 Issue 模板与文档继续补齐（已完成首批）
- [ ] 启动自检：端口/JWT_SECRET/数据库版本的小提示

## 下一阶段（v0.2，方向待定）

- [ ] 导入：从 CSV / Excel 批量导入需求与测试用例
- [ ] API Token：给自动化脚本用的最小权限令牌
- [ ] 审计导出：带校验说明的签名包
- [ ] 可观测性：结构化日志与健康检查细节

## 明确不做

- 不内置任何标准正文（ISO 26262 / A-SPICE PAM / IATF 等）
- 不做 SaaS、多租户、计费
- 不做 AI 自动生成需求/HARA/安全案例
- 不接定制开发（可以提 issue，企业需求走邮件）

## 怎么影响路线图

在 [Discussions](https://github.com/jinxxin/tuolex-auto/discussions) 或 issue 里说清楚「你要解决的问题」，比说「加个功能」有用得多。
