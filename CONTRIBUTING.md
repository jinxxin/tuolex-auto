# 贡献指南 · Contributing

感谢愿意花时间改进这个工具的人。请先读完这一页，能省掉来回。

## 先提 issue，再提 PR

- 缺陷：请附版本、复现步骤、`docker compose logs api` 末尾日志。
- 功能：先说清**要解决的问题**；社区版按 best-effort 维护，不承诺排期。
- 较大的改动（>300 行或涉及数据模型）请先开 issue 对齐，避免白做。

## 开发环境

```bash
npm ci
cd server && npm ci && cd ..
npm run dev            # 前端 Vite（默认 5173）
cd server && npm run dev   # 后端 API（默认 3000，需要本地 PostgreSQL）
```

或者直接用容器：

```bash
docker compose build
docker compose up -d
```

## 提交前自测

```bash
npm run lint
npm run i18n:check
npm run test:fs
npm run build
```

改了服务端或 Dockerfile 时，再跑一次 `docker compose build`。

## 代码约定

- TypeScript 严格模式；不用 `any` 逃逸（确有需要请注释原因）。
- 文案一律走 i18n（`src/locales/zh.json` 与 `en.json` 必须同时有 key，`npm run i18n:check` 会拦）。
- 服务端所有写操作必须落审计（`writeAudit`），不要绕过。
- 新表/新列走 `server/src/db.ts` 的幂等迁移（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`），不要引入迁移框架。

## 许可与来源

- 提交即表示你同意以 **Apache-2.0** 授权本次贡献。
- **不要**提交任何标准正文（ISO 26262 / A-SPICE PAM / IATF 等）、客户数据或第三方受限材料。
- 引用第三方代码请在 PR 中说明来源与许可证，并更新 `THIRD_PARTY_NOTICES.md`。

## 安全问题

见 [SECURITY.md](SECURITY.md)，不要公开提 issue。
