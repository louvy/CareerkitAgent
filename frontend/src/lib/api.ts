// API 客户端：统一 fetch 封装与错误处理

const BASE = "/api";

// 请求超时（毫秒）：优先读 NEXT_PUBLIC_API_TIMEOUT，构建期由 Dockerfile/compose 注入；默认 120 秒（AI 诊断/优化耗时较长）
const DEFAULT_TIMEOUT = 120_000;
function getRequestTimeout(): number {
  const raw = process.env.NEXT_PUBLIC_API_TIMEOUT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = getRequestTimeout();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    if (!resp.ok) {
      let detail = `请求失败 (${resp.status})`;
      let code = "UNKNOWN";
      try {
        const body = await resp.json();
        detail = body.detail || detail;
        code = body.code || code;
      } catch {
        /* 忽略解析失败 */
      }
      throw new ApiError(detail, code, resp.status);
    }
    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(`请求超时（超过 ${Math.round(timeout / 1000)} 秒），请稍后重试`, "TIMEOUT", 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // 控制中心
  dashboardStats: () => request<import("@/types").DashboardStats>("/dashboard/stats"),

  // 简历
  listResumes: () => request<import("@/types").ResumeItem[]>("/resumes"),
  getResume: (id: number) => request<{ id: number; name: string; versions: import("@/types").ResumeVersion[] }>(`/resumes/${id}`),
  createResume: (payload: { name: string; label?: string; content?: unknown }) =>
    request<{ id: number; name: string }>("/resumes", { method: "POST", body: JSON.stringify(payload) }),
  deleteResume: (id: number) => request(`/resumes/${id}`, { method: "DELETE" }),
  importResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ id: number; version_id: number; name: string }>("/resumes/import", {
      method: "POST",
      body: form,
      headers: {},
    });
  },
  createVersion: (resumeId: number, payload: { label: string; version_type?: string }) =>
    request<{ id: number; label: string }>(`/resumes/${resumeId}/versions`, { method: "POST", body: JSON.stringify(payload) }),
  updateVersion: (versionId: number, payload: Partial<{ label: string; content: unknown; notes: string }>) =>
    request(`/resume-versions/${versionId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteVersion: (versionId: number) => request(`/resume-versions/${versionId}`, { method: "DELETE" }),
  exportVersion: (versionId: number) =>
    request<{ object: string; url: string }>(`/resume-versions/${versionId}/export`),
  diagnose: (versionId: number) =>
    request<{ diagnosis: import("@/types").Diagnosis; run_id?: string; review?: import("@/types").ReviewInfo; decision?: string }>(
      `/resume-versions/${versionId}/diagnose`, { method: "POST", body: JSON.stringify({}) }),
  optimize: (versionId: number, payload: { selected_issues: unknown[]; directions: string[]; extra_instruction: string }) =>
    request<{ suggestions: import("@/types").OptimizationSuggestions; run_id?: string; review?: import("@/types").ReviewInfo; decision?: string }>(
      `/resume-versions/${versionId}/optimize`, { method: "POST", body: JSON.stringify(payload) }),
  applySuggestions: (versionId: number, payload: { label: string; version_type: string; sections: Record<string, unknown[]> }) =>
    request<{ id: number; label: string }>(`/resume-versions/${versionId}/apply-suggestions`, { method: "POST", body: JSON.stringify(payload) }),

  // JD
  listJds: () => request<import("@/types").JDItem[]>("/jds"),
  createJd: (payload: { company: string; title: string; content: string }) =>
    request<{ id: number }>("/jds", { method: "POST", body: JSON.stringify(payload) }),
  deleteJd: (id: number) => request(`/jds/${id}`, { method: "DELETE" }),
  runMatch: (jdId: number, resumeVersionId: number) =>
    request<{ id: number; result: import("@/types").JDMatchResult; review?: import("@/types").ReviewInfo; decision?: string }>(
      `/jds/${jdId}/match`, { method: "POST", body: JSON.stringify({ resume_version_id: resumeVersionId }) }),

  // 面试
  listSessions: () => request<import("@/types").InterviewSessionItem[]>("/interview-sessions"),
  getSession: (id: number) => request<import("@/types").InterviewSessionDetail>(`/interview-sessions/${id}`),
  createSession: (payload: { title: string; resume_version_id: number; jd_id?: number | null }) =>
    request<{ id: number; profile: unknown }>("/interview-sessions", { method: "POST", body: JSON.stringify(payload) }),
  saveAnswer: (questionId: number, content: string) =>
    request(`/interview-questions/${questionId}/answer`, { method: "PUT", body: JSON.stringify({ content }) }),
  reviewSession: (sessionId: number) =>
    request<{ id: number; report: unknown }>(`/interview-sessions/${sessionId}/review`, { method: "POST", body: JSON.stringify({}) }),
  coachTurn: (sessionId: number, message: string) =>
    request<{ reply: string }>(`/interview-sessions/${sessionId}/coach`, { method: "POST", body: JSON.stringify({ message }) }),

  // Agent
  listAgents: () => request<import("@/types").AgentItem[]>("/agents"),
  listAgentTools: () => request<{ tools: string[] }>("/agents/tools"),
  configureAgent: (agentId: number, payload: Record<string, unknown>) =>
    request<import("@/types").AgentItem>(`/agents/${agentId}/config`, { method: "PUT", body: JSON.stringify(payload) }),
  reviewAgent: (agentId: number) => request<import("@/types").AgentItem>(`/agents/${agentId}/review`, { method: "POST" }),
  enableAgent: (agentId: number) => request<import("@/types").AgentItem>(`/agents/${agentId}/enable`, { method: "POST" }),
  disableAgent: (agentId: number) => request<import("@/types").AgentItem>(`/agents/${agentId}/disable`, { method: "POST" }),
  listRuns: (agentId?: number) =>
    request<import("@/types").AgentRun[]>(`/agent-runs${agentId ? `?agent_id=${agentId}` : ""}`),
  getTrace: (runId: string) => request<import("@/types").TraceDetail>(`/agent-runs/${runId}/trace`),
  runAgent: (agentId: number, payload: { user_input: string; context?: Record<string, unknown>; call_type?: string }) =>
    request<Record<string, unknown>>(`/agents/${agentId}/run`, { method: "POST", body: JSON.stringify(payload) }),

  // 知识库
  listKbs: () => request<import("@/types").KnowledgeBaseItem[]>("/knowledge-bases"),
  createKb: (payload: {
    name: string;
    description?: string;
    chunk_strategy?: string;
    chunk_size?: number;
    chunk_overlap?: number;
    embedding_model_id?: number | null;
  }) =>
    request<{ id: number; name: string }>("/knowledge-bases", { method: "POST", body: JSON.stringify(payload) }),
  updateKb: (
    kbId: number,
    payload: {
      name: string;
      description?: string;
      chunk_strategy?: string;
      chunk_size?: number;
      chunk_overlap?: number;
      embedding_model_id?: number | null;
    },
  ) =>
    request<import("@/types").KnowledgeBaseItem>(`/knowledge-bases/${kbId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteKb: (id: number) => request(`/knowledge-bases/${id}`, { method: "DELETE" }),
  previewChunks: (payload: { text: string; chunk_strategy: string; chunk_size: number; chunk_overlap: number }) =>
    request<import("@/types").ChunkPreviewResult>("/knowledge-bases/preview-chunks", { method: "POST", body: JSON.stringify(payload) }),
  uploadDocs: (kbId: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request<{ results: unknown[] }>(`/knowledge-bases/${kbId}/upload`, { method: "POST", body: form, headers: {} });
  },

  // 模型管理
  listModels: (category?: string) =>
    request<import("@/types").LLMModelItem[]>(`/models${category ? `?category=${category}` : ""}`),
  createModel: (payload: {
    name: string;
    category: string;
    model: string;
    base_url?: string;
    api_key?: string;
    description?: string;
    is_default?: boolean;
  }) => request<import("@/types").LLMModelItem>("/models", { method: "POST", body: JSON.stringify(payload) }),
  updateModel: (
    modelId: number,
    payload: {
      name: string;
      category: string;
      model: string;
      base_url?: string;
      api_key?: string;
      description?: string;
      is_default?: boolean;
    },
  ) =>
    request<import("@/types").LLMModelItem>(`/models/${modelId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteModel: (modelId: number) => request(`/models/${modelId}`, { method: "DELETE" }),
  setDefaultModel: (modelId: number) =>
    request<import("@/types").LLMModelItem>(`/models/${modelId}/set-default`, { method: "POST" }),
  testModel: (modelId: number) =>
    request<import("@/types").ModelTestResult>(`/models/${modelId}/test`, { method: "POST" }),

  // 工具库
  listToolLibrary: (category?: string) =>
    request<import("@/types").ToolItem[]>(`/tools${category ? `?category=${category}` : ""}`),
  createTool: (payload: { name: string; category: string; description?: string; config: Record<string, unknown> }) =>
    request<import("@/types").ToolItem>("/tools", { method: "POST", body: JSON.stringify(payload) }),
  updateTool: (toolId: number, payload: { name: string; category: string; description?: string; config: Record<string, unknown> }) =>
    request<import("@/types").ToolItem>(`/tools/${toolId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTool: (toolId: number) => request(`/tools/${toolId}`, { method: "DELETE" }),

  // 系统监控
  monitorSystem: () => request<import("@/types").SystemStatus>("/monitor/system"),
  tokenStats: (start?: string, end?: string, days?: number) => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (days) params.set("days", String(days));
    const qs = params.toString();
    return request<import("@/types").TokenStatsResponse>(`/monitor/tokens${qs ? `?${qs}` : ""}`);
  },
};
