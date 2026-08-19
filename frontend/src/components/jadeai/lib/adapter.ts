/**
 * JadeAI Resume(结构化) ↔ 后端 ResumeContent 转换。
 *
 * 保存策略：完整结构化数据写入 content.jade；同时把 sections 序列化为旧版
 * {title, items} 格式写入 content.sections —— 后端 AI 工具(JD 匹配/面试/诊断)
 * 依赖 version.plain_text(读取 sections) 提取简历文本，该写回不能省略。
 * 模板 id：content.template 存 `jadeai-` 前缀区分。
 * 加载策略：只读 content.jade；无 jade 数据视为新建(空简历)，不做旧数据兼容。
 */
import type {
  Resume,
  ResumeSection,
  SectionContent,
  ThemeConfig,
} from '@/types/resume';
import { SECTION_TYPES, type SectionType } from '@/lib/constants';
import type { ResumeContent } from '@/types';

export const JADE_TEMPLATE_PREFIX = 'jadeai-';

/** 把 LLM/导入可能返回的中文或别名 type 归一化为前端 SectionType */
function normalizeSectionType(raw: string): SectionType {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  const aliasMap: Record<string, SectionType> = {
    // 中文（按简历习惯）
    基本信息: 'personal_info',
    个人信息: 'personal_info',
    个人资料: 'personal_info',
    教育经历: 'education',
    教育背景: 'education',
    学历: 'education',
    工作经历: 'work_experience',
    工作经验: 'work_experience',
    工作: 'work_experience',
    项目经历: 'projects',
    项目经验: 'projects',
    项目: 'projects',
    技能: 'skills',
    技术栈: 'skills',
    专业技能: 'skills',
    证书: 'certifications',
    资格证书: 'certifications',
    语言: 'languages',
    语言能力: 'languages',
    自我评价: 'summary',
    个人简介: 'summary',
    自我介绍: 'summary',
    其他: 'custom',
    附加: 'custom',
    // 英文别名
    basics: 'personal_info',
    personal: 'personal_info',
    info: 'personal_info',
    profile: 'personal_info',
    experience: 'work_experience',
    work: 'work_experience',
    job: 'work_experience',
    project: 'projects',
    skill: 'skills',
    certification: 'certifications',
    language: 'languages',
    summary: 'summary',
    github: 'github',
    qr_code: 'qr_codes',
    custom: 'custom',
  };
  const mapped = aliasMap[t];
  if (mapped) return mapped;
  if ((SECTION_TYPES as readonly string[]).includes(t)) return t as SectionType;
  return 'custom';
}

