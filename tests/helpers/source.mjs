import { readFile } from "node:fs/promises";

/** 모듈이 어느 파일로 옮겨가도 검사가 깨지지 않도록 src 전체를 합쳐서 본다. */
const SOURCE_FILES = [
  "app.js",
  "dom.js",
  "render.js",
  "store.js",
  "members.js",
  "data/rows.js",
  "data/remote.js",
  "expenses.js",
  "calendar.js",
  "analysis.js",
  "supabase.js",
  "fixed-costs.js",
  "ui/drag-tracker.js",
  "ui/escape.js",
  "ui/page.js",
  "ui/calendar-grid.js",
  "ui/ledger.js",
  "ui/scroll-lock.js",
  "ui/sheet.js",
  "ui/swipe.js",
  "ui/toast.js",
  "features/auth.js",
  "features/notes.js",
  "features/analysis.js",
  "features/profile.js",
  "features/settings.js",
  "features/expense-actions.js",
  "features/fixed-sheet.js",
  "features/expense-form.js",
  "features/month-picker.js",
];

/** 캐스케이드 순서가 특이도 경합을 좌우하므로 순서를 지켜 이어 붙인다. */
export const STYLE_FILES = ["base", "swipe", "layout", "ledger", "calendar", "page", "sheet", "notes", "analysis", "auth", "responsive"];

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [htmlText, swText, styleEntry, ...rest] = await Promise.all([
  read("index.html"),
  read("public/sw.js"),
  read("src/style.css"),
  ...SOURCE_FILES.map((name) => read(`src/${name}`)),
  ...STYLE_FILES.map((name) => read(`src/styles/${name}.css`)),
]);

export const html = htmlText;
export const sw = swText;
export const styleImportEntry = styleEntry;
const sourceTexts = rest.slice(0, SOURCE_FILES.length);
const styleTexts = rest.slice(SOURCE_FILES.length);

export const source = sourceTexts.join("\n");
export const css = styleTexts.join("\n");

/** 파일 크기 상한 검사를 위한 줄 수. 파일이 늘어나도 자동으로 함께 검사된다. */
export const sourceLineCounts = Object.fromEntries([
  ...SOURCE_FILES.map((name, i) => [`src/${name}`, sourceTexts[i].split("\n").length]),
  ...STYLE_FILES.map((name, i) => [`src/styles/${name}.css`, styleTexts[i].split("\n").length]),
]);

/** 이름으로 함수 본문을 뽑는다. 없으면 빈 문자열이라 assert가 실패한다. */
export function fn(name) {
  return source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0] || "";
}
