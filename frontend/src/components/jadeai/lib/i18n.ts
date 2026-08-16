'use client';

/**
 * next-intl 替代 shim：JadeAI 编辑器组件原样使用 useTranslations()，
 * 这里提供等价的 hooks，内置中文文案字典（提取自 JadeAI messages/zh.json
 * 中编辑器实际用到的 namespace）。
 */
import { useMemo } from 'react';

type Dict = Record<string, unknown>;
type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function lookup(obj: Dict, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Dict)[seg];
  }
  return cur;
}

/** 简单 ICU 插值：`{year}年{month}` → 替换 {name} 占位符 */
function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m
  );
}

const zh: Dict = {
  dashboard: {
    templateClassic: '经典',
    templateModern: '现代',
    templateMinimal: '极简',
    templateProfessional: '专业',
    templateTwoColumn: '双栏',
    templateCreative: '创意',
    templateAts: 'ATS',
    templateAcademic: '学术',
    templateElegant: '优雅',
    templateExecutive: '高管',
    templateDeveloper: '开发者',
    templateDesigner: '设计师',
    templateStartup: '创业',
    templateFormal: '正式',
    templateInfographic: '信息图',
    templateCompact: '紧凑',
    templateEuro: '欧式',
    templateClean: '清新',
    templateBold: '醒目',
    templateTimeline: '时间轴',
    templateNordic: '北欧',
    templateCorporate: '企业',
    templateConsultant: '顾问',
    templateFinance: '金融',
    templateMedical: '医疗',
    templateGradient: '渐变',
    templateMetro: '都市',
    templateMaterial: '质感',
    templateCoder: '码农',
    templateBlocks: '块状',
    templateMagazine: '杂志',
    templateArtistic: '艺术',
    templateRetro: '复古',
    templateNeon: '霓虹',
    templateWatercolor: '水彩',
    templateSwiss: '瑞士',
    templateJapanese: '和风',
    templateBerlin: '柏林',
    templateLuxe: '奢华',
    templateRose: '玫瑰',
    templateArchitect: '建筑师',
    templateLegal: '律师',
    templateTeacher: '教师',
    templateScientist: '科学家',
    templateEngineer: '工程师',
    templateSidebar: '侧边栏',
    templateCard: '卡片',
    templateZigzag: '锯齿',
    templateRibbon: '缎带',
    templateMosaic: '马赛克',
  },
  editor: {
    edit: '编辑',
    preview: '预览',
    toolbar: {
      undo: '撤销',
      redo: '重做',
      preview: '预览',
      export: '导出',
      template: '切换模板',
      settings: '设置',
      theme: '主题',
      autoSaved: '已自动保存',
      saving: '保存中...',
      unsaved: '未保存',
      save: '保存',
      exportPdf: '导出',
      exporting: '导出中...',
      aiAssistant: 'AI 优化',
      jdAnalysis: 'JD 匹配',
      translate: '翻译',
      coverLetter: '求职信',
      grammarCheck: '语法检查',
      share: '分享',
      import: '导入',
      previewError: '预览渲染失败，可能是内容格式有误。请在左侧编辑修复，或撤销最近的 AI 修改。',
    },
    aiPolish: 'AI 润色',
    invalidSectionContent: '该模块数据异常，请使用 AI 重新生成内容',
    sidebar: {
      sections: '简历模块',
      addSection: '添加模块',
      dragHint: '拖拽模块以调整顺序',
    },
    sections: {
      personalInfo: '个人信息',
      summary: '个人简介',
      workExperience: '工作经历',
      education: '教育背景',
      skills: '技能特长',
      projects: '项目经历',
      certifications: '资格证书',
      languages: '语言能力',
      github: 'GitHub 项目',
      qrCodes: '二维码',
      custom: '自定义模块',
    },
    fields: {
      fullName: '姓名',
      jobTitle: '职位',
      age: '年龄',
      gender: '性别',
      politicalStatus: '政治面貌',
      ethnicity: '民族',
      hometown: '籍贯',
      maritalStatus: '婚姻状况',
      yearsOfExperience: '工作年限',
      educationLevel: '最高学历',
      genderOptions: '男,女',
      politicalStatusOptions: '群众,共青团员,中共预备党员,中共党员,民主党派',
      ethnicityOptions:
        '汉族,蒙古族,回族,藏族,维吾尔族,苗族,彝族,壮族,布依族,朝鲜族,满族,侗族,瑶族,白族,土家族,哈尼族,哈萨克族,傣族,黎族,傈僳族,佤族,畲族,高山族,拉祜族,水族,东乡族,纳西族,景颇族,柯尔克孜族,土族,达斡尔族,仫佬族,羌族,布朗族,撒拉族,毛南族,仡佬族,锡伯族,阿昌族,普米族,塔吉克族,怒族,乌孜别克族,俄罗斯族,鄂温克族,德昂族,保安族,裕固族,京族,塔塔尔族,独龙族,鄂伦春族,赫哲族,门巴族,珞巴族,基诺族',
      maritalStatusOptions: '未婚,已婚,离异',
      educationLevelOptions: '初中,高中,中专,大专,本科,硕士,博士,博士后',
      email: '邮箱',
      phone: '电话',
      wechat: '微信',
      location: '所在地',
      website: '个人网站',
      company: '公司',
      position: '职位',
      startDate: '开始时间',
      endDate: '结束时间',
      current: '至今',
      description: '描述',
      highlights: '亮点',
      institution: '学校',
      degree: '学位',
      field: '专业',
      gpa: 'GPA',
      skillCategory: '技能分类',
      projectName: '项目名称',
      technologies: '技术栈',
      language: '语言',
      proficiency: '熟练程度',
      repoUrl: '仓库地址',
      stars: 'Stars',
      repoName: '仓库名称',
      primaryLanguage: '主要语言',
      fetchRepo: '获取仓库信息',
      fetchingRepo: '获取中...',
      certName: '证书名称',
      issuer: '颁发机构',
      certDate: '获得日期',
      qrCodes: '二维码',
      qrLabel: '标签',
      qrUrl: '链接',
      qrAutoGenerate: '自动检测',
      qrAdd: '添加二维码',
      qrUrlInvalid: '请输入有效的链接地址',
      addItem: '添加条目',
      removeItem: '删除条目',
      clear: '清除',
      dateDisplay: '{year}年{month}',
      months: {
        '01': '1月', '02': '2月', '03': '3月', '04': '4月',
        '05': '5月', '06': '6月', '07': '7月', '08': '8月',
        '09': '9月', '10': '10月', '11': '11月', '12': '12月',
      },
    },
  },
  export: {
    title: '导出简历',
    description: '选择导出格式下载简历',
    pdf: 'PDF',
    pdfDescription: '可打印文档',
    docx: 'Word',
    docxDescription: '可编辑文档',
    html: 'HTML',
    htmlDescription: '网页格式',
    txt: '纯文本',
    txtDescription: '简单文本文件',
    pdfOnePage: '智能一页',
    pdfOnePageDescription: '自动适配一页',
    pdfOnePageTooltip: '内容过长的简历可能无法成功适配一页',
    json: 'JSON',
    jsonDescription: '结构化数据',
    export: '导出',
    exporting: '导出中...',
    success: '导出成功！',
    error: '导出失败，请重试。',
    pdfFailedHint: '服务器生成 PDF 失败（可能未安装 Chromium 或资源不足）。可改用浏览器打印为 PDF。',
    printFallback: '用浏览器打印为 PDF',
    cancel: '取消',
  },
  import: {
    title: '导入简历',
    description: '导入之前导出的 JSON 文件，替换当前简历内容',
    dashboardDescription: '导入之前导出的 JSON 文件，创建新简历',
    selectFile: '点击选择或拖拽 .json 文件到此处',
    dragHint: '支持从 JadeAI 导出的 .json 文件',
    importing: '导入中...',
    success: '导入成功！',
    error: '导入失败，请重试。',
    invalidFormat: '文件格式无效，请选择包含 sections 数据的有效 JSON 文件。',
    importBtn: '导入',
    cancel: '取消',
  },
  themeEditor: {
    title: '主题编辑',
    reset: '重置主题',
    templateSection: '切换模板',
    presets: '预设主题',
    preset: {
      classic: '经典',
      modern: '现代',
      minimal: '简约',
      elegant: '优雅',
      bold: '大胆',
      creative: '创意',
      mint: '薄荷',
    },
    avatarStyle: '头像样式',
    avatarCircle: '圆形',
    avatarOneInch: '1寸照',
    colors: '颜色',
    primaryColor: '主色调',
    accentColor: '强调色',
    typography: '字体排版',
    fontFamily: '字体',
    fontSizeLabel: '字号',
    fontSize: { small: '小', medium: '中', large: '大' },
    lineSpacing: '行间距',
    spacing: '间距',
    sectionSpacing: '区块间距',
    pageMargin: '页边距',
    margin: { top: '上', right: '右', bottom: '下', left: '左' },
  },
};

/**
 * 与 next-intl 兼容的 useTranslations：
 * - useTranslations('editor') → t('toolbar.undo') 在 editor 命名空间内点路径查找
 * - useTranslations() → t('dashboard.templateClassic') 从根字典查找
 * - t(key, { name: v }) 支持 {name} 插值
 */
export function useTranslations(namespace?: string): TranslateFn {
  return useMemo(() => {
    const root = namespace ? ((lookup(zh, namespace) as Dict | undefined) ?? {}) : zh;
    const t: TranslateFn = (key, params) => {
      const v = lookup(root, key);
      return format(typeof v === 'string' ? v : key, params);
    };
    return t;
  }, [namespace]);
}
