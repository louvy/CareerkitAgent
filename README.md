# CareerKitAgent · AI 求职入职工作台

基于 **Harness 编程模式** 的 AI 求职入职工作台：简历诊断/优化、JD 匹配、面试刷题与模拟面试，全部 Agent 动作受 **可观测性 / 治理与安全 / 验证与质量** 三支柱约束。


## 功能总览

**业务模块**

- **简历库**：简历 CRUD + **JadeAI 所见即所得编辑器**——50 套模板、hex 主题色、排版密度、自定义 CSS、区块拖拽排序（dnd-kit）、自动保存与撤销栈；AI 诊断（只读）→ 勾选问题 → 逐条确认建议 → 生成独立优化版本（原版保留）；支持 HTML（所见即所得）与 Word（主题色/双栏/密度渲染）导出。
- **JD 匹配**：粘贴 JD → 选择简历版本 → 逐条要求匹配诊断 + 内容重排与措辞优化建议（不虚构经历）。
- **面试刷题**：基于简历 + JD 按能力画像出题（核心知识/项目深挖/行为面试）→ 逐题作答 → reviewer 独立复盘；另提供「模拟面试」会话（interview-coach 一次一问、自适应追问）。
- **Agent 控制台**：7 个内置 Agent（求职编排器/简历诊断/简历优化/JD 匹配/面试出题/模拟面试官/质量评审员），支持查看、克隆、自定义配置，按闭环状态机流转。

**管理模块**

- **模型管理**：chat / embedding 两类 LLM 模型 CRUD，API Key Fernet 加密存储（列表仅显示掩码），真实调用连接测试，同分类唯一默认模型。
- **知识库**：多知识库管理，文档（txt/md）上传 → 切块（auto 段落感知 / fixed 固定窗口，大小与重叠可调，支持切块预览）→ 指定 embedding 模型向量化入库（原文存 MinIO）；**混合检索**（pg_trgm 关键词 + pgvector 向量 + RRF 融合）。
- **工具库**：http / mcp 两类自定义工具 CRUD，供 Agent 挂载（挂载经 ToolGuard 白名单校验）。

**可观测模块**

- **系统监控**：PostgreSQL（含 pgvector/pg_trgm 扩展）、Redis、MinIO 基础设施健康检查；Token 消耗按日聚合（Asia/Shanghai 时区归日，区分用户输入 / Agent 输出）。
- **链路追踪**：每次 Agent 运行的节点、LLM 调用、工具调用全事件落库（`agent_traces` JSONB），支持展开明细回放调试。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 (App Router) + Tailwind CSS + Radix UI + Zustand + dnd-kit |
| 后端 | Python 3.11 + FastAPI + LangChain/LangGraph + SQLAlchemy 2.0 + Alembic |
| 数据库 | PostgreSQL 15 + pgvector（业务 + 向量一体，HNSW 索引） |
| 缓存 | Redis 7（记忆缓存 / 限流 / 会话） |
| 对象存储 | MinIO（简历原始文件 / 导出文件 / 知识库文档） |
| LLM | OpenAI 兼容接口（BaseURL / Key / Model 模型管理页配置，Fernet 加密存储） |

## 架构总览

```
┌──────────────────────────── 前端 Next.js 14 ────────────────────────────┐
│  业务：控制中心 / 简历库(JadeAI编辑器) / JD匹配 / 面试刷题 / Agent       │
│  管理：模型管理 / 知识库 / 工具库   可观测：系统监控 / 链路追踪          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ REST + 可观测中间件(X-Request-Id)
┌──────────────────────────────────▼──────────────────────────────────────┐
│                        后端 FastAPI + LangGraph                          │
│  ┌─ Harness 层 ──────────────────────────────────────────────────────┐  │
│  │ 全局宪法(Constitution) │ 闭环状态机(ClosedLoop) │ 钩子(Hooks)       │  │
│  │ 工具白名单(ToolGuard) │ 质量门禁(QualityGate) │ 审计(Audit)         │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  Agent 注册表：编排器 / 简历诊断 / 简历优化 / JD匹配 / 面试出题 /         │
│               模拟面试官 / 质量评审员（draft→configured→reviewed→enabled）│
│  策略：simple_chat / react / plan_execute / workbench                    │
│  业务服务：RAG混合检索(pg_trgm+pgvector+RRF) │ 记忆(滑动窗口+滚动摘要)    │
│  可观测性：Trace 持久化(可回放) │ Token/成本统计 │ 运行审计              │
└──────────────┬──────────────────────────────┬────────────┬──────────────┘
      PostgreSQL 15 + pgvector             Redis 7        MinIO
```

## Harness 三支柱（所有 Agent 动作的硬性约束）

### 1. 可观测性（Observability）
- `X-Request-Id` 由中间件生成并透传至所有 Agent 节点与工具调用；
- 每次 Agent 运行完整落库 `agent_traces`（JSONB）：系统提示词、输入、节点输出、工具调用参数/结果、Token 用量、耗时——前端「链路追踪」支持事件级回放调试；
- Token 与耗时统计聚合入 `agent_runs`，监控页按日展示；
- 所有 Agent 创建/配置/启停/调用写入 `audit_logs`。

