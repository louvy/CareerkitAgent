"""API 集成测试：闭环状态机、CRUD、Harness 诊断管道（mock LLM）。"""

from app.schemas.agent import ReviewVerdictModel
from app.schemas.resume import ResumeDiagnosis

# ---------- 工具函数 ----------


def _find_agent(client, name: str) -> dict:
    agents = client.get("/api/agents").json()
    return next(a for a in agents if a["name"] == name)


def _enable_agent(client, agent: dict) -> dict:
    """走完整闭环：draft -> configured -> reviewed -> enabled。"""
    r = client.put(f"/api/agents/{agent['id']}/config", json={"model": "gpt-4o-mini", "temperature": 0.2})
    assert r.status_code == 200
    r = client.post(f"/api/agents/{agent['id']}/review")
    assert r.status_code == 200
    r = client.post(f"/api/agents/{agent['id']}/enable")
    assert r.status_code == 200
    return r.json()


def _create_resume(client) -> tuple[int, int]:
    r = client.post("/api/resumes", json={"name": "张三 - 后端工程师"})
    resume_id = r.json()["id"]
    versions = client.get(f"/api/resumes/{resume_id}").json()["versions"]
    return resume_id, versions[0]["id"]


# ---------- 闭环状态机 ----------


class TestClosedLoopApi:
    def test_builtin_agents_seeded(self, client):
        agents = client.get("/api/agents").json()
        names = {a["name"] for a in agents}
        assert names == {
            "orchestrator", "resume-analyzer", "resume-optimizer", "jd-matcher",
            "interview-generator", "interview-coach", "reviewer",
        }
        assert all(a["status"] == "draft" for a in agents)

    def test_full_lifecycle(self, client):
        agent = _find_agent(client, "resume-analyzer")
        assert agent["status"] == "draft"

        cfg = client.put(f"/api/agents/{agent['id']}/config", json={"model": "gpt-4o-mini"}).json()
        assert cfg["status"] == "configured"

        reviewed = client.post(f"/api/agents/{agent['id']}/review").json()
        assert reviewed["status"] == "reviewed"

        enabled = client.post(f"/api/agents/{agent['id']}/enable").json()
        assert enabled["status"] == "enabled"

        disabled = client.post(f"/api/agents/{agent['id']}/disable").json()
        assert disabled["status"] == "disabled"

    def test_illegal_transition_rejected(self, client):
        agent = _find_agent(client, "resume-analyzer")
        # 草稿直接启用：非法
        r = client.post(f"/api/agents/{agent['id']}/enable")
        assert r.status_code == 409
        assert r.json()["code"] == "CLOSED_LOOP_VIOLATION"

        # 配置后跳过审查直接启用：非法
        client.put(f"/api/agents/{agent['id']}/config", json={})
        r = client.post(f"/api/agents/{agent['id']}/enable")
        assert r.status_code == 409

    def test_draft_agent_not_runnable(self, client):
        agent = _find_agent(client, "resume-analyzer")
        r = client.post(f"/api/agents/{agent['id']}/run", json={"user_input": "hi"})
        assert r.status_code == 409

    def test_reconfigure_after_enable(self, client):
        """回归：启用后仍可保存配置（状态回 configured，须重新审查启用）。"""
        agent = _find_agent(client, "resume-analyzer")
        _enable_agent(client, agent)
        # 启用状态下保存配置：合法，状态回到 configured
        r = client.put(f"/api/agents/{agent['id']}/config", json={"model": "GLM-4.5-Air"})
        assert r.status_code == 200
        assert r.json()["status"] == "configured"
        assert r.json()["config"]["model"] == "GLM-4.5-Air"
        # 配置变更后治理仍生效：不可直接运行，须重新审查 → 启用
        assert client.post(f"/api/agents/{agent['id']}/run", json={"user_input": "hi"}).status_code == 409
        client.post(f"/api/agents/{agent['id']}/review")
        assert client.post(f"/api/agents/{agent['id']}/enable").json()["status"] == "enabled"

    def test_configured_self_resave(self, client):
        """回归：已配置状态可重复保存配置（configured 自环）。"""
        agent = _find_agent(client, "jd-matcher")
        client.put(f"/api/agents/{agent['id']}/config", json={"model": "m1"})
        r = client.put(f"/api/agents/{agent['id']}/config", json={"model": "m2"})
        assert r.status_code == 200
        assert r.json()["status"] == "configured"
        assert r.json()["config"]["model"] == "m2"