/** 与 theme-editor DEFAULT_THEME 保持一致 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  primaryColor: '#1a1a1a',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontSize: 'medium',
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 16,
  avatarStyle: 'oneInch',
};

// ---------- 结构化 section → 旧版 {title, items}(后端 AI plain_text 依赖) ----------

/** 中文标签 → 结构化字段名(解析导入/建议文本 "字段: 值" 行) */
const FIELD_ALIASES: Record<string, string> = {
  // personal_info
  姓名: 'fullName',
  名字: 'fullName',
  职位: 'jobTitle',
  岗位: 'jobTitle',
  求职意向: 'jobTitle',
  意向岗位: 'jobTitle',
  年龄: 'age',
  年纪: 'age',
  性别: 'gender',
  政治面貌: 'politicalStatus',
  民族: 'ethnicity',
  籍贯: 'hometown',
  户籍: 'hometown',
  婚姻状况: 'maritalStatus',
  婚否: 'maritalStatus',
  工作年限: 'yearsOfExperience',
  工龄: 'yearsOfExperience',
  经验: 'yearsOfExperience',
  最高学历: 'educationLevel',
  学历: 'educationLevel',
  邮箱: 'email',
  邮件: 'email',
  电子邮箱: 'email',
  Email: 'email',
  email: 'email',
  电话: 'phone',
  手机: 'phone',
  联系电话: 'phone',
  手机号码: 'phone',
  TEL: 'phone',
  Tel: 'phone',
  tel: 'phone',
  微信: 'wechat',
  微信号: 'wechat',
  所在地: 'location',
  城市: 'location',
  工作地点: 'location',
  现居地: 'location',
  居住城市: 'location',
  个人网站: 'website',
  主页: 'website',
  博客: 'website',
  linkedin: 'linkedin',
  LinkedIn: 'linkedin',
  领英: 'linkedin',
  github: 'github',
  GitHub: 'github',
  Github: 'github',

  // education
  学校: 'institution',
  院校: 'institution',
  大学: 'institution',
  学院: 'institution',
  学位: 'degree',
  专业: 'field',
  所学专业: 'field',
  院校地点: 'location',
  入学时间: 'startDate',
  开始时间: 'startDate',
  起始时间: 'startDate',
  开始日期: 'startDate',
  毕业时间: 'endDate',
  结束时间: 'endDate',
  截止时间: 'endDate',
  结束日期: 'endDate',
  GPA: 'gpa',
  gpa: 'gpa',
  绩点: 'gpa',
  在校经历: 'highlights',
  校园经历: 'highlights',
  荣誉: 'highlights',
  奖学金: 'highlights',

  // work_experience / projects
  公司: 'company',
  企业: 'company',
  工作单位: 'company',
  任职公司: 'company',
  职务: 'position',
  职位名称: 'position',
  工作内容: 'description',
  工作职责: 'description',
  职责描述: 'description',
  工作描述: 'description',
  项目描述: 'description',
  项目简介: 'description',
  使用技术: 'technologies',
  技术: 'technologies',
  工作业绩: 'highlights',
  项目业绩: 'highlights',
  成就: 'highlights',
  业绩: 'highlights',
  成果: 'highlights',

  // projects
  项目名称: 'name',
  项目名: 'name',
  项目: 'name',
  项目链接: 'url',

  // skills
  技能分类: 'name',
  技能: 'skills',
  技术栈: 'technologies',

  // certifications
  证书名称: 'name',
  证书: 'name',
  证书名: 'name',
  颁发机构: 'issuer',
  发证机构: 'issuer',
  机构: 'issuer',
  获得日期: 'date',
  颁发日期: 'date',
  获得时间: 'date',
  证书链接: 'url',

  // languages
  语言: 'language',
  外语: 'language',
  语种: 'language',
  熟练程度: 'proficiency',
  水平: 'proficiency',
  等级: 'proficiency',

  // common
  描述: 'description',
  亮点: 'highlights',
  链接: 'url',
  URL: 'url',

  // github / qr / custom
  仓库地址: 'repoUrl',
  仓库名称: 'name',
  主要语言: 'language',
  标签: 'label',
  标题: 'title',
  副标题: 'subtitle',
  日期: 'date',
};

const ITEM_LIST_KEYS = new Set(['highlights', 'technologies', 'skills']);

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function itemToLegacyLines(item: Record<string, unknown>): string {
  const lines: string[] = [];
  const labelMap: Record<string, string> = {
    company: '公司',
    position: '职位',
    location: '地点',
    startDate: '开始时间',
    endDate: '结束时间',
    description: '描述',
    institution: '学校',
    degree: '学位',
    field: '专业',
    name: '名称',
    issuer: '颁发机构',
    date: '获得日期',
    language: '语言',
    proficiency: '熟练程度',
    url: '链接',
    repoUrl: '仓库地址',
  };
  Object.entries(item).forEach(([k, v]) => {
    if (k === 'id' || v == null || v === '') return;
    const label = labelMap[k] || k;
    if (Array.isArray(v)) {
      if (v.length > 0) lines.push(`${label}: ${v.join(', ')}`);
    } else if (typeof v === 'boolean') {
      lines.push(`${label}: ${v ? '是' : '否'}`);
    } else {
      lines.push(`${label}: ${v}`);
    }
  });
  return lines.join('\n');
}

