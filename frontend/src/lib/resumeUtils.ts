/**
 * 简历模板共享工具：
 * - 主题色派生函数：单一主题色可派生渐变/双色/半透明变体，炫彩模板由此获得多色表现
 * - 条目解析：string 单段 / 对象首键值对为首行、时间类键提取
 */

import type { ResumeSection } from "@/types";

export interface TemplateProps {
  info: Record<string, string>;
  sections: ResumeSection[];
  accent: string;
}

export const FONT_FAMILY =
  "'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif";

/** 条目解析：string 单段；对象取首键值对为首行，其余为后续行；时间类键（时间/日期/年份等）提取为 time */
export function parseItemLines(it: string | Record<string, string>): { first: string; rest: string[]; time?: string } {
  if (typeof it === "string") return { first: it, rest: [] };
  const entries = Object.entries(it).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return { first: "", rest: [] };
  const [[firstKey, firstVal], ...tail] = entries;
  let first = `${firstKey}: ${firstVal}`;
  let time: string | undefined;
  if (/时间|日期|年份|年月|date|year|period|duration/i.test(firstKey)) {
    time = firstVal;
    first = firstKey.replace(/时间|日期|年份|年月|date|year|period|duration/gi, "").trim();
  }
  const rest: string[] = [];
  for (const [k, v] of tail) {
    if (time === undefined && /时间|日期|年份|年月|date|year|period|duration/i.test(k)) {
      time = v;
      continue;
    }
    rest.push(`${k}: ${v}`);
  }
  return { first: first || firstKey, rest, time };
}

/** 纯字符串条目的段落（技能/证书/兴趣类），炫彩模板将其渲染为徽章流 */
export function isTextSection(sec: ResumeSection): boolean {
  return sec.items.every((it) => typeof it === "string");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 色相旋转：由单一主题色派生第二/第三色（如渐变终点、霓虹双色） */
export function hueShift(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
}

/** 与白色（t>0）或黑色（t<0）混合，t ∈ [-1, 1] */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex(r + (mix - r) * k, g + (mix - g) * k, b + (mix - b) * k);
}

/** hex + alpha → rgba() 字符串（a ∈ [0, 1]） */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 同色相浅色底（如卡片底色）：hex + 白混合 0.88 */
export function tint(hex: string, k = 0.88): string {
  return shade(hex, k);
}
