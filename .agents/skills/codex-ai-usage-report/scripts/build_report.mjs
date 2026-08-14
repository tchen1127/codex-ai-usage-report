import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TEMPLATE = path.join(SKILL_DIR, "assets", "rd-codex-ai-usage-report-template.pptx");
const HASH_FILE = path.join(SKILL_DIR, "assets", "template.sha256");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

async function importRuntimeModule(packageName) {
  const root = process.env.RUNTIME_NODE_MODULES;
  if (!root || !path.isAbsolute(root)) {
    throw new Error("RUNTIME_NODE_MODULES must be set to the bundled Node node_modules directory.");
  }
  const requireFromRuntime = createRequire(path.join(root, "__runtime__.cjs"));
  const entrypoint = requireFromRuntime.resolve(packageName);
  return import(pathToFileURL(entrypoint).href);
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US").format(number);
}

function exactNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatHours(minutes) {
  const hours = Math.max(0, Number(minutes) || 0) / 60;
  if (hours >= 10) return String(Math.round(hours));
  return hours.toFixed(1).replace(/\.0$/, "");
}

function clip(value, maxChars) {
  const chars = [...String(value || "").trim()];
  if (chars.length <= maxChars) return chars.join("");
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

function friendlySkillName(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const aliases = new Map([
    ["altium-live-review", "Altium"],
    ["ee-schematic-review", "Circuit Review"],
    ["computer-use", "Computer Use"],
    ["component selection", "Component Sel."],
    ["digikey-mouser-substitution", "Component Sel."],
    ["presentations", "PPT"],
    ["spreadsheets", "Excel"],
    ["documents", "DOCX"],
  ]);
  return aliases.get(key) || raw;
}

function bulletLines(values, maxLines, maxChars) {
  const lines = values
    .map((value) => String(value || "").replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((value) => `• ${clip(value, maxChars)}`);
  while (lines.length < maxLines) lines.push(lines.length === 0 ? "• 資料累積中" : "• —");
  return lines.join("\n");
}

function sampleModeFor(count, explicit) {
  if (["general", "starter", "no-data"].includes(explicit)) return explicit;
  if (count === 0) return "no-data";
  return count < 10 ? "starter" : "general";
}

function validateData(data) {
  const errors = [];
  if (!data?.employee?.englishName) errors.push("employee.englishName is required");
  if (!data?.employee?.chineseName) errors.push("employee.chineseName is required");
  const workCount = Number(data?.metrics?.workRecordCount);
  if (!Number.isInteger(workCount) || workCount < 0) errors.push("metrics.workRecordCount must be a non-negative integer");
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const categorySum = categories.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  if (Number.isFinite(workCount) && categorySum !== workCount) {
    errors.push(`category count sum ${categorySum} does not equal workRecordCount ${workCount}`);
  }
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const projectSum = projects.reduce((sum, item) => sum + (Number(item.workRecordCount) || 0), 0);
  if (Number.isFinite(workCount) && projectSum !== workCount) {
    errors.push(`project work-record sum ${projectSum} does not equal workRecordCount ${workCount}`);
  }
  if (errors.length) throw new Error(`Invalid report-data.json:\n- ${errors.join("\n- ")}`);
}

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex").toUpperCase();
}

async function buildObjectIndex(presentation) {
  const snapshot = await presentation.inspect({
    kind: "textbox,shape,table,chart",
    include: "id,slide,name,bbox,kind",
    maxChars: 30000,
  });
  const records = snapshot.ndjson
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const byName = new Map();
  for (const record of records) {
    if (!record.name) continue;
    if (!byName.has(record.name)) byName.set(record.name, []);
    byName.get(record.name).push(record);
  }
  for (const items of byName.values()) {
    items.sort((a, b) => (a.bbox?.[1] ?? 0) - (b.bbox?.[1] ?? 0));
  }
  return byName;
}

async function resolveNamed(presentation, index, name, kind, occurrence = 0) {
  const candidates = (index.get(name) || []).filter((item) => !kind || item.kind === kind);
  const record = candidates[occurrence];
  if (!record) throw new Error(`Missing inherited ${kind || "object"}: ${name} #${occurrence}`);
  return presentation.resolve(record.id);
}

async function rewrite(presentation, index, name, text, occurrence = 0) {
  const shape = await resolveNamed(presentation, index, name, "textbox", occurrence);
  shape.text = String(text ?? "");
}

function categoryCounts(data) {
  const fixed = [
    "工程設計／審查",
    "技術研究／選型",
    "工具／自動化",
    "文件／報告／溝通",
  ];
  const map = new Map((data.categories || []).map((item) => [item.name, Number(item.count) || 0]));
  return fixed.map((name) => ({ name, count: map.get(name) || 0 }));
}

function normalizedAiItems(data) {
  const fixed = ["任務推進", "品質與查核", "可複用成果", "風險辨識"];
  const map = new Map((data.aiValue?.items || []).map((item) => [item.name, item]));
  return fixed.map((name) => ({
    name,
    status: map.get(name)?.status || "資料累積中",
    evidence: map.get(name)?.evidence || "",
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data) throw new Error("--data is required.");
  if (!args.output) throw new Error("--output is required.");
  const dataPath = path.resolve(String(args.data));
  const templatePath = path.resolve(String(args.template || DEFAULT_TEMPLATE));
  const outputPath = path.resolve(String(args.output));
  const qaDir = path.resolve(String(args["qa-dir"] || path.join(path.dirname(outputPath), "qa")));
  const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
  validateData(data);

  const warnings = [];
  if (templatePath === path.resolve(DEFAULT_TEMPLATE)) {
    const expected = (await fs.readFile(HASH_FILE, "utf8")).trim().split(/\s+/)[0].toUpperCase();
    const actual = await sha256(templatePath);
    if (actual !== expected) warnings.push(`template hash differs: expected ${expected}, got ${actual}`);
  }

  const { FileBlob, PresentationFile } = await importRuntimeModule("@oai/artifact-tool");
  const presentation = await PresentationFile.importPptx(await FileBlob.load(templatePath));
  if (presentation.slides.items.length !== 2) throw new Error("Template must contain exactly 2 slides.");
  const [slide1, slide2] = presentation.slides.items;
  const index = await buildObjectIndex(presentation);

  const metrics = data.metrics;
  const workCount = Number(metrics.workRecordCount) || 0;
  const mode = sampleModeFor(workCount, data.sampleMode);
  const projects = [...(data.projects || [])].sort((a, b) => {
    if (Boolean(a.aggregate) !== Boolean(b.aggregate)) return a.aggregate ? 1 : -1;
    return (Number(b.workRecordCount) || 0) - (Number(a.workRecordCount) || 0);
  });
  const inferredProjectCount = projects.reduce(
    (sum, item) => sum + Math.max(1, Number(item.groupCount) || 1),
    0,
  );
  const projectCount = Number(metrics.projectGroupCount) || inferredProjectCount;
  const activeDays = Number(metrics.activeDays) || 0;
  const eligibleDays = Number(metrics.eligibleDays) || 0;
  const totalTokens = Number(metrics.totalTokens) || 0;
  const periodStart = String(data.period?.start || "").replaceAll("/", "-");
  const periodEnd = String(data.period?.end || "").replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error("report-data period.start and period.end must use YYYY-MM-DD or YYYY/MM/DD.");
  }
  const displayStart = periodStart.replaceAll("-", "/");
  const displayEnd = periodEnd.replaceAll("-", "/");

  await rewrite(
    presentation,
    index,
    "slide-1-title",
    `${data.employee.englishName}（${data.employee.chineseName}）｜Codex 使用與工作價值`,
  );
  await rewrite(
    presentation,
    index,
    "slide-1-subtitle",
    `統計期間：${displayStart}–${displayEnd}｜${data.department || "研發部"}｜僅納入工作相關內容`,
  );
  await rewrite(presentation, index, "slide-1-kpi-value-1", `${workCount} 筆`);
  await rewrite(presentation, index, "slide-1-kpi-label-1", "AI 工作紀錄");
  await rewrite(presentation, index, "slide-1-kpi-detail-1", `${projectCount} 個專案群組`);
  await rewrite(presentation, index, "slide-1-kpi-value-2", `${activeDays}／${eligibleDays}`);
  await rewrite(presentation, index, "slide-1-kpi-label-2", "使用天數");
  await rewrite(
    presentation,
    index,
    "slide-1-kpi-detail-2",
    `約 ${formatHours(metrics.activeMinutes)}h 活躍互動`,
  );
  await rewrite(presentation, index, "slide-1-kpi-value-3", compactNumber(totalTokens));
  await rewrite(presentation, index, "slide-1-kpi-label-3", "期間總 Token");
  await rewrite(presentation, index, "slide-1-kpi-detail-3", exactNumber(totalTokens), 0);
  const sampleNote = mode === "starter" ? "｜樣本累積中" : mode === "no-data" ? "｜本期無紀錄" : "";
  await rewrite(
    presentation,
    index,
    "slide-1-footer",
    `※ 本報告供個人 AI 應用與績效考核參考之一；不作為單一判定或員工排名${sampleNote}。\n` +
      `資料來源：Codex 本機工作 session｜Token 供部門額度規劃｜快照：${displayEnd}`,
  );

  const categories = categoryCounts(data);
  const chart = slide1.charts.items[0];
  if (!chart) throw new Error("Template doughnut chart is missing.");
  chart.categories = categories.map((item) => item.name);
  const series = chart.series.getItemAt(0);
  series.categories = categories.map((item) => item.name);
  series.values = workCount > 0 ? categories.map((item) => item.count) : [1, 1, 1, 1];
  for (let i = 0; i < 4; i += 1) {
    const override = series.dataLabelOverrides.add(i);
    override.text =
      workCount > 0
        ? categories[i].count > 0
          ? `${Math.round((categories[i].count / workCount) * 100)}%`
          : " "
        : "—";
    override.showValue = false;
    override.showSeriesName = false;
    override.showCategoryName = false;
    override.showPercent = false;
  }

  const table = await resolveNamed(presentation, index, "slide-1-project-work-table", "table");
  const topFive = projects.slice(0, 5);
  const remaining = projects.slice(5);
  const tableRows = [["專案／群組", "AI 工作紀錄數", "主要工作內容"]];
  for (let i = 0; i < 5; i += 1) {
    const item = topFive[i];
    tableRows.push(
      item
        ? [clip(item.name, 22), `${Number(item.workRecordCount) || 0} 筆`, clip(item.summary, 28)]
        : ["—", "—", "資料累積中"],
    );
  }
  if (remaining.length) {
    tableRows.push([
      `其他 ${remaining.reduce((sum, item) => sum + Math.max(1, Number(item.groupCount) || 1), 0)} 個群組`,
      `${remaining.reduce((sum, item) => sum + (Number(item.workRecordCount) || 0), 0)} 筆`,
      "其他工作",
    ]);
  } else {
    tableRows.push(["—", "—", "資料累積中"]);
  }
  for (let row = 0; row < tableRows.length; row += 1) {
    for (let column = 0; column < 3; column += 1) table.cells.set(row, column, tableRows[row][column]);
  }

  const categoryNote = categories.map((item) => `${item.name} ${item.count}`).join("、");
  slide1.speakerNotes.textFrame.setText(
    `統計期間：${periodStart}–${periodEnd}（${data.period?.timezone || "Asia/Taipei"}）。
樣本狀態：${mode}；AI 工作紀錄 ${workCount} 筆、專案群組 ${projectCount} 個。
分類：${categoryNote}。
Token：${exactNumber(totalTokens)}，包含 Codex 回報的 Cached Input；供部門額度規劃，不等同帳單金額。
使用天數：${activeDays}／${eligibleDays}；活躍互動約 ${formatHours(metrics.activeMinutes)}h，為 session 互動區段估計，不是正式工時。
本報告可作為個人 AI 應用與績效考核參考之一，但不得只用 Token、使用量或單一分數判定，也不作員工排名。
${(data.methodologyNotes || []).join("\n")}
[Sources]
- ${data.sourceSummary || "Codex 本機工作 session"}
- Local evidence generated by codex-ai-usage-report
[/Sources]`,
  );

  const heading =
    mode === "general"
      ? "代表工程應用｜3 個主要專案"
      : mode === "starter"
        ? "代表工程應用｜起步使用紀錄"
        : "代表工程應用｜資料累積中";
  await rewrite(presentation, index, "slide-2-case-heading", heading);
  const projectSlots = [
    ["slide-2-case-problem", "slide-2-case-problem-text", 22, 26],
    ["slide-2-case-action", "slide-2-case-action-text", 18, 22],
    ["slide-2-case-result", "slide-2-case-result-text", 12, 14],
  ];
  for (let i = 0; i < projectSlots.length; i += 1) {
    const [titleName, bodyName, titleLimit, bulletLimit] = projectSlots[i];
    const item = projects[i];
    if (item) {
      await rewrite(
        presentation,
        index,
        titleName,
        `${clip(item.name, titleLimit)}（${Number(item.workRecordCount) || 0} 筆）`,
      );
      await rewrite(presentation, index, bodyName, bulletLines(item.bullets || [item.summary], 3, bulletLimit));
    } else {
      await rewrite(presentation, index, titleName, "資料累積中");
      await rewrite(presentation, index, bodyName, "• 尚無足夠紀錄\n• —\n• —");
    }
  }

  const otherProjects = projects.slice(3);
  await rewrite(
    presentation,
    index,
    "slide-2-value-title-1",
    otherProjects.length
      ? `其餘工作｜${otherProjects.reduce((sum, item) => sum + Math.max(1, Number(item.groupCount) || 1), 0)} 個群組`
      : "其餘工作｜資料累積中",
  );
  await rewrite(
    presentation,
    index,
    "slide-2-value-body-1",
    bulletLines(
      otherProjects.map(
        (item) => `${item.name}｜${Number(item.workRecordCount) || 0} 筆`,
      ),
      4,
      18,
    ),
  );

  const recordsWithSkill = Number(data.skills?.recordsWithSkill) || 0;
  const skillPercent = workCount ? Math.round((recordsWithSkill / workCount) * 100) : 0;
  await rewrite(
    presentation,
    index,
    "slide-2-value-title-2",
    `Skill 覆蓋率｜${skillPercent}%（${recordsWithSkill}／${workCount}）`,
  );
  const topSkills = (data.skills?.top || []).slice(0, 5);
  let skillLines;
  if (!topSkills.length) {
    skillLines = "• 尚未偵測到 Skill 紀錄\n• —\n• —\n• —";
  } else {
    const formatted = topSkills.map(
      (item) => `${clip(friendlySkillName(item.name), 16)} ${Number(item.count) || 0}`,
    );
    const lines = [];
    if (formatted.length >= 2) lines.push(`• ${formatted[0]}｜${formatted[1]}`);
    else lines.push(`• ${formatted[0]}`);
    for (const item of formatted.slice(2)) lines.push(`• ${item}`);
    while (lines.length < 4) lines.push("• —");
    skillLines = lines.slice(0, 4).join("\n");
  }
  await rewrite(presentation, index, "slide-2-value-body-2", skillLines);

  const aiItems = normalizedAiItems(data);
  const observed = aiItems.filter((item) => item.status === "已觀察").length;
  const aiTitle =
    mode === "no-data"
      ? "AI Value｜資料累積中"
      : mode === "starter"
        ? `AI Value｜初步觀察（${observed}／4）`
        : `AI Value｜${observed}／4 面向已觀察`;
  await rewrite(presentation, index, "slide-2-value-title-3", aiTitle);
  await rewrite(
    presentation,
    index,
    "slide-2-value-body-3",
    aiItems.map((item) => `• ${item.name}｜${item.status}`).join("\n"),
  );
  await rewrite(
    presentation,
    index,
    "slide-2-next-step",
    "AI Value 記錄 AI 的實際工作助益，供績效考核參考之一；不作單一判定或排名。",
  );

  slide2.speakerNotes.textFrame.setText(
    `本頁用於記錄 AI 是否協助實際工作，可作為個人績效與考核的參考之一；不作單一判定或員工排名。
Skill 覆蓋率：${recordsWithSkill}／${workCount}（${skillPercent}%）；同一 Skill 在同一工作最多計 1 次。
AI Value：${aiTitle}。
${aiItems.map((item) => `- ${item.name}｜${item.status}：${item.evidence || "尚無足夠證據"}`).join("\n")}
低樣本顯示「初步觀察」或「資料累積中」，不代表低價值。
[Sources]
- ${data.sourceSummary || "Codex 本機工作 session"}
- Local evidence generated by codex-ai-usage-report
[/Sources]`,
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });
  for (const [i, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(i + 1).padStart(2, "0")}`;
    const png = await presentation.export({ slide, format: "png", scale: 2 });
    await fs.writeFile(path.join(qaDir, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(qaDir, `${stem}.layout.json`), await layout.text(), "utf8");
  }
  const exported = await PresentationFile.exportPptx(presentation);
  await exported.save(outputPath);
  const inspect = await presentation.inspect({
    kind: "slide,textbox,shape,table,chart,notes,layout",
    maxChars: 36000,
  });
  await fs.writeFile(path.join(qaDir, "report.inspect.ndjson"), inspect.ndjson, "utf8");
  await fs.writeFile(
    path.join(qaDir, "build-manifest.json"),
    `${JSON.stringify(
      {
        output: outputPath,
        data: dataPath,
        template: templatePath,
        sampleMode: mode,
        warnings,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ output: outputPath, qaDir, sampleMode: mode, warnings }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