function jadeSectionToLegacy(section: ResumeSection): { title: string; items: (Record<string, string> | string)[] } {
  const content = section.content as unknown as Record<string, unknown>;
  if (section.type === 'personal_info') {
    const line: Record<string, string> = {};
    (['fullName', 'jobTitle', 'age', 'gender', 'politicalStatus', 'ethnicity', 'hometown',
      'maritalStatus', 'yearsOfExperience', 'educationLevel', 'email', 'phone', 'wechat',
      'location', 'website'] as const).forEach((k) => {
      const v = content[k];
      if (v != null && v !== '') line[k] = String(v);
    });
    return { title: section.title || '个人信息', items: [line] };
  }
  const items: (Record<string, string> | string)[] = [];
  const arr = Array.isArray(content.items) ? content.items : [];
  arr.forEach((it) => {
    if (it && typeof it === 'object') items.push(itemToLegacyLines(it as Record<string, unknown>));
    else if (typeof it === 'string') items.push(it);
  });
  if (section.type === 'summary') {
    return { title: section.title || '个人简介', items: [String(content.text || '')] };
  }
  if (section.type === 'skills') {
    const cats = Array.isArray(content.categories) ? content.categories : [];
    items.push(...cats.map((c) => {
      const cat = c as { name?: string; skills?: unknown };
      return `${cat.name || ''}${(cat.skills as string[] | undefined)?.length ? `: ${(cat.skills as string[]).join(', ')}` : ''}`;
    }));
  }
  return { title: section.title || '', items };
}

// ---------- 顶层转换 ----------

export function isJadeTemplate(template: string | undefined): boolean {
  return !!template && template.startsWith(JADE_TEMPLATE_PREFIX);
}

/** content.jade → JadeAI Resume(编辑器打开时)；无 jade 数据返回默认空简历 */
export function toJadeResume(content: ResumeContent | undefined | null): Resume {
  const c: ResumeContent = content || {};
  const jade = c.jade as { sections?: ResumeSection[]; themeConfig?: ThemeConfig; template?: string } | undefined;
  const now = new Date();

  let sections: ResumeSection[];
  if (Array.isArray(jade?.sections) && jade.sections.length > 0) {
    // 正常路径：手动保存的简历已写好 jade 结构，直接还原
    sections = jade.sections.map((s) => ({ ...s, content: s.content }));
  } else if (Array.isArray((c as { sections?: unknown[] }).sections) && (c as { sections?: unknown[] }).sections!.length > 0) {
    // 兼容路径：导入接口只写了 legacy sections（{type,title,items:string[]}，无 jade）。
    // 复用现有转换把它映射成 jade 结构，保证编辑器能显示导入内容（不丢文本）。
    const legacy = (c as { sections: { type?: string; title?: string; items?: unknown[] }[] }).sections;
    sections = legacy.map((sec, i) => {
      const type = normalizeSectionType(sec.type || 'custom');
      const items = (sec.items as (string | Record<string, string>)[]) || [];
      // 导入数据多为中文键值文本（如「学校：XX大学」），需要结构化解析为
      // 编辑器组件认识的字段对象（institution/degree/field 等）。
      return {
        id: `s-${i}-${Math.random().toString(36).slice(2, 10)}`,
        resumeId: '',
        type,
        title: sec.title || '',
        sortOrder: i,
        visible: true,
        content: parseImportSectionContent(type, items) as unknown as SectionContent,
        createdAt: now,
        updatedAt: now,
      } satisfies ResumeSection;
    });
  } else {
    sections = [];
  }

  const pi = sections.find((s) => s.type === 'personal_info')?.content as { fullName?: string } | undefined;
  return {
    id: `resume-${Date.now()}`,
    userId: '',
    title: pi?.fullName || '未命名简历',
    template: jade?.template || 'classic',
    themeConfig: jade?.themeConfig || DEFAULT_THEME_CONFIG,
    isDefault: false,
    language: 'zh',
    sections,
    createdAt: now,
    updatedAt: now,
  };
}

