// 与后端 Pydantic 模型对齐的类型定义

export interface ResumeVersionSummary {
  id: number;
  label: string;
  version_type: string;
  created_at: string;
}

export interface ResumeItem {
  id: number;
  name: string;
  updated_at: string;
  versions: ResumeVersionSummary[];
}

export interface ResumeVersion {
  id: number;
  resume_id: number;
  label: string;
  version_type: string;
  content: ResumeContent;
  notes?: string;
  created_at: string;
}

export interface ResumeContent {
  info?: { name?: string; title?: string; contact?: string; [k: string]: unknown };
  sections?: ResumeSection[];
  /** 模板 id（classic / modern / sidebar / timeline / minimal / nordic / creative / ats） */
  template?: string;
  /** 主题色（#RRGGBB），可任意自定义 */
  theme?: string;
  /** 排版密度：compact / standard / relaxed */
  density?: string;
  /** 自定义 CSS（作用于预览根节点 #resume-preview-root） */
  custom_css?: string;
  /** JadeAI 编辑器结构化数据（sections/themeConfig/template），与 sections 并存 */
  jade?: unknown;
}

export interface ResumeSection {
  title: string;
  items: (Record<string, string> | string)[];
}

export interface DiagnosisIssue {
  section: string;
  title: string;
  detail: string;
  evidence: string;
  suggestion: string;
}

export interface Diagnosis {
  overview: string;
  strengths: string[];
  issues: DiagnosisIssue[];
  missing_facts: string[];
}

export interface SectionSuggestion {
  section: string;
  original: string;
  suggestion: string;
  reason: string;
  is_inference: boolean;
}

export interface OptimizationSuggestions {
  summary: string;
  suggestions: SectionSuggestion[];
  notes: string[];
}

export interface JDItem {
  id: number;
  company: string;
  title: string;
  content: string;
  created_at: string;
}

export interface RequirementEvidence {
  requirement: string;
  evidence: string;
  score: number;
  gap: string;
}

export interface JDMatchResult {
  overall_score: number;
  summary: string;
  per_requirement: RequirementEvidence[];
  reorder: string[];
  wording: string[];
  matched_strengths: string[];
  missing_facts: string[];
}

export interface InterviewQuestionItem {
  id: number;
  order_no: number;
  category: string;
  question: string;
  intent: string;
  reference_points: string[];
  answer?: string;
}

export interface InterviewSessionItem {
  id: number;
  title: string;
  status: string;
  created_at: string;
  question_count: number;
}

export interface InterviewSessionDetail extends InterviewSessionItem {
  resume_version_id?: number;
  jd_id?: number;
  questions: InterviewQuestionItem[];
  review?: { id: number; report: unknown; gate: unknown };
}

export interface AgentItem {
  id: number;
  name: string;
  display_name: string;
  description: string;
  strategy: string;
  is_builtin: boolean;
  status: string;
  config: Record<string, unknown>;
  knowledge_base_ids: number[];
  updated_at: string;
}

export interface AgentRun {
  id: number;
  run_id: string;
  agent_id: number;
  agent_name: string;
  call_type: string;
  status: string;
  input_summary: string;
  output_summary: string;
  stats: { elapsed_ms: number; token_input: number; token_output: number; llm_calls: number; tool_calls: unknown[] };
  gate: Record<string, unknown>;
  error?: string;
  created_at: string;
}

export interface KnowledgeBaseItem {
  id: number;
  name: string;
  description: string;
  chunk_strategy: string;
  chunk_size: number;
  chunk_overlap: number;
  embedding_model_id: number | null;
  chunk_count: number;
  created_at: string;
}

// 模型管理
export interface LLMModelItem {
  id: number;
  name: string;
  category: string;
  model: string;
  base_url: string;
  api_key_masked: string;
  has_api_key: boolean;
  description: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelTestResult {
  ok: boolean;
  reply?: string;
  error?: string;
  dim?: number;
}

// 工具库
export interface ToolItem {
  id: number;
  name: string;
  category: string;
  description: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// 系统监控
export interface InfraStatus {
  ok: boolean;
  version?: string;
  tables?: number;
  pgvector?: boolean;
  pg_trgm?: boolean;
  keys?: number;
  buckets?: string[];
  error?: string;
}

export interface SystemStatus {
  postgres: InfraStatus;
  redis: InfraStatus;
  minio: InfraStatus;
}

export interface TokenStatItem {
  date: string;
  user_tokens: number;
  agent_tokens: number;
  runs: number;
}

export interface TokenStatsResponse {
  start: string;
  end: string;
  items: TokenStatItem[];
}

// 切块预览
export interface ChunkPreviewResult {
  chunks: string[];
  count: number;
  total_chars: number;
  strategy: string;
  chunk_size: number;
  chunk_overlap: number;
}

// 链路追踪
export interface TraceEvent {
  ts: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface TracePrompt {
  ts: number;
  model: string;
  system: string;
  user: string;
}

export interface TraceSnapshot {
  run_id: string;
  events: TraceEvent[];
  prompts: TracePrompt[];
  final_output: unknown;
}

export interface TraceDetail {
  run_id: string;
  agent_name: string;
  trace: TraceSnapshot;
  created_at: string;
}

export interface DashboardStats {
  resume_count: number;
  jd_count: number;
  match_count: number;
  question_count: number;
  session_count: number;
  review_count: number;
  run_count: number;
}

export interface ReviewInfo {
  score: number;
  dimensions: Record<string, number>;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}
