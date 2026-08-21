import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const START = String(args.start || "").replaceAll("/", "-");
const END = String(args.end || "").replaceAll("/", "-");
const TIMEZONE = String(args.timezone || "Asia/Taipei");
const CODEX_HOME = path.resolve(String(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")));
const SESSION_ROOTS = args["sessions-root"]
  ? [path.resolve(String(args["sessions-root"]))]
  : [path.join(CODEX_HOME, "sessions"), path.join(CODEX_HOME, "archived_sessions")];
const OUTPUT = args.output ? path.resolve(String(args.output)) : "";

if (!START || !END) throw new Error("--start and --end are required.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END)) {
  throw new Error("--start and --end must use YYYY-MM-DD.");
}
if (START > END) throw new Error("--start must not be after --end.");
if (!OUTPUT) throw new Error("--output is required.");

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateInTimezone(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function inPeriod(timestamp) {
  const localDate = dateInTimezone(timestamp);
  return localDate && localDate >= START && localDate <= END;
}

function extractInputText(payload) {
  const chunks = Array.isArray(payload?.content) ? payload.content : [];
  return chunks
    .filter((item) => item?.type === "input_text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .filter((text) => !text.startsWith("<recommended_plugins>"))
    .filter((text) => !text.startsWith("# AGENTS.md instructions"))
    .filter((text) => !text.startsWith("<environment_context>"))
    .filter((text) => !text.startsWith("<app-context>"))
    .filter((text) => !text.startsWith("<skills_instructions>"))
    .filter((text) => !text.startsWith("<permissions instructions>"))
    .map((text) =>
      text
        .replace(/<image[\s\S]*?<\/image>/gi, "[image]")
        .replace(/# Files mentioned by the user:[\s\S]*?# My request:/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function normalizeTaskKey(cwd, summary) {
  return `${cwd || ""}|${summary || ""}`
    .toLowerCase()
    .replace(/[a-z]:[\\/][^|\n]+/g, "[path]")
    .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, "[date]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function detectSkillPaths(text) {
  const names = new Set();
  if (!text || text.includes("<skills_instructions>")) return names;
  const normalized = text.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const pathPattern = /(?:^|[\s"'])[^\s"']*\/([^/\s"']+)\/SKILL\.md\b/gi;
  for (const match of normalized.matchAll(pathPattern)) {
    const name = match[1].trim();
    if (/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(name)) names.add(name);
  }
  return names;
}

function detectSkillInvocations(text) {
  const names = new Set();
  if (!text) return names;
  const normalized = String(text);
  const invocationPattern = /\$([a-z0-9][a-z0-9-]{1,80})\b/gi;
  for (const match of normalized.matchAll(invocationPattern)) names.add(match[1]);
  return names;
}

function heuristicWorkAssessment(cwd, summary) {
  const haystack = `${cwd || ""}\n${summary || ""}`.toLowerCase();
  const reasons = [];
  const workPath = /(workspace|work|engineering|研發|project|altium|pcb|bom|firmware|fpga)/i;
  const workTerms = /(schematic|schdoc|電路圖|pcb|layout|altium|kicad|bom|datasheet|規格書|元件|fpga|lvds|step|freecad|blender|dxf|3d|機構|email|翻譯|客戶|簡報|ppt|報告|docx|word|skill|plugin|mcp|github|python|script|自動化|excel|xlsx|erp|專案|規格|設計|工程|報價|需求|韌體|測試|review|debug)/i;
  const nonWorkTerms = /(食譜|餐廳|旅遊|旅行|度假|電影|影集|遊戲攻略|星座|笑話|私人日記|健身菜單|娛樂|購物清單)/i;
  let score = 0;
  if (workPath.test(cwd || "")) {
    score += 2;
    reasons.push("work-like path");
  }
  if (workTerms.test(haystack)) {
    score += 2;
    reasons.push("work terms");
  }
  if (nonWorkTerms.test(haystack)) {
    score -= 3;
    reasons.push("non-work terms");
  }
  if (summary && summary.length >= 12) score += 1;
  return {
    likelyWorkRelated: score >= 2,
    score,
    reasons,
  };
}

function estimateActivity(timestamps) {
  const points = [...new Set(timestamps)]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!points.length) return { activeMinutes: 0, activeSegments: [] };
  const threshold = 15 * 60 * 1000;
  let totalMinutes = 0;
  let segmentStart = points[0];
  let segmentEnd = points[0];
  const activeSegments = [];
  const closeSegment = () => {
    const minutes = Math.max(2, (segmentEnd - segmentStart) / 60000);
    totalMinutes += minutes;
    activeSegments.push({
      start: new Date(segmentStart).toISOString(),
      end: new Date(segmentEnd).toISOString(),
      minutes: Math.round(minutes * 10) / 10,
    });
  };
  for (let i = 1; i < points.length; i += 1) {
    if (points[i] - segmentEnd > threshold) {
      closeSegment();
      segmentStart = points[i];
    }
    segmentEnd = points[i];
  }
  closeSegment();
  return { activeMinutes: Math.round(totalMinutes * 10) / 10, activeSegments };
}

function dayRange(start, end) {
  const first = new Date(`${start}T00:00:00.000Z`);
  first.setUTCDate(first.getUTCDate() - 1);
  const last = new Date(`${end}T00:00:00.000Z`);
  last.setUTCDate(last.getUTCDate() + 1);
  const values = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    values.push({
      year: String(cursor.getUTCFullYear()),
      month: String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      day: String(cursor.getUTCDate()).padStart(2, "0"),
    });
  }
  return values;
}

async function recursiveJsonlFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
    }
  }
  return files;
}

async function candidateFiles(roots) {
  const files = [];
  for (const root of roots) {
    if (path.basename(root).toLowerCase() === "sessions") {
      for (const item of dayRange(START, END)) {
        const dir = path.join(root, item.year, item.month, item.day);
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path.join(dir, entry.name));
        }
      }
    } else {
      files.push(...(await recursiveJsonlFiles(root)));
    }
  }
  return [...new Set(files)].sort();
}