/** JadeAI Resume → content(保存时写回后端) */
export function fromJadeResume(resume: Resume | null): ResumeContent {
  const r: Resume = resume || { ...(toJadeResume(null) as Resume) };
  const legacySections = r.sections
    .map((s, i) => ({ ...jadeSectionToLegacy(s), order: i }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest);

  return {
    sections: legacySections,
    template: JADE_TEMPLATE_PREFIX + (r.template || 'classic'),
    jade: {
      sections: r.sections,
      themeConfig: r.themeConfig,
      template: r.template,
    },
  };
}

// ---------- AI 优化建议应用(建议文本 → 结构化，供新版本 jade 写回) ----------

/** AI 优化建议文本 → 旧版 items 数组：键值行合并为对象，"- " 列表行并入 highlights，其余为字符串 */
export function suggestionTextToLegacyItems(text: string): (Record<string, string> | string)[] {
  const items: (Record<string, string> | string)[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*•·]\s?/, '').trim();
    if (!line) {
      cur = null;
      continue;
    }
    const idx = line.search(/[:：]/);
    if (idx > 0) {
      const key = FIELD_ALIASES[line.slice(0, idx).trim()] || line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!cur) {
        cur = {};
        items.push(cur);
      }
      if (ITEM_LIST_KEYS.has(key)) {
        const prev = cur[key];
        cur[key] = prev ? `${prev}, ${val}` : val;
      } else {
        cur[key] = val;
      }
    } else {
      cur = null;
      items.push(line);
    }
  }
  return items;
}

