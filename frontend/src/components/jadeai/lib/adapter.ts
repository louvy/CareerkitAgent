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
import type { SectionType } from '@/lib/constants';
import type { ResumeContent } from '@/types';

export const JADE_TEMPLATE_PREFIX = 'jadeai-';

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

/** 中文标签 → 结构化字段名(解析建议文本 "字段: 值" 行) */
const FIELD_ALIASES: Record<string, string> = {
  姓名: 'fullName',
  职位: 'jobTitle',
  求职意向: 'jobTitle',
  邮箱: 'email',
  电话: 'phone',
  微信: 'wechat',
  所在地: 'location',
  城市: 'location',
  工作地点: 'location',
  个人网站: 'website',
  公司: 'company',
  开始时间: 'startDate',
  结束时间: 'endDate',
  描述: 'description',
  亮点: 'highlights',
  学校: 'institution',
  学位: 'degree',
  专业: 'field',
  技能分类: 'name',
  技能: 'skills',
  项目名称: 'name',
  项目: 'name',
  技术栈: 'technologies',
  语言: 'language',
  熟练程度: 'proficiency',
  证书名称: 'name',
  颁发机构: 'issuer',
  获得日期: 'date',
  仓库地址: 'repoUrl',
  仓库名称: 'name',
  主要语言: 'language',
  标签: 'label',
  链接: 'url',
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
      const type = (sec.type || 'custom') as SectionType;
      let items = (sec.items as (string | Record<string, string>)[]) || [];
      // 个人信息多为「姓名：张三」这类键值行，先解析成对象才能合并进个人信息字段
      if (type === 'personal_info' && items.length > 0 && items.every((it) => typeof it === 'string')) {
        items = suggestionTextToLegacyItems((items as string[]).join('\n'));
      }
      return {
        id: `s-${i}-${Math.random().toString(36).slice(2, 10)}`,
        resumeId: '',
        type,
        title: sec.title || '',
        sortOrder: i,
        visible: true,
        content: legacyItemsToContent(type, items) as unknown as SectionContent,
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
    const idx = line.indexOf(':');
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