### 2. 治理与安全（Governance & Security）
- **全局宪法**（`harness/constitution.py`）注入每个 Agent 的 System Prompt 并在输出后校验：
  - 禁止虚构简历中不存在的事实；缺失事实（GPA/日期/数据）只标记待确认，AI 不得补全；
  - AI 修改必须逐条经用户确认后才写入新版本（原版保留）；
  - 诊断问题 ≤12 条且带原文证据；推断内容须标注来源。
- **闭环流程强制**：Agent 必须按 `草稿 → 配置 → 审查 → 启用` 流转，仅 enabled 可被调度；非法流转由后端拒绝（`CLOSED_LOOP_VIOLATION`）。
- **工具白名单**：每个 Agent 声明可挂载工具，调用经 `ToolGuard` 校验，未授权直接拒绝并记审计。
- **密钥安全**：LLM API Key 经 Fernet 加密入库（模型管理页仅显示掩码），日志脱敏；入站请求 PII/提示注入扫描。

### 3. 验证与质量（Validation & Quality）
- **生成/评估分离**：业务 Agent 输出先经独立 `reviewer` Agent 评审（fact_accuracy / relevance / actionability / clarity / constitution 五维评分），达到阈值才返回；
- **质量门禁决策**：`pass`（通过）/ `retry`（重试）/ `degrade`（降级展示）/ `reject`（拒绝，不落地）；宪法级违规直接拒绝；
- **结构化输出**：所有 Agent 输出经 Pydantic schema 校验（如诊断 ≤12 条、优化建议逐条可编辑）。

## 快速启动

```bash
# 1. 准备环境变量
cp .env.example .env        # 按需修改（MinIO/数据库凭据）

# 2. 拉起基础设施（PostgreSQL+pgvector / Redis / MinIO）
docker compose up -d postgres redis minio

# 3. 后端（开发模式）
cd backend
uv sync
uv run alembic upgrade head          # 建表 + vector 扩展 + HNSW/trgm 索引
uv run uvicorn app.main:app --port 8000

# 4. 前端（开发模式）
cd ../frontend
npm install
npm run dev                          # http://localhost:3000
```

**全栈一键启动**（含后端/前端容器镜像构建，后端容器内自动执行迁移）：

```bash
docker compose up -d --build
```

## 使用流程

1. **模型管理**：配置 LLM 供应商（chat / embedding 两类，OpenAI 兼容 BaseURL / Key），连接测试通过后设为默认；
2. **知识库**：创建知识库（可选切块策略与 embedding 模型）→ 上传公司资料/面试真题（自动切块向量化）→ 检索测试验证召回；
3. **Agent 控制台**：对内置 Agent 依次执行 配置 → 审查 → 启用（闭环强制），可挂载 http/mcp 自定义工具；
4. **简历库**：创建简历 → JadeAI 编辑器排版（50 套模板/主题色/密度/自定义 CSS）→ AI 诊断（只读）→ 勾选问题与优化方向 → 逐条确认建议 → 生成独立优化版本（原版保留）→ 导出 HTML/Word；
5. **JD 匹配**：粘贴 JD → 选择简历版本 → 逐条要求匹配诊断 + 措辞重排建议（不虚构经历）；
6. **面试刷题**：基于简历+JD 出题 → 逐题作答 → reviewer 独立复盘；或进入「模拟面试」与 interview-coach 交互；
7. **系统监控 / 链路追踪**：随时查看基础设施健康与 Token 消耗，回放任意 Agent 运行事件定位问题。

## 测试

```bash
cd backend
uv sync --group dev
uv run pytest tests -v          # 需中间件已启动（使用 careerkit_test 测试库）
```

46 个测试用例，覆盖：宪法规则校验（虚构检测）、ToolGuard 白名单、ClosedLoop 状态机非法流转、QualityGate 四类决策、闭环 API 生命周期、简历/知识库 CRUD、Harness 诊断管道（mock LLM 下 run/trace 落库与宪法拒绝路径）。

## 目录结构

```
CareerkitAgent/
├── docker-compose.yml  .env.example  README.md
├── backend/
│   ├── pyproject.toml (uv)  alembic/
│   ├── app/
│   │   ├── main.py  config.py
│   │   ├── core/            # 中间件(追踪/审计/净化) 异常 依赖
│   │   ├── harness/         # constitution closed_loop hooks tool_guard quality_gate
│   │   ├── agents/          # registry runtime tools strategies/(simple_chat react plan_execute workbench) business/
│   │   ├── api/routes/      # resume jd interview agents knowledge models tools monitor dashboard
│   │   ├── schemas/         # Pydantic 结构化输出模型
│   │   ├── models/          # SQLAlchemy ORM（pgvector 向量列）
│   │   ├── services/        # memory retriever embedding export storage crypto settings_store
│   │   └── observability/   # tracing
│   └── tests/               # harness/ api/
└── frontend/
    └── src/
        ├── app/             # (dashboard) resume/(JadeAI编辑器) jd-match/ interview/ agents/
        │                    # models/ knowledge/ tools/ monitor/ traces/
        ├── components/      # Sidebar jadeai/(编辑器/预览模板/ui)
        ├── lib/             # API 客户端 常量 模板标签
        └── types/
```

## 假设与边界（MVP）

- 单用户自部署（无认证/多租户），LLM 密钥存模型管理页（Fernet 加密）；
- LLM 与 Embedding 均走 OpenAI 兼容接口（Embedding 维度由所选模型决定，知识库可指定 embedding 模型）；
- 知识库上传目前支持 txt/md 文本格式；
- 不含：申请跟踪看板、求职信生成、多用户协作。