async function parseFile(file) {
  const session = {
    id: path.basename(file, ".jsonl"),
    file,
    cwd: "",
    originator: "",
    userPrompts: [],
    activityTimestamps: [],
    activeDates: new Set(),
    skills: new Set(),
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, events: 0 },
    firstTimestamp: "",
    lastTimestamp: "",
    readError: "",
  };

  const stream = fssync.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.type === "session_meta") {
        session.id = parsed.payload?.id || parsed.payload?.session_id || session.id;
        session.cwd = parsed.payload?.cwd || session.cwd;
        session.originator = parsed.payload?.originator || session.originator;
      }

      const timestamp = parsed.timestamp;
      if (!timestamp || !inPeriod(timestamp)) continue;
      session.firstTimestamp = session.firstTimestamp || timestamp;
      session.lastTimestamp = timestamp;

      if (["response_item", "event_msg", "token_count", "turn_context"].includes(parsed.type)) {
        session.activityTimestamps.push(timestamp);
        session.activeDates.add(dateInTimezone(timestamp));
      }

      const isTokenCount =
        parsed.type === "token_count" ||
        (parsed.type === "event_msg" && parsed.payload?.type === "token_count");
      if (isTokenCount) {
        const usage = parsed.payload?.info?.last_token_usage;
        if (usage && Number.isFinite(Number(usage.total_tokens))) {
          session.tokens.total += Number(usage.total_tokens) || 0;
          session.tokens.input += Number(usage.input_tokens) || 0;
          session.tokens.output += Number(usage.output_tokens) || 0;
          session.tokens.reasoning += Number(usage.reasoning_output_tokens) || 0;
          session.tokens.events += 1;
        }
      }

      if (
        parsed.type === "response_item" &&
        parsed.payload?.type === "message" &&
        parsed.payload?.role === "user"
      ) {
        const text = extractInputText(parsed.payload);
        if (text) {
          session.userPrompts.push(text.slice(0, 1200));
          for (const name of detectSkillInvocations(text)) session.skills.add(name);
        }
      }

      const payloadType = parsed.payload?.type;
      const isToolCall =
        parsed.type === "response_item" &&
        ["function_call", "custom_tool_call", "tool_call"].includes(payloadType);
      if (isToolCall) {
        for (const name of detectSkillPaths(JSON.stringify(parsed.payload))) session.skills.add(name);
      }
    }
  } catch (error) {
    session.readError = String(error?.message || error);
  }

  const summary = session.userPrompts
    .slice(0, 3)
    .join("｜")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  const internalCompanion = summary.startsWith(
    "The following is the Codex agent history whose request action you are assessing.",
  );
  const heuristic = heuristicWorkAssessment(session.cwd, summary);
  const activity = estimateActivity(session.activityTimestamps);

  return {
    id: session.id,
    file: session.file,
    cwd: session.cwd,
    originator: session.originator,
    firstTimestamp: session.firstTimestamp,
    lastTimestamp: session.lastTimestamp,
    activeDates: [...session.activeDates].filter(Boolean).sort(),
    activeMinutes: activity.activeMinutes,
    activeSegments: activity.activeSegments,
    tokens: session.tokens,
    skills: [...session.skills].sort(),
    promptSamples: session.userPrompts.slice(0, 3),
    summary,
    taskKey: normalizeTaskKey(session.cwd, summary),
    internalCompanion,
    heuristic,
    readError: session.readError || undefined,
  };
}

async function main() {
  const availableRoots = [];
  for (const root of SESSION_ROOTS) {
    const stat = await fs.stat(root).catch(() => undefined);
    if (stat?.isDirectory()) availableRoots.push(root);
  }
  if (!availableRoots.length) {
    throw new Error(`Codex sessions directories not found: ${SESSION_ROOTS.join(", ")}`);
  }
  const files = await candidateFiles(availableRoots);
  const sessions = [];
  for (const [index, file] of files.entries()) {
    const session = await parseFile(file);
    if (session.summary || session.tokens.total > 0) sessions.push(session);
    if ((index + 1) % 25 === 0) process.stderr.write(`Scanned ${index + 1}/${files.length}\n`);
  }
  const result = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    period: { start: START, end: END, timezone: TIMEZONE },
    sourceRoots: availableRoots,
    privacy: "Intermediate local evidence only. Do not attach this JSON to the final PPT or email.",
    activeTimeMethod:
      "Interaction timestamps are split when gaps exceed 15 minutes; each segment contributes at least 2 minutes.",
    tokenMethod:
      "Sum of payload.info.last_token_usage fields from token_count events inside the reporting period; cached input may be included.",
    filesScanned: files.length,
    sessionsReturned: sessions.length,
    readErrors: sessions.filter((session) => session.readError).length,
    sessions,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: OUTPUT,
        filesScanned: result.filesScanned,
        sessionsReturned: result.sessionsReturned,
        readErrors: result.readErrors,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