# ---------- 简历 CRUD ----------


class TestResumeApi:
    def test_create_and_list(self, client):
        r = client.post("/api/resumes", json={"name": "张三 - 后端工程师"})
        assert r.status_code == 200
        resume_id = r.json()["id"]

        items = client.get("/api/resumes").json()
        assert len(items) == 1
        assert items[0]["name"] == "张三 - 后端工程师"
        assert len(items[0]["versions"]) == 1

        detail = client.get(f"/api/resumes/{resume_id}").json()
        assert detail["versions"][0]["content"] == {}

    def test_create_version_copies_content(self, client):
        resume_id, version_id = _create_resume(client)
        content = {"info": {"name": "张三"}, "sections": [{"title": "项目经历", "items": ["XX 系统"]}]}
        client.put(f"/api/resume-versions/{version_id}", json={"content": content})

        r = client.post(f"/api/resumes/{resume_id}/versions", json={"label": "副本"})
        new_id = r.json()["id"]
        detail = client.get(f"/api/resumes/{resume_id}").json()
        new_version = next(v for v in detail["versions"] if v["id"] == new_id)
        assert new_version["content"]["sections"][0]["items"] == ["XX 系统"]

    def test_apply_suggestions_keeps_original(self, client):
        _, version_id = _create_resume(client)
        r = client.post(
            f"/api/resume-versions/{version_id}/apply-suggestions",
            json={"label": "AI 优化版", "version_type": "ai_optimized", "sections": {"项目经历": ["新内容"]}},
        )
        assert r.status_code == 200
        detail = client.get("/api/resumes").json()[0]
        labels = [v["label"] for v in detail["versions"]]
        assert labels == ["主版本", "AI 优化版"]  # 原版保留

    def test_export_requires_minio(self, client):
        _, version_id = _create_resume(client)
        r = client.get(f"/api/resume-versions/{version_id}/export")
        assert r.status_code == 200
        assert "object" in r.json()


# ---------- 知识库 ----------


class TestKnowledgeApi:
    def test_create_and_delete(self, client):
        r = client.post("/api/knowledge-bases", json={"name": "面试真题库", "description": "真题"})
        kb_id = r.json()["id"]
        items = client.get("/api/knowledge-bases").json()
        assert items[0]["name"] == "面试真题库"
        assert client.delete(f"/api/knowledge-bases/{kb_id}").status_code == 200

    def test_upload_splits_and_indexes(self, client, monkeypatch):
        """mock embedding 后走完整上传管道：分片 + 向量入库。"""

        def fake_embed_texts(texts, embedding_model_id=None):
            return [[0.0] * 1536 for _ in texts]

        monkeypatch.setattr("app.api.routes.knowledge.embed_texts", fake_embed_texts)
        kb_id = client.post("/api/knowledge-bases", json={"name": "资料库"}).json()["id"]

        doc = ("第一章 背景介绍\n" + "这是一段很长的测试内容。" * 300)  # 超 800 字符触发多分片
        r = client.post(
            f"/api/knowledge-bases/{kb_id}/upload",
            files={"files": ("doc.txt", doc.encode("utf-8"), "text/plain")},
        )
        assert r.status_code == 200
        result = r.json()["results"][0]
        assert result["chunks"] > 1
        assert result["message"] == "已入库"

        items = client.get("/api/knowledge-bases").json()
        assert items[0]["chunk_count"] == result["chunks"]


# ---------- Harness 诊断管道（mock LLM） ----------


