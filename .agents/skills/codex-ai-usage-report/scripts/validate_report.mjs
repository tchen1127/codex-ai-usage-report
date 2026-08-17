import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_CONTRACT = path.join(SKILL_DIR, "assets", "layout-contract.json");

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
  return import(pathToFileURL(requireFromRuntime.resolve(packageName)).href);
}

function maxDelta(actual, expected) {
  return Math.max(...expected.map((value, index) => Math.abs((actual?.[index] ?? NaN) - value)));
}

function nonWhitespaceChars(value) {
  return [...String(value || "").replace(/\s/g, "")].length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error("--input is required.");
  const input = path.resolve(String(args.input));
  const contractPath = path.resolve(String(args.contract || DEFAULT_CONTRACT));
  const reportPath = path.resolve(String(args.report || `${input}.validation.json`));
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  const fatal = [];
  const warnings = [];
  let presentation;

  try {
    const { FileBlob, PresentationFile } = await importRuntimeModule("@oai/artifact-tool");
    presentation = await PresentationFile.importPptx(await FileBlob.load(input));
  } catch (error) {
    fatal.push({ code: "unreadable-pptx", message: String(error?.message || error) });
  }

  if (presentation) {
    if (presentation.slides.items.length !== contract.slideCount) {
      fatal.push({
        code: "wrong-slide-count",
        message: `Expected ${contract.slideCount} slides, found ${presentation.slides.items.length}`,
      });
    }
    const snapshot = await presentation.inspect({
      kind: "slide,textbox,shape,table,chart",
      include: "id,slide,name,bbox,kind,text,textLines,textChars",
      maxChars: 36000,
    });
    const records = snapshot.ndjson
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    for (const expected of contract.coreObjects || []) {
      const matches = records.filter(
        (record) =>
          record.slide === expected.slide &&
          record.name === expected.name &&
          record.kind === expected.kind,
      );
      if (!matches.length) {
        fatal.push({
          code: "missing-core-object",
          message: `Slide ${expected.slide}: missing ${expected.kind} ${expected.name}`,
        });
        continue;
      }
      const drift = maxDelta(matches[0].bbox, expected.bbox);
      if (Number.isFinite(drift) && drift > Number(contract.positionTolerancePx || 2)) {
        warnings.push({
          code: "position-drift",
          message: `Slide ${expected.slide}: ${expected.name} moved by up to ${drift.toFixed(1)} px`,
        });
      }
    }
    if (!records.some((record) => record.kind === "chart")) {
      fatal.push({ code: "missing-chart", message: "No chart found in the report." });
    }
    if (!records.some((record) => record.kind === "table")) {
      fatal.push({ code: "missing-table", message: "No table found in the report." });
    }
    const observationTitle = records.find(
      (record) => record.slide === 2 && record.name === "slide-2-value-title-1" && record.kind === "textbox",
    );
    const observationBody = records.find(
      (record) => record.slide === 2 && record.name === "slide-2-value-body-1" && record.kind === "textbox",
    );
    if (!observationTitle || String(observationTitle.text || "").trim() !== "AI 綜合應用觀察") {
      fatal.push({ code: "missing-observation-title", message: "Slide 2 AI 綜合應用觀察 title is missing or invalid." });
    }
    if (!observationBody) {
      fatal.push({ code: "missing-observation-body", message: "Slide 2 AI 綜合應用觀察 body is missing." });
    } else {
      const chars = nonWhitespaceChars(observationBody.text);
      if (chars < 20 || chars > 160) {
        fatal.push({
          code: "invalid-observation-body",
          message: "AI 綜合應用觀察 must contain 20-160 non-whitespace characters.",
        });
      }
    }
    const aiValueTable = records.find(
      (record) => record.slide === 2 && record.name === "slide-2-value-table-3" && record.kind === "table",
    );
    if (!aiValueTable) fatal.push({ code: "missing-ai-value-table", message: "AI evidence and self-rating table is missing." });
  }

  const result = {
    input,
    contract: contractPath,
    status: fatal.length ? "fatal" : warnings.length ? "warning" : "pass",
    fatal,
    warnings,
    policy:
      "Warnings do not block delivery. Unreadable files, wrong slide count, missing core objects, invalid AI 綜合應用觀察, or invalid AI Value rows are fatal.",
    checkedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const textPath = reportPath.replace(/\.json$/i, ".txt");
  const lines = [
    `Status: ${result.status}`,
    `Input: ${input}`,
    ...fatal.map((item) => `FATAL ${item.code}: ${item.message}`),
    ...warnings.map((item) => `WARNING ${item.code}: ${item.message}`),
    result.policy,
  ];
  await fs.writeFile(textPath, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (fatal.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