/** 旧版 items → JadeAI 结构化 section content（按 section 类型决定形状） */
export function legacyItemsToContent(type: string, items: (Record<string, string> | string)[]): Record<string, unknown> {
  if (type === 'personal_info') {
    const merged: Record<string, unknown> = {};
    for (const it of items) {
      if (it && typeof it === 'object') Object.assign(merged, it);
    }
    return merged;
  }
  if (type === 'summary') {
    return { text: items.filter((i) => typeof i === 'string').join('\n') };
  }
  if (type === 'skills') {
    const categories = items.map((it, i) => {
      const obj = typeof it === 'object' ? it : { name: it };
      return {
        id: `c-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: obj.name || '',
        skills: splitList(String(obj.skills || '')),
      };
    });
    return { categories };
  }
  const arr = items.map((it, i) => {
    const item: Record<string, unknown> = {
      id: `i-${i}-${Math.random().toString(36).slice(2, 8)}`,
      ...(typeof it === 'object' ? { ...it } : { text: it }),
    };
    for (const k of ITEM_LIST_KEYS) {
      if (typeof item[k] === 'string') item[k] = splitList(item[k] as string);
    }
    return item;
  });
  return { items: arr };
}

// ---------- 导入数据解析（中文键值文本 / 松散对象 → JadeAI 结构化 content） ----------

/** section 类型 → 主键字段：用于把连续文本行切分为多个条目 */
const SECTION_PRIMARY_KEYS: Record<string, string[]> = {
  education: ['institution'],
  work_experience: ['company'],
  projects: ['name'],
  certifications: ['name'],
  languages: ['language'],
};

/** 解析导入数据里的一行键值文本，并按 FIELD_ALIASES 归一化 key */
function parseImportKeyValueLine(line: string): { key: string; value: string } | null {
  const idx = line.search(/[:：]/);
  if (idx <= 0) return null;
  const rawKey = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (!rawKey || !value) return null;
  return { key: FIELD_ALIASES[rawKey] || rawKey, value };
}

/** 把导入 items（字符串 / 对象混合）统一扁平化为标准键值文本行 */
function flattenImportItems(items: unknown[]): string[] {
  const lines: string[] = [];
  for (const it of items) {
    if (typeof it === 'string') {
      lines.push(...it.split(/\r?\n/));
    } else if (it && typeof it === 'object') {
      for (const [rawKey, val] of Object.entries(it as Record<string, unknown>)) {
        if (val == null || val === '') continue;
        const key = FIELD_ALIASES[rawKey] || rawKey;
        if (Array.isArray(val)) {
          val.forEach((v) => lines.push(`${key}: ${v}`));
        } else if (typeof val === 'boolean') {
          lines.push(`${key}: ${val ? '是' : '否'}`);
        } else {
          lines.push(`${key}: ${String(val)}`);
        }
      }
    }
  }
  return lines.filter(Boolean);
}

/** 根据主键把文本行切分为多个条目（如多个学校/公司/项目） */
function groupImportLines(type: SectionType, lines: string[]): string[][] {
  const primaryKeys = SECTION_PRIMARY_KEYS[type];
  if (!primaryKeys || primaryKeys.length === 0) return [lines];
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const kv = parseImportKeyValueLine(line);
    if (kv && primaryKeys.includes(kv.key) && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) groups.push(current);
  return groups.length ? groups : [lines];
}

/**
 * 把导入接口返回的松散 items 解析成 JadeAI 编辑器期望的结构化 content。
 * 输入可能是纯字符串列表、键值行、对象等混合形态；输出形状由 section type 决定。
 */
function parseImportSectionContent(type: SectionType, rawItems: unknown[]): Record<string, unknown> {
  if (type === 'personal_info') {
    const merged: Record<string, unknown> = {};
    for (const line of flattenImportItems(rawItems)) {
      const kv = parseImportKeyValueLine(line);
      if (kv) merged[kv.key] = kv.value;
    }
    return merged;
  }
  if (type === 'summary') {
    return { text: flattenImportItems(rawItems).join('\n') };
  }
  if (type === 'skills') {
    // 导入技能常见写法："后端：PHP, MySQL" 或 "技能：PHP, MySQL"
    const categories = flattenImportItems(rawItems).map((line, i) => {
      const kv = parseImportKeyValueLine(line);
      if (kv && !ITEM_LIST_KEYS.has(kv.key)) {
        return { id: `c-${i}-${Math.random().toString(36).slice(2, 8)}`, name: kv.key, skills: splitList(kv.value) };
      }
      if (kv) {
        return { id: `c-${i}-${Math.random().toString(36).slice(2, 8)}`, name: '技能', skills: splitList(kv.value) };
      }
      return { id: `c-${i}-${Math.random().toString(36).slice(2, 8)}`, name: line, skills: [] };
    });
    return { categories };
  }
  if (type === 'qr_codes' || type === 'github') {
    return legacyItemsToContent(type, rawItems as (Record<string, string> | string)[]);
  }

  // 其余 item-based sections：education / work_experience / projects / certifications / languages / custom
  const defaultTextField = type === 'work_experience' || type === 'projects' ? 'description' : 'highlights';
  const groups = groupImportLines(type, flattenImportItems(rawItems));
  const items = groups.map((group) => {
    const obj: Record<string, unknown> = {};
    const freeText: string[] = [];
    for (const line of group) {
      const kv = parseImportKeyValueLine(line);
      if (kv) {
        if (ITEM_LIST_KEYS.has(kv.key)) {
          const prev = obj[kv.key];
          obj[kv.key] = prev ? `${prev}, ${kv.value}` : kv.value;
        } else {
          obj[kv.key] = kv.value;
          // 工作经历中「职位」应映射为 position（全局别名把「职位」指向 jobTitle 是给 personal_info 用的）
          if (type === 'work_experience' && kv.key === 'jobTitle' && !obj.position) {
            obj.position = kv.value;
          }
        }
      } else {
        freeText.push(line);
      }
    }
    if (freeText.length) {
      const text = freeText.join('\n');
      if (defaultTextField === 'description') {
        obj.description = obj.description ? `${obj.description}\n${text}` : text;
      } else {
        const prev = obj[defaultTextField];
        if (typeof prev === 'string' && prev.trim()) {
          obj[defaultTextField] = [prev, text];
        } else if (Array.isArray(prev)) {
          obj[defaultTextField] = [...prev, text];
        } else {
          obj[defaultTextField] = [text];
        }
      }
    }
    // 列表型字段统一拆成数组，避免渲染组件拿到字符串调用 .map 异常
    for (const k of ITEM_LIST_KEYS) {
      if (typeof obj[k] === 'string') obj[k] = splitList(obj[k] as string);
    }
    return obj;
  });
  return { items };
}

/** 应用 AI 优化建议后的旧版 sections → 新 jade sections（按 title/位置匹配保留原类型与 id） */
export function legacySectionsToJade(
  legacy: { title: string; items: (Record<string, string> | string)[] }[],
  baseSections: ResumeSection[]
): ResumeSection[] {
  return legacy.map((sec, i) => {
    const base = baseSections.find((s) => s.title === sec.title) || baseSections[i];
    const type = base?.type || 'custom';
    return {
      id: base?.id || `s-${Math.random().toString(36).slice(2, 10)}`,
      resumeId: '',
      type,
      title: sec.title,
      sortOrder: base?.sortOrder ?? i,
      visible: base?.visible ?? true,
      content: legacyItemsToContent(type, sec.items) as unknown as SectionContent,
      createdAt: base?.createdAt || new Date(),
      updatedAt: new Date(),
    };
  });
}