class TestDiagnosePipeline:
    def test_diagnose_full_pipeline(self, client, monkeypatch):
        """诊断 → 宪法校验 → 评审（mock）→ 门禁通过 → run/trace 落库。"""

        def fake_chat_json(system, user, model, **kwargs):
            return ResumeDiagnosis(
                overview="整体结构清晰，项目经历突出。",
                strengths=["技术栈匹配度高", "项目描述具体"],
                issues=[
                    {
                        "section": "项目经历",
                        "title": "结果量化不足",
                        "detail": "项目描述缺少量化结果。",
                        "evidence": "负责 XX 系统研发。",
                        "suggestion": "补充上线后的性能数据。",
                    }
                ],
                missing_facts=["GPA", "项目时间"],
            )

        def fake_run_review(output, task, source, ctx, guard):
            return ReviewVerdictModel(
                score=8.5,
                dimensions={"fact_accuracy": 9.0, "relevance": 8.0, "actionability": 8.0, "clarity": 9.0, "constitution": 9.0},
                strengths=["证据充分"],
                issues=[],
                suggestions=[],
            )

        monkeypatch.setattr("app.agents.business.resume.chat_json", fake_chat_json)
        monkeypatch.setattr("app.agents.runtime.run_review", fake_run_review)

        # 启用 resume-analyzer（闭环）
        agent = _find_agent(client, "resume-analyzer")
        _enable_agent(client, agent)

        _, version_id = _create_resume(client)
        r = client.post(f"/api/resume-versions/{version_id}/diagnose", json={})
        assert r.status_code == 200
        body = r.json()
        assert body["decision"] == "pass"
        assert body["run_id"]
        assert body["review"]["score"] == 8.5
        assert body["diagnosis"]["overview"]
        assert len(body["diagnosis"]["issues"]) == 1
        assert body["diagnosis"]["missing_facts"] == ["GPA", "项目时间"]

        # 可观测性：run + trace 落库
        runs = client.get("/api/agent-runs").json()
        assert len(runs) == 1
        assert runs[0]["status"] == "success"
        trace = client.get(f"/api/agent-runs/{body['run_id']}/trace").json()
        assert trace["agent_name"] == "resume-analyzer"
        assert "final_output" in trace["trace"]

    def test_diagnose_rejected_by_constitution(self, client, monkeypatch):
        """宪法级违规（虚构事实）→ REJECT → 不落地。"""

        def fake_chat_json(system, user, model, **kwargs):
            return ResumeDiagnosis(
                overview="诊断概览",
                strengths=["优势"],
                issues=[],
            )

        monkeypatch.setattr("app.agents.business.resume.chat_json", fake_chat_json)

        agent = _find_agent(client, "resume-analyzer")
        _enable_agent(client, agent)
        _, version_id = _create_resume(client)

        # 让宪法校验命中虚构违规（runtime 命名空间绑定的函数）
        def fake_check(text, **kwargs):
            from app.harness.constitution import ConstitutionViolation

            return [ConstitutionViolation("FACT_NO_FABRICATION", "虚构", severity="error")]

        monkeypatch.setattr("app.agents.runtime.run_constitution_check", fake_check)
        r = client.post(f"/api/resume-versions/{version_id}/diagnose", json={})
        assert r.status_code == 409
        runs = client.get("/api/agent-runs").json()
        assert runs and runs[0]["status"] == "rejected"

# ---------- 模型管理 ----------


