# tuoleX auto v0.1.0 — Community Edition

**简体中文** ｜ [English](#english)

首个可自托管版本。把 A-SPICE 的过程、工作产品、追溯、评审与电子签名、变更记录，
以及 ISO 26262 功能安全工作产品，放进一个能自己部署、数据不出内网的系统里。

## 亮点

- **一条命令自托管**：`docker compose up -d` → `http://localhost:8087`，PostgreSQL 16 + Node API + nginx
- **过程与证据**：A-SPICE 过程树、工作产品、需求/追溯矩阵、评审、电子签名
- **审计可验证**：服务端哈希链审计，篡改会在校验时暴露
- **功能安全域**：HARA、安全需求链（SG/FSC/TSC）、FMEDA、FTA、DFA、Safety Case、确认措施、安全计划
- **本地优先**：无外部认证依赖、无遥测、断网可用
- **中英双语**：界面与文档
- **导出**：CSV / JSON / Excel / PDF

## 不包含（商业版能力）

标准与法规内容库（本仓库不含任何标准正文）、AI 智能搭建、跨产品协同（BOM/3D）、多租户与试用编排、计费。

## 快速开始

```bash
docker compose up -d
# 打开 http://localhost:8087 → 首次启动创建管理员账号
```

首次启动会要求创建**本机管理员**（没有出厂默认密码），账号只存在你自己的数据库里。

## 质量

- CI：lint / i18n 一致性 / 单元测试 / 前端构建 / 服务端类型检查 / gitleaks / 容器构建 + 启动冒烟
- 演示数据为虚构案例，可用 `SEED_DEMO=false` 关闭

## 许可

Apache-2.0。标准文本不随本仓库分发；标准名称归各自发布机构所有。
名称与标识使用见 [TRADEMARKS.md](../TRADEMARKS.md)。

---

<a name="english"></a>
## English

[简体中文](#tuolex-auto-v010--community-edition) ｜ **English**

The first self-hostable release. It puts A-SPICE processes, work products, traceability,
reviews and electronic signatures, change records — plus ISO 26262 functional safety work
products — into a system you can deploy yourself, with data staying inside your network.

### Highlights

- **One-command self-hosting**: `docker compose up -d` → `http://localhost:8087` (PostgreSQL 16 + Node API + nginx)
- **Process and evidence**: A-SPICE process tree, work products, requirements/traceability matrix, reviews, electronic signatures
- **Verifiable audit**: server-side hash-chained audit; tampering is exposed on verification
- **Functional safety domain**: HARA, safety requirement chain (SG/FSC/TSC), FMEDA, FTA, DFA, Safety Case, confirmation measures, safety plan
- **Local-first**: no external auth dependency, no telemetry, works offline
- **Bilingual**: UI and documentation (Chinese / English)
- **Exports**: CSV / JSON / Excel / PDF

### Not included (commercial edition)

Standards and regulatory content library (no standards text in this repository), AI scaffolding,
cross-product collaboration (BOM/3D), multi-tenancy and trial provisioning, billing.

### Quick start

```bash
docker compose up -d
# open http://localhost:8087 → create the administrator on first launch
```

On first launch you create a **local administrator** (there is no factory default password);
accounts exist only in your own database.

### Quality

- CI: lint / i18n consistency / unit tests / frontend build / server type-check / gitleaks / container build + startup smoke test
- Demo data is fictional and can be disabled with `SEED_DEMO=false`

### License

Apache-2.0. Standards texts are not distributed with this repository; standard names belong to
their respective publishers. See [TRADEMARKS.en.md](../TRADEMARKS.en.md) for name and mark usage.
