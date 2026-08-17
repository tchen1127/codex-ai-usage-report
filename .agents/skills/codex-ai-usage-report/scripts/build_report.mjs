import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TEMPLATE = path.join(SKILL_DIR, "assets", "rd-codex-ai-usage-report-template.pptx");
const HASH_FILE = path.join(SKILL_DIR, "assets", "template.sha256");
const AI_VALUE_DIMENSIONS = ["任務推進", "品質與查核", "可複用成果", "風險辨識", "工作效率提升"];
const OBSERVATION_DIMENSIONS = [
  "使用投入與持續性",
  "任務廣度",
  "任務深度與複雜度",
  "成果與實務價值",
  "品質、查核與風險意識",
  "可複用性與成熟度",
];
const MATURITY_LEVELS = ["資料不足", "起步探索", "穩定應用", "成熟應用", "高度整合"];

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

function charCount(value) {
  return [...String(value || "").replace(/\s/g, "")].length;
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

function normalizeScore(value) {
  if (String(value ?? "").trim().toUpperCase() === "N/A") return "N/A";
  if (typeof value !== "number" && typeof value !== "string") return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (typeof trimmed === "string" && !/^[1-5]$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function scoreAverage(items, key) {
  const scores = items.map((item) => item[key]).filter((value) => Number.isInteger(value));
  if (!scores.length) return "N/A";
  return `${(scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1)}／5`;
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
  const expected = count === 0 ? "no-data" : count < 10 ? "starter" : "general";
  if (explicit && explicit !== expected) {
    throw new Error(`sampleMode ${explicit} does not match workRecordCount ${count}; expected ${expected}`);
  }
  return expected;
}

function validateData(data) {
  const errors = [];
  if (data?.schemaVersion !== "2.0") errors.push("schemaVersion must be 2.0");
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
  const aiItems = Array.isArray(data?.aiValue?.items) ? data.aiValue.items : [];
  if (aiItems.length !== AI_VALUE_DIMENSIONS.length) {
    errors.push(`aiValue.items must contain exactly ${AI_VALUE_DIMENSIONS.length} items`);
  }
  if (new Set(aiItems.map((item) => item.name)).size !== aiItems.length) {
    errors.push("aiValue.items contains duplicate dimension names");
  }
  const aiMap = new Map(aiItems.map((item) => [item.name, item]));
  for (const name of AI_VALUE_DIMENSIONS) {
    const item = aiMap.get(name);
    if (!item) {
      errors.push(`aiValue.items is missing ${name}`);
      continue;
    }
    const aiScore = normalizeScore(item.aiEvidenceScore);
    const selfScore = normalizeScore(item.selfScore);
    if (aiScore == null) errors.push(`aiValue ${name}.aiEvidenceScore must be 1-5 or N/A`);
    if (selfScore == null) errors.push(`aiValue ${name}.selfScore must be 1-5 or N/A`);
    if (Number.isInteger(aiScore) && !String(item.evidence || "").trim()) {
      errors.push(`aiValue ${name}.evidence is required when AI evidence score is numeric`);
    }
    if (workCount === 0 && aiScore !== "N/A") {
      errors.push(`aiValue ${name}.aiEvidenceScore must be N/A when workRecordCount is 0`);
    }
    if (workCount === 0 && selfScore !== "N/A") {
      errors.push(`aiValue ${name}.selfScore must be N/A when workRecordCount is 0`);
    }
  }
  const observation = data?.aiComprehensiveObservation;
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    errors.push("aiComprehensiveObservation must be an object");
  } else {
    const status = observation.status;
    if (!["evaluated", "insufficient-data"].includes(status)) {
      errors.push("aiComprehensiveObservation.status must be evaluated or insufficient-data");
    }
    if (!MATURITY_LEVELS.includes(observation.maturityLevel)) {
      errors.push(`aiComprehensiveObservation.maturityLevel must be one of ${MATURITY_LEVELS.join("、")}`);
    }
    if (status === "insufficient-data" && observation.maturityLevel !== "資料不足") {
      errors.push("insufficient-data observation must use 資料不足 maturityLevel");
    }
    if (workCount === 0 && status !== "insufficient-data") {
      errors.push("aiComprehensiveObservation.status must be insufficient-data when workRecordCount is 0");
    }
    if (workCount > 0 && status !== "evaluated") {
      errors.push("aiComprehensiveObservation.status must be evaluated when workRecordCount is greater than 0");
    }
    const observationText = String(observation.observationText || "").trim();
    const observationLength = charCount(observationText);
    if (!observationText) {
      errors.push("aiComprehensiveObservation.observationText is required");
    } else if (status === "evaluated" && (observationLength < 90 || observationLength > 160)) {
      errors.push("evaluated observationText must contain 90-160 non-whitespace characters");
    } else if (status === "insufficient-data" && (observationLength < 20 || observationLength > 160)) {
      errors.push("insufficient-data observationText must contain 20-160 non-whitespace characters");
    }

    const signals = observation.quantitativeSignals;
    const recordsWithSkill = Number(data?.skills?.recordsWithSkill) || 0;
    const expectedSignals = {
      totalTokens: Number(data?.metrics?.totalTokens) || 0,
      workRecordCount: Number.isFinite(workCount) ? workCount : 0,
      activeDays: Number(data?.metrics?.activeDays) || 0,
      eligibleDays: Number(data?.metrics?.eligibleDays) || 0,
      activeMinutes: Number(data?.metrics?.activeMinutes) || 0,
      projectGroupCount: Number(data?.metrics?.projectGroupCount) || 0,
      skillCoverageRate: workCount > 0 ? Math.round((recordsWithSkill / workCount) * 100) : 0,
    };
    if (!signals || typeof signals !== "object" || Array.isArray(signals)) {
      errors.push("aiComprehensiveObservation.quantitativeSignals must be an object");
    } else {
      for (const [key, expected] of Object.entries(expectedSignals)) {
        if (typeof signals[key] !== "number" || !Number.isFinite(signals[key]) || signals[key] !== expected) {
          errors.push(`aiComprehensiveObservation.quantitativeSignals.${key} must equal ${expected}`);
        }
      }
    }

    const assessments = Array.isArray(observation.dimensionAssessments)
      ? observation.dimensionAssessments
      : [];
    if (assessments.length !== OBSERVATION_DIMENSIONS.length) {
      errors.push(`aiComprehensiveObservation.dimensionAssessments must contain exactly ${OBSERVATION_DIMENSIONS.length} items`);
    }
    if (new Set(assessments.map((item) => item.name)).size !== assessments.length) {
      errors.push("aiComprehensiveObservation.dimensionAssessments contains duplicate dimension names");
    }
    const assessmentMap = new Map(assessments.map((item) => [item.name, item]));
    for (const name of OBSERVATION_DIMENSIONS) {
      const item = assessmentMap.get(name);
      if (!item) {
        errors.push(`aiComprehensiveObservation.dimensionAssessments is missing ${name}`);
        continue;
      }
      const score = normalizeScore(item.score);
      if (score == null) errors.push(`aiComprehensiveObservation ${name}.score must be 1-5 or N/A`);
      if (Number.isInteger(score) && !String(item.evidence || "").trim()) {
        errors.push(`aiComprehensiveObservation ${name}.evidence is required when score is numeric`);
      }
      if (status === "insufficient-data" && score !== "N/A") {
        errors.push(`aiComprehensiveObservation ${name}.score must be N/A when status is insufficient-data`);
      }
    }
    if (status === "evaluated" && (!Array.isArray(observation.strengths) || !observation.strengths.some((item) => String(item || "").trim()))) {
      errors.push("evaluated aiComprehensiveObservation.strengths must contain at least one item");
    }
    if (status === "evaluated" && !String(observation.improvement || "").trim()) {
      errors.push("evaluated aiComprehensiveObservation.improvement is required");
    }
    if (!Array.isArray(observation.limitations)) {
      errors.push("aiComprehensiveObservation.limitations must be an array");
    }
    if (observation.internalScore != null) {
      if (status === "insufficient-data") {
        errors.push("aiComprehensiveObservation.internalScore must be omitted when status is insufficient-data");
      } else if (!Number.isInteger(observation.internalScore) || observation.internalScore < 0 || observation.internalScore > 100) {
        errors.push("aiComprehensiveObservation.internalScore must be an integer from 0 to 100");
      }
    }
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
  const map = new Map((data.aiValue?.items || []).map((item) => [item.name, item]));
  return AI_VALUE_DIMENSIONS.map((name) => ({
    name,
    aiEvidenceScore: normalizeScore(map.get(name)?.aiEvidenceScore) ?? "N/A",
    selfScore: normalizeScore(map.get(name)?.selfScore) ?? "N/A",
    evidence: map.get(name)?.evidence || "",
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data) throw new Error("--data is required.");
  const dataPath = path.resolve(String(args.data));
  const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
  validateData(data);
  sampleModeFor(Number(data.metrics.workRecordCount), data.sampleMode);
  if (args["validate-data-only"]) {
    console.log(JSON.stringify({ status: "valid", data: dataPath }, null, 2));
    return;
  }
  if (!args.output) throw new Error("--output is required unless --validate-data-only is used.");
  const templatePath = path.resolve(String(args.template || DEFAULT_TEMPLATE));
  const outputPath = path.resolve(String(args.output));
  const qaDir = path.resolve(String(args["qa-dir"] || path.join(path.dirname(outputPath), "qa")));

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
  await rewrite(presentation, index, "slide-1-chart-title", "工作分類｜AI 工作紀錄分布");

  const categories = categoryCounts(data);
  const chart = slide1.charts.items[0];
  if (!chart) throw new Error("Template doughnut chart is missing.");
  chart.categories = categories.map((item) => item.name);
  const series = chart.series.getItemAt(0);
  series.categories = categories.map((item) => item.name);
  series.values = workCount > 0 ? categories.map((item) => item.count) : [1, 1, 1, 1];
  const categoryPercentages = categories.map((item) =>
    workCount > 0 && item.count > 0 ? Math.round((item.count / workCount) * 100) : null,
  );
  const hasSmallSlice = categoryPercentages.some(
    (percentage) => percentage != null && percentage <= 12,
  );
  chart.dataLabels.showLeaderLines = workCount > 0 && hasSmallSlice;
  for (let i = 0; i < 4; i += 1) {
    const percentage = categoryPercentages[i];
    const override = series.dataLabelOverrides.add(i);
    override.text = percentage == null ? (workCount > 0 ? " " : "—") : `${percentage}% ${categories[i].name}`;
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
統計單位：目前 Windows 使用者／員工；同一資料範圍內的多個 Codex 登入帳號合併統計，不作帳號別拆分。
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

  await rewrite(presentation, index, "slide-2-title", "Codex 工作紀錄｜代表應用與 AI Value");
  const heading =
    mode === "general"
      ? `代表工程應用｜${Math.min(3, projects.length)} 個主要專案`
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
  const observation = data.aiComprehensiveObservation;
  await rewrite(presentation, index, "slide-2-value-title-1", "AI 綜合應用觀察");
  await rewrite(presentation, index, "slide-2-value-body-1", observation.observationText);

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
  const aiAverage = scoreAverage(aiItems, "aiEvidenceScore");
  const selfAverage = scoreAverage(aiItems, "selfScore");
  const aiTitle = "AI 的證據與自評";
  await rewrite(presentation, index, "slide-2-value-title-3", aiTitle);
  const aiTable = await resolveNamed(presentation, index, "slide-2-value-table-3", "table");
  const aiRows = [["面向", "AI 證據", "同仁自評"], ...aiItems.map((item) => [item.name, String(item.aiEvidenceScore), String(item.selfScore)])];
  for (let row = 0; row < aiRows.length; row += 1) {
    for (let column = 0; column < aiRows[row].length; column += 1) aiTable.cells.set(row, column, aiRows[row][column]);
  }
  await rewrite(
    presentation,
    index,
    "slide-2-next-step",
    `AI 建議｜${clip(
      observation.improvement || "本期資料仍在累積；待有足夠工作相關紀錄後再形成個人化建議。",
      62,
    )}`,
  );

  slide2.speakerNotes.textFrame.setText(
    `本頁用於記錄 AI 是否協助實際工作，可作為個人績效與考核的參考之一；不作單一判定或員工排名。
Skill 覆蓋率：${recordsWithSkill}／${workCount}（${skillPercent}%）；同一 Skill 在同一工作最多計 1 次。
AI Value：${aiTitle}；AI 證據評分平均 ${aiAverage}；同仁自評平均 ${selfAverage}。
${aiItems.map((item) => `- ${item.name}｜AI 證據評分 ${item.aiEvidenceScore}／同仁自評 ${item.selfScore}：${item.evidence || "資料不足或不適用"}`).join("\n")}
評分只允許 1–5 或 N/A；N/A 不納入平均。AI 證據不足時使用 N/A，不代表低價值。
AI 綜合應用觀察狀態：${observation.status}；成熟度：${observation.maturityLevel}。
量化訊號：Token ${exactNumber(observation.quantitativeSignals.totalTokens)}、工作紀錄 ${observation.quantitativeSignals.workRecordCount}、使用天數 ${observation.quantitativeSignals.activeDays}／${observation.quantitativeSignals.eligibleDays}、活躍互動 ${observation.quantitativeSignals.activeMinutes} 分鐘、專案群組 ${observation.quantitativeSignals.projectGroupCount}、Skill 覆蓋率 ${observation.quantitativeSignals.skillCoverageRate}%。
${observation.dimensionAssessments.map((item) => `- ${item.name}｜${item.score}：${item.evidence || "資料不足或不適用"}`).join("\n")}
觀察優勢：${(observation.strengths || []).join("；") || "資料不足"}
改善方向：${observation.improvement || "資料不足"}
限制：${(observation.limitations || []).join("；") || "無額外限制"}
其餘專案群組：${otherProjects.length ? otherProjects.map((item) => `${item.name}（${Number(item.workRecordCount) || 0} 筆）`).join("；") : "無"}
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