class TestModelApi:
    def _create(self, client, category="chat", **kw):
        payload = {"name": "测试模型", "category": category, "model": "test-model", "base_url": "https://example.com/v1", "api_key": "sk-test-1234", **kw}
        return client.post("/api/models", json=payload)

    def test_crud_and_default(self, client):
        r = self._create(client, is_default=True)
        assert r.status_code == 200
        mid = r.json()["id"]
        assert r.json()["category"] == "chat"
        assert r.json()["is_default"] is True
        assert r.json()["api_key_masked"] == "sk-tes****1234"
        # 第二个默认会顶掉第一个
        r2 = self._create(client, name="另一个", is_default=True)
        assert r2.json()["is_default"] is True
        first = client.get("/api/models").json()
        assert next(x for x in first if x["id"] == mid)["is_default"] is False
        # 默认模型不可删除
        r3 = client.delete(f"/api/models/{r2.json()['id']}")
        assert r3.status_code == 409
        # 更新 + 删除
        r4 = client.put(f"/api/models/{r2.json()['id']}", json={"name": "改名", "category": "chat", "model": "test-model", "is_default": False})
        assert r4.json()["name"] == "改名"
        assert client.delete(f"/api/models/{r2.json()['id']}").status_code == 200
        # 分类过滤
        self._create(client, category="embedding", model="emb-model", api_key="")
        cats = client.get("/api/models", params={"category": "embedding"}).json()
        assert all(x["category"] == "embedding" for x in cats)

    def test_connect_test(self, client, monkeypatch):
        r = self._create(client, api_key="")
        assert r.json()["has_api_key"] is False
        mid = r.json()["id"]
        res = client.post(f"/api/models/{mid}/test").json()
        assert res["ok"] is False and "API Key" in res["error"]

    def test_invalid_category(self, client):
        assert client.post("/api/models", json={"name": "x", "category": "vision", "model": "m"}).status_code == 422


# ---------- 工具库 ----------


class TestToolApi:
    def test_crud_with_validation(self, client):
        # http 工具
        r = client.post("/api/tools", json={"name": "fetch_job_site", "category": "http", "description": "抓取职位页", "config": {"method": "GET", "url": "https://example.com/jobs", "headers": {"Authorization": "Bearer x"}}})
        assert r.status_code == 200
        tid = r.json()["id"]
        # 非法 method
        assert client.post("/api/tools", json={"name": "bad", "category": "http", "config": {"method": "TRACE", "url": "https://example.com"}}).status_code == 422
        # 重名
        assert client.post("/api/tools", json={"name": "fetch_job_site", "category": "http", "config": {"method": "GET", "url": "https://a.com"}}).status_code == 409
        # mcp 工具
        r2 = client.post("/api/tools", json={"name": "local_db", "category": "mcp", "config": {"command": "npx", "args": ["-y", "mcp-server"]}})
        assert r2.status_code == 200
        # mcp 缺 command
        assert client.post("/api/tools", json={"name": "bad_mcp", "category": "mcp", "config": {}}).status_code == 422
        # 列表过滤
        items = client.get("/api/tools", params={"category": "mcp"}).json()
        assert len(items) == 1 and items[0]["name"] == "local_db"
        # 更新 + 删除
        r3 = client.put(f"/api/tools/{tid}", json={"name": "fetch_job_site2", "category": "http", "config": {"method": "POST", "url": "https://example.com/submit"}})
        assert r3.json()["config"]["method"] == "POST"
        assert client.delete(f"/api/tools/{tid}").status_code == 200


# ---------- 知识库切块预览 ----------


class TestChunkPreview:
    def test_preview(self, client):
        doc = ("第一章 背景\n" + "这是很长的测试内容。" * 200)
        r = client.post("/api/knowledge-bases/preview-chunks", json={"text": doc, "chunk_strategy": "auto", "chunk_size": 200, "chunk_overlap": 20})
        assert r.status_code == 200
        body = r.json()
        assert body["count"] > 1
        assert all(0 < len(c) <= 200 for c in body["chunks"])
        # 覆盖必须小于等于 chunk_size
        assert client.post("/api/knowledge-bases/preview-chunks", json={"text": "x" * 100, "chunk_size": 100, "chunk_overlap": 500}).status_code == 422

    def test_kb_config_roundtrip(self, client):
        r = client.post("/api/knowledge-bases", json={"name": "配置库", "chunk_strategy": "fixed", "chunk_size": 500, "chunk_overlap": 50})
        kb_id = r.json()["id"]
        items = client.get("/api/knowledge-bases").json()
        kb = next(x for x in items if x["id"] == kb_id)
        assert kb["chunk_strategy"] == "fixed" and kb["chunk_size"] == 500 and kb["chunk_overlap"] == 50
        r2 = client.put(f"/api/knowledge-bases/{kb_id}", json={"name": "配置库2", "chunk_size": 600})
        assert r2.json()["chunk_size"] == 600


# ---------- 系统监控 ----------


class TestMonitorApi:
    def test_system_status(self, client):
        body = client.get("/api/monitor/system").json()
        assert body["postgres"]["ok"] is True
        assert body["postgres"]["pgvector"] is True
        assert body["redis"]["ok"] is True
        assert body["minio"]["ok"] is True

    def test_token_stats(self, client):
        body = client.get("/api/monitor/tokens", params={"days": 7}).json()
        assert body["items"]
        assert {"date", "user_tokens", "agent_tokens", "runs"} <= set(body["items"][0])


# ---------- 链路追踪列表（call_type） ----------


class TestTraceList:
    def test_run_call_type(self, client, monkeypatch):
        from app.agents.business.resume import ResumeDiagnosis
        from app.schemas.agent import ReviewVerdictModel

        def fake_chat_json(system, user, model, **kwargs):
            return ResumeDiagnosis(overview="o", strengths=["s"], issues=[])

        def fake_run_review(output, task, source, ctx, guard):
            return ReviewVerdictModel(
                score=8.0,
                dimensions={"fact_accuracy": 8.0, "relevance": 8.0, "actionability": 8.0, "clarity": 8.0, "constitution": 8.0},
                strengths=["s"],
                issues=[],
                suggestions=[],
            )

        monkeypatch.setattr("app.agents.business.resume.chat_json", fake_chat_json)
        monkeypatch.setattr("app.agents.runtime.run_review", fake_run_review)
        from tests.api.test_api_flow import _find_agent, _enable_agent

        agent = _find_agent(client, "resume-analyzer")
        _enable_agent(client, agent)
        _, version_id = _create_resume(client)
        r = client.post(f"/api/resume-versions/{version_id}/diagnose", json={})
        assert r.status_code == 200
        runs = client.get("/api/agent-runs").json()
        assert runs[0]["call_type"] == "invoke"
        assert runs[0]["agent_name"] == "resume-analyzer"


# ---------- ReAct 协议 Prompt 格式化回归 ----------


def test_react_protocol_prompt_formats():
    """回归：_PROTOCOL_PROMPT 内 JSON 示例花括号必须转义，否则 .format() 抛 KeyError。"""
    from app.agents.strategies.react import _PROTOCOL_PROMPT

    rendered = _PROTOCOL_PROMPT.format(max_iter=6)
    assert '{"action": "tool_call"' in rendered
    assert "6 次" in rendered


def test_react_strategy_emits_node_events(monkeypatch):
    """回归：策略图节点必须埋 node_start/node_end 事件（链路追踪时间线）。"""
    from app.agents.strategies.react import ReActStrategy
    from app.harness.hooks import RunContext
    from app.harness.tool_guard import ToolGuard

    calls: dict = {"n": 0}

    def fake_chat_text(system, user, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return '{"action": "tool_call", "tool": "some_tool", "args": {"q": 1}}'
        return '{"action": "final", "answer": "ok"}'

    monkeypatch.setattr("app.agents.strategies.react.chat_text", fake_chat_text)
    ctx = RunContext(run_id="t1", agent_name="test", strategy="react")
    result = ReActStrategy().run(
        system_prompt="sp",
        user_input="hi",
        context={},
        ctx=ctx,
        guard=ToolGuard("test", []),
    )
    kinds = [e["kind"] for e in ctx.trace.events]
    assert "node_start" in kinds
    assert "node_end" in kinds
    assert any(e["kind"] == "tool_call" for e in ctx.trace.events)
    assert result["output"] == "ok"

