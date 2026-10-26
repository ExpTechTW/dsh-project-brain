// Semantic architecture analyzer. Directories are evidence, not architecture nodes.

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|py|go|java|kt|kts|rs|cs|php|rb|swift|dart|scala|vue|svelte)$/i;
const MANIFEST_NAMES = /^(?:package\.json|pyproject\.toml|requirements\.txt|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|cargo\.toml|docker-compose\.ya?ml|compose\.ya?ml|dockerfile|makefile|pnpm-workspace\.yaml|turbo\.json|nx\.json)$/i;
const README_NAMES = /^readme(?:\.[a-z0-9]+)?$/i;
const ROLES = [
  { id: "presentation", name: "互動與展示層", kind: "presentation", order: 0, match: /(?:^|\/)(?:client|frontend|web|ui|views?|pages?|components?|screens?)(?:\/|\.|$)/i },
  { id: "interface", name: "介面與接入層", kind: "interface", order: 1, match: /(?:^|\/)(?:api|routes?|controllers?|handlers?|rpc|commands?|cli|gateway)(?:\/|\.|$)/i },
  { id: "application", name: "應用編排層", kind: "application", order: 2, match: /(?:^|\/)(?:services?|use-?cases?|application|agents?|tools?|workflows?|orchestrators?)(?:\/|\.|$)/i },
  { id: "domain", name: "核心領域層", kind: "domain", order: 3, match: /(?:^|\/)(?:core|domain|engine|business|analysis|scanner|parser|compiler)(?:\/|\.|$)/i },
  { id: "data", name: "資料與記憶層", kind: "data", order: 4, match: /(?:^|\/)(?:data|db|database|models?|schemas?|repositories?|stores?|storage|memory|cache|migrations?)(?:\/|\.|$)/i },
  { id: "integration", name: "平臺與外部整合層", kind: "integration", order: 5, match: /(?:^|\/)(?:host|integrations?|adapters?|providers?|connectors?|plugins?|infra|runtime)(?:\/|\.|$)/i },
  { id: "support", name: "工程支撐", kind: "support", order: 6, match: /(?:^|\/)(?:tests?|specs?|fixtures?|scripts?|build|config|deploy)(?:\/|\.|$)/i },
];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function hashText(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function safeId(value) { return String(value || "item").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "item"; }
function cleanText(value, limit = 600) { return String(value || "").replace(/\0/g, "").replace(/\r/g, "").trim().slice(0, limit); }
function isGeneratedOrVendor(file) {
  const path = String(file || "").replaceAll("\\", "/");
  return /(?:^|\/)(?:node_modules(?:[._-][^/]*)?|vendor|dist|build|coverage|\.next|target|out|__pycache__|\.venv|venv)(?:\/|$)/i.test(path)
    || /(?:^|\/)[^/]*(?:backup|\.bak)(?:[-_.][^/]*)?(?:\/|$)/i.test(path)
    || /(?:^|\/)dsh-project-brain\/lib(?:\/|$)/i.test(path);
}
function languageOf(path) {
  const lower = String(path || "").toLowerCase();
  if (/\.tsx?$/.test(lower)) return "typescript";
  if (/\.[cm]?jsx?$/.test(lower)) return "javascript";
  if (/\.py$/.test(lower)) return "python";
  if (/\.go$/.test(lower)) return "go";
  if (/\.java$/.test(lower)) return "java";
  if (/\.rs$/.test(lower)) return "rust";
  if (/\.vue$/.test(lower)) return "vue";
  if (/\.svelte$/.test(lower)) return "svelte";
  return "other";
}
async function readProjectFile(fs, projectPath, relativePath) {
  try {
    const root = await fs.resolve(projectPath);
    const target = await fs.resolve(relativePath, { cwd: root });
    return String(await fs.readText(target));
  } catch (e) { return ""; }
}
function extractImports(text, language) {
  const out = [];
  const add = (value) => { const item = String(value || "").trim(); if (item && !out.includes(item)) out.push(item); };
  let match;
  if (["javascript", "typescript", "vue", "svelte"].includes(language)) {
    const re = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
    while ((match = re.exec(text))) add(match[1]);
  } else if (language === "python") {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    while ((match = re.exec(text))) add(match[1] || match[2]);
  } else if (language === "go") {
    const block = (text.match(/import\s*(?:\([\s\S]*?\)|["`][^"`]+["`])/) || [""])[0];
    const re = /["`]([^"`\s]+)["`]/g;
    while ((match = re.exec(block))) add(match[1]);
  } else if (language === "java") {
    const re = /^\s*import\s+([\w.]+);/gm;
    while ((match = re.exec(text))) add(match[1]);
  }
  return out.slice(0, 60);
}
function extractSymbols(text, language) {
  const out = [];
  const add = (kind, name) => { if (name && !out.some((item) => item.name === name)) out.push({ kind, name: String(name).slice(0, 100) }); };
  let match;
  if (["javascript", "typescript", "vue", "svelte"].includes(language)) {
    const re = /(?:export\s+(?:default\s+)?)?(?:async\s+)?(class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
    while ((match = re.exec(text))) add(match[1], match[2]);
  } else if (language === "python") {
    const re = /^\s*(class|def|async\s+def)\s+([A-Za-z_]\w*)/gm;
    while ((match = re.exec(text))) add(match[1], match[2]);
  } else if (language === "go") {
    const re = /^\s*(type|func)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm;
    while ((match = re.exec(text))) add(match[1], match[2]);
  } else if (language === "java") {
    const re = /\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g;
    while ((match = re.exec(text))) add(match[1], match[2]);
  }
  return out.slice(0, 24);
}
function sourceExcerpt(text) {
  return cleanText(String(text || "").split("\n").filter((line) => !/^\s*(?:\/\/|#)\s*(?:eslint|prettier|type:|noqa)/i.test(line)).slice(0, 60).join("\n"), 1400);
}
function evidencePriority(file, scan) {
  let score = 0;
  if ((scan.entrypoints || []).some((entry) => entry.path === file)) score += 100;
  if (/(?:^|\/)(?:main|index|app|server|client|plugin|bootstrap)\.[^.]+$/i.test(file)) score += 45;
  if (/(?:scanner|analyzer|service|controller|router|store|memory|rpc|injector|engine|workflow)/i.test(file)) score += 28;
  if (String(file).split("/").length <= 3) score += 12;
  if (/(?:test|spec|fixture|mock|\.d\.ts$)/i.test(file)) score -= 35;
  return score;
}
function roleForFile(file) { return ROLES.find((role) => role.match.test(file)) || ROLES[3]; }
function friendlyComponentName(role, files) {
  const hints = files.join(" ").toLowerCase();
  if (role.id === "presentation") return /client|web|page|component/.test(hints) ? "使用者介面與視覺化" : "互動展示";
  if (role.id === "interface") return /rpc/.test(hints) ? "執行時 RPC 介面" : /cli|command/.test(hints) ? "命令與接入介面" : "介面適配";
  if (role.id === "application") return /tool/.test(hints) ? "專案能力工具集" : /agent/.test(hints) ? "Agent 編排" : "應用服務編排";
  if (role.id === "domain") return /scan|analy|parser/.test(hints) ? "專案分析引擎" : "核心業務引擎";
  if (role.id === "data") return /memory/.test(hints) ? "專案記憶與檢索" : "專案資料儲存";
  if (role.id === "integration") return /host|plugin/.test(hints) ? "DSH Host 整合" : "平臺與外部服務整合";
  return "構建、測試與釋出";
}
function localPurpose(scan) {
  if (scan.description) return cleanText(scan.description, 800);
  const stacks = Object.values(scan.techStack || {}).filter(Boolean);
  return (scan.projectName || "該專案") + (stacks.length ? " 是一個基於 " + stacks.join("、") + " 的軟體專案。" : " 是一個軟體專案，可從入口與核心元件繼續瞭解其職責。");
}

function withAliases(architecture) {
  return {
    ...architecture,
    nodes: (architecture.components || []).map((item) => ({ id: item.id, label: item.name, kind: item.type, layerId: item.layerId, description: item.responsibility, details: item.details, files: item.importantFiles || [], evidencePaths: item.evidencePaths || [], technologies: item.technologies || [], confidence: item.confidence })),
    edges: (architecture.relationships || []).map((item) => ({ ...item })),
    flows: (architecture.runtimeFlows || []).map((flow) => ({ ...flow, label: flow.name, steps: (flow.steps || []).map((step) => step.componentId) })),
  };
}

function buildLocalArchitecture(scan, evidence, previous, config) {
  const grouped = new Map();
  for (const fact of evidence.sourceFacts) {
    const role = roleForFile(fact.file);
    if (!grouped.has(role.id)) grouped.set(role.id, { role, facts: [] });
    grouped.get(role.id).facts.push(fact);
  }
  const components = [...grouped.values()].sort((a, b) => a.role.order - b.role.order).slice(0, clamp(Number(config.architectureMaxNodes) || 24, 6, 60)).map(({ role, facts }) => {
    const files = facts.map((fact) => fact.file);
    return {
      id: "component-" + role.id, name: friendlyComponentName(role, files), layerId: "layer-" + role.id, type: role.kind,
      responsibility: role.name + "：" + (facts.flatMap((fact) => fact.symbols).slice(0, 5).map((item) => item.name).join("、") || "承載相關專案能力"),
      details: "由 " + files.length + " 個關鍵原始碼檔案歸納；目錄只作為分析證據。",
      technologies: [...new Set(facts.map((fact) => fact.language))].filter((item) => item !== "other"),
      importantFiles: files.slice(0, 6), evidencePaths: files.slice(0, 12), confidence: 0.62,
    };
  });
  if (!components.length) components.push({ id: "component-project", name: "專案主體", layerId: "layer-domain", type: "domain", responsibility: "專案核心能力", details: "未檢測到可分析原始碼。", technologies: [], importantFiles: [], evidencePaths: [], confidence: 0.35 });
  const componentIds = new Set(components.map((item) => item.id));
  const layers = ROLES.filter((role) => componentIds.has("component-" + role.id)).map((role) => ({ id: "layer-" + role.id, name: role.name, responsibility: role.name, order: role.order }));
  if (!layers.length) layers.push({ id: "layer-domain", name: "核心領域層", responsibility: "專案核心能力", order: 0 });
  const relationships = [];
  for (let i = 0; i < components.length - 1; i++) relationships.push({ id: "relation-local-" + (i + 1), from: components[i].id, to: components[i + 1].id, label: "呼叫/協作", type: "uses", description: "依據常見分層方向推斷，需結合程式碼驗證", confidence: 0.42 });
  const keyFiles = evidence.sourceFacts.slice(0, 12).map((fact) => ({ path: fact.file, role: fact.symbols.length ? "定義 " + fact.symbols.slice(0, 4).map((item) => item.name).join("、") : "關鍵實現檔案", whyImportant: fact.imports.length ? "連線 " + fact.imports.slice(0, 4).join("、") : "位於專案入口或核心實現路徑", category: roleForFile(fact.file).kind }));
  const fingerprint = hashText(JSON.stringify({ files: evidence.sourceFacts.map((fact) => [fact.file, fact.hash, fact.imports]), manifests: evidence.manifests.map((item) => [item.path, item.hash]), readme: hashText(evidence.readme && evidence.readme.content), techStack: scan.techStack }));
  const changed = !previous || previous.schemaVersion !== 2 || previous.fingerprint !== fingerprint;
  const overview = { purpose: localPurpose(scan), audience: "專案開發與維護人員", category: Object.values(scan.techStack || {})[0] || "軟體專案", architectureStyle: layers.length >= 3 ? "分層架構（本地推斷）" : "模組化架構（本地推斷）", value: "幫助開發者理解專案入口、核心能力和協作邊界。" };
  const runtimeFlows = components.length >= 2 ? [{ id: "flow-main", name: "主要執行鏈路（本地推斷）", trigger: "使用者或宿主觸發專案能力", outcome: "核心能力完成並讀寫專案資料", steps: components.map((component, index) => ({ componentId: component.id, action: index === 0 ? "接收請求" : index === components.length - 1 ? "完成處理" : "處理並傳遞" })) }] : [];
  return withAliases({
    schemaVersion: 2, version: previous && previous.version && changed ? previous.version + 1 : (previous && previous.version) || 1,
    generatedAt: Date.now(), fingerprint, changed, source: "local",
    project: { name: scan.projectName || "Project", techStack: scan.techStack || {}, entrypoints: scan.entrypoints || [] },
    overview, summary: overview.purpose, layers, components, relationships, runtimeFlows, keyFiles,
    gettingStarted: ["先閱讀 README 與專案清單", "從入口檔案跟蹤主要執行鏈路", "結合關鍵檔案理解資料與平臺邊界"], designHighlights: [], risks: [],
    evidence: { readmeUsed: Boolean(evidence.readme && evidence.readme.content), manifestFiles: evidence.manifests.map((item) => item.path), sourceFilesAnalyzed: evidence.sourceFacts.length, sourceSnippetsShared: false },
    stats: { files: evidence.allFiles.length, analyzedFiles: evidence.sourceFacts.length, layers: layers.length, modules: components.length, components: components.length, edges: relationships.length, keyFiles: keyFiles.length },
    llm: { requested: false, used: false, provider: null, model: null, error: null },
  });
}

function stripCodeFence(value) { return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function withoutTrailingCommas(value) {
  const text = String(value || "");
  let out = ""; let quoted = false; let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; out += char; continue; }
    if (char === ",") {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] === "}" || text[next] === "]") continue;
    }
    out += char;
  }
  return out;
}
function balancedJsonObjects(value) {
  const text = String(value || "");
  const out = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) { out.push(text.slice(start, index + 1)); start = index; break; }
        if (depth < 0) break;
      }
    }
  }
  return out;
}
export function parseArchitectureJson(value) {
  const text = String(value || "").trim();
  const candidates = [stripCodeFence(text)];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(text))) candidates.push(match[1].trim());
  candidates.push(...balancedJsonObjects(text));
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    try { return JSON.parse(candidate); } catch (e) {}
    try { return JSON.parse(withoutTrailingCommas(candidate)); } catch (e) {}
  }
  throw Object.assign(new Error("LLM returned invalid architecture JSON"), {
    code: "ARCHITECTURE_LLM_INVALID_JSON",
    details: { receivedChars: text.length, balancedObjectFound: balancedJsonObjects(text).length > 0 },
  });
}
function strings(value, max, limit) { return (Array.isArray(value) ? value : []).map((item) => cleanText(item, limit)).filter(Boolean).slice(0, max); }
function parseLlmArchitecture(text, base, knownFiles) {
  const parsed = parseArchitectureJson(text);
  const rawLayers = Array.isArray(parsed.layers) ? parsed.layers : [];
  const layers = rawLayers.slice(0, 10).map((item, index) => ({ id: "layer-" + safeId(item.id || item.name || index + 1), name: cleanText(item.name, 80) || "架構層 " + (index + 1), responsibility: cleanText(item.responsibility, 500), order: index }));
  if (!layers.length) throw Object.assign(new Error("LLM architecture has no layers"), { code: "ARCHITECTURE_LLM_SCHEMA" });
  const layerByRaw = new Map();
  rawLayers.slice(0, 10).forEach((item, index) => [item && item.id, item && item.name, layers[index].id].filter(Boolean).forEach((key) => layerByRaw.set(String(key), layers[index].id)));
  const known = new Set(knownFiles);
  const rawComponents = Array.isArray(parsed.components) ? parsed.components : [];
  const components = rawComponents.slice(0, 18).map((item, index) => {
    const evidencePaths = strings(item.evidencePaths, 12, 240).filter((path) => known.has(path));
    const importantFiles = strings(item.importantFiles, 8, 240).filter((path) => known.has(path));
    return { id: "component-" + safeId(item.id || item.name || index + 1), name: cleanText(item.name, 100) || "核心元件 " + (index + 1), layerId: layerByRaw.get(String(item.layerId || item.layer || "")) || layers[Math.min(index, layers.length - 1)].id, type: cleanText(item.type, 40) || "component", responsibility: cleanText(item.responsibility, 700), details: cleanText(item.details, 1200), technologies: strings(item.technologies, 10, 80), importantFiles: importantFiles.length ? importantFiles : evidencePaths.slice(0, 5), evidencePaths, confidence: clamp(Number(item.confidence) || 0.78, 0.2, 1) };
  }).filter((item) => item.name && item.responsibility);
  if (components.length < 2) throw Object.assign(new Error("LLM architecture has too few components"), { code: "ARCHITECTURE_LLM_SCHEMA" });
  const componentIds = new Set(components.map((item) => item.id));
  const rawToId = new Map();
  rawComponents.slice(0, 18).forEach((item, index) => { if (components[index]) [item && item.id, item && item.name, components[index].id].filter(Boolean).forEach((key) => rawToId.set(String(key), components[index].id)); });
  const relationships = (Array.isArray(parsed.relationships) ? parsed.relationships : []).slice(0, 36).map((item, index) => ({ id: "relation-" + (index + 1), from: rawToId.get(String(item.from || "")), to: rawToId.get(String(item.to || "")), label: cleanText(item.label, 80) || "呼叫", type: cleanText(item.type, 40) || "uses", description: cleanText(item.description, 500), confidence: clamp(Number(item.confidence) || 0.75, 0.2, 1) })).filter((item) => componentIds.has(item.from) && componentIds.has(item.to) && item.from !== item.to);
  const runtimeFlows = (Array.isArray(parsed.runtimeFlows) ? parsed.runtimeFlows : []).slice(0, 8).map((flow, index) => ({ id: "flow-" + (index + 1), name: cleanText(flow.name, 100) || "執行流程 " + (index + 1), trigger: cleanText(flow.trigger, 400), outcome: cleanText(flow.outcome, 400), steps: (Array.isArray(flow.steps) ? flow.steps : []).slice(0, 12).map((step) => ({ componentId: rawToId.get(String(step.componentId || step.component || "")), action: cleanText(step.action, 400), file: known.has(step.file) ? step.file : null })).filter((step) => componentIds.has(step.componentId)) })).filter((flow) => flow.steps.length >= 2);
  const keyFiles = (Array.isArray(parsed.keyFiles) ? parsed.keyFiles : []).slice(0, 16).map((item) => ({ path: cleanText(item.path, 240), role: cleanText(item.role, 300), whyImportant: cleanText(item.whyImportant, 600), category: cleanText(item.category, 50) })).filter((item) => known.has(item.path));
  const overviewInput = parsed.overview || {};
  const result = { ...base, source: "hybrid", overview: { purpose: cleanText(overviewInput.purpose, 1200) || base.overview.purpose, audience: cleanText(overviewInput.audience, 500) || base.overview.audience, category: cleanText(overviewInput.category, 160) || base.overview.category, architectureStyle: cleanText(overviewInput.architectureStyle, 300) || base.overview.architectureStyle, value: cleanText(overviewInput.value, 800) || base.overview.value }, summary: cleanText(parsed.summary, 1600) || cleanText(overviewInput.purpose, 1200) || base.summary, layers, components, relationships, runtimeFlows, keyFiles: keyFiles.length ? keyFiles : base.keyFiles, gettingStarted: strings(parsed.gettingStarted, 8, 600), designHighlights: strings(parsed.designHighlights, 10, 600), risks: strings(parsed.risks, 10, 600) };
  result.stats = { ...base.stats, layers: layers.length, modules: components.length, components: components.length, edges: relationships.length, keyFiles: result.keyFiles.length };
  return withAliases(result);
}

function llmPrompt(base, evidence, includeSource) {
  const payload = { project: base.project, localOverview: base.overview, readme: evidence.readme ? { path: evidence.readme.path, content: evidence.readme.content } : null, manifests: evidence.manifests.slice(0, 8).map((item) => ({ path: item.path, content: item.content })), sourceFacts: evidence.sourceFacts.slice(0, 24).map((fact) => ({ path: fact.file, language: fact.language, imports: fact.imports, symbols: fact.symbols, ...(includeSource ? { excerpt: fact.excerpt } : {}) })), entrypoints: base.project.entrypoints, techStack: base.project.techStack };
  return [
    "你是一名資深軟體架構師。目標是讓第一次接觸倉庫的開發者在幾分鐘內理解系統設計，而不是複述目錄樹。",
    "回答專案做什麼、服務誰、採用什麼架構風格、有哪些概念層和核心元件、元件如何協作、主要執行流程、關鍵檔案、設計亮點與風險。",
    "規則：元件必須是有職責的概念元件，禁止把 src、packages/foo、scripts 等目錄名直接當元件名；路徑只能作為 evidencePaths/importantFiles/keyFiles 證據。忽略 vendor、備份、生成物和測試夾具干擾。只陳述證據支援的內容。輸出中文嚴格 JSON，不要 Markdown/HTML/Mermaid。",
    "JSON 格式：" + JSON.stringify({ overview: { purpose: "專案解決什麼問題", audience: "使用者", category: "專案型別", architectureStyle: "架構風格", value: "核心價值" }, summary: "整體架構說明", layers: [{ id: "interface", name: "介面層", responsibility: "層職責" }], components: [{ id: "runtime-bridge", name: "執行時橋接", layerId: "interface", type: "service", responsibility: "職責", details: "邊界與協作", technologies: ["技術"], importantFiles: ["真實相對路徑"], evidencePaths: ["真實相對路徑"], confidence: 0.85 }], relationships: [{ from: "runtime-bridge", to: "memory-store", label: "讀寫", type: "data-flow", description: "關係", confidence: 0.8 }], runtimeFlows: [{ name: "初始化流程", trigger: "觸發條件", outcome: "結果", steps: [{ componentId: "runtime-bridge", action: "動作", file: "可選真實路徑" }] }], keyFiles: [{ path: "真實相對路徑", role: "檔案角色", whyImportant: "為什麼先讀", category: "entry|core|data|integration|config" }], gettingStarted: ["閱讀/除錯順序"], designHighlights: ["設計亮點"], risks: ["風險或不確定項"] }),
    "專案證據：" + JSON.stringify(payload),
  ].join("\n");
}

function repairArchitecturePrompt(value) {
  return [
    "下面是一次軟體架構分析的模型輸出，但它不是可解析的嚴格 JSON。",
    "請只修復 JSON 語法和缺失的閉合結構，保留已有事實與相對檔案路徑；不要新增解釋、Markdown 或程式碼圍欄。",
    "最終只能輸出一個 JSON 物件，並確保至少包含非空 layers 和至少兩個 components。",
    "待修復輸出：",
    cleanText(value, 24000),
  ].join("\n");
}

export async function streamLlmText(llm, route, prompt, sessionId, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("architecture LLM timeout")), timeoutMs || 60000);
  const chunks = new Map(); const completed = new Map();
  let lastFinishKind = null;
  try {
    const request = {
      provider: route.provider,
      model: route.model,
      system: options.system || "Produce an evidence-based conceptual software architecture as strict JSON only.",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }], source: { kind: "plugin", plugin: "dsh-project-brain" } }],
      maxTokens: options.maxTokens || 6200,
      purpose: options.purpose || "project-architecture",
      ...(sessionId ? { sessionId } : {}),
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
      signal: controller.signal,
    };
    for await (const chunk of llm.stream(request)) {
      if (!chunk) continue;
      if (chunk.type === "text-delta") chunks.set(chunk.index, (chunks.get(chunk.index) || "") + String(chunk.text || ""));
      else if (chunk.type === "block-end" && chunk.block && chunk.block.type === "text") completed.set(chunk.index, String(chunk.block.text || ""));
      else if (chunk.type === "finish" && chunk.reason && chunk.reason.kind) lastFinishKind = chunk.reason.kind;
    }
    if (lastFinishKind && lastFinishKind !== "stop") throw Object.assign(new Error("architecture LLM finished with " + lastFinishKind), { code: "ARCHITECTURE_LLM_FINISH", details: { finishKind: lastFinishKind } });
    const indexes = [...new Set([...chunks.keys(), ...completed.keys()])].sort((a, b) => a - b);
    const text = indexes.map((index) => chunks.get(index) || completed.get(index) || "").join("").trim();
    if (!text) throw Object.assign(new Error("architecture LLM returned no text"), { code: "ARCHITECTURE_LLM_EMPTY" });
    return text;
  } finally { clearTimeout(timer); }
}

// 把內部 error code 翻成「人話原因 + 下一步動作」
//   reasonText: 一句話中文，解釋發生了什麼（不含動作）
//   actionKey: 客戶端按這個決定渲染哪種引導
//     - retry_scan       一鍵「重新掃描」按鈕
//     - send_message     引導使用者先發一條訊息（DSH 才有模型路由）
//     - check_settings   引導使用者檢查 DSH 模型路由設定
function explainLlmError(error) {
  const err = error || {};
  const code = err.code || "ARCHITECTURE_LLM_FAILED";
  const message = String(err.message || err);
  const details = err.details && typeof err.details === "object" ? err.details : {};
  // 1) 路由/服務不可用
  if (code === "ARCHITECTURE_LLM_SERVICE_UNAVAILABLE") {
    return { code, message, reasonText: "DSH 未把模型服務暴露給專案腦", actionKey: "check_settings" };
  }
  if (code === "ARCHITECTURE_LLM_SESSION_ROUTE_UNAVAILABLE") {
    return { code, message, reasonText: "當前會話還沒有可用的模型路由", actionKey: "send_message" };
  }
  // 2) 流結束原因（FINISH）—— 按 reason.kind 區分人話
  if (code === "ARCHITECTURE_LLM_FINISH") {
    const kind = String(details.finishKind || "").toLowerCase();
    if (kind === "length") return { code, message, reasonText: "模型輸出超過 max_tokens 被截斷，未能寫出完整 JSON", actionKey: "retry_scan" };
    if (kind === "content_filter" || kind === "safety") return { code, message, reasonText: "模型因內容安全策略中斷輸出", actionKey: "retry_scan" };
    if (kind === "cancel") return { code, message, reasonText: "呼叫被主動取消（可能超時）", actionKey: "retry_scan" };
    if (kind === "error" || kind === "upstream") return { code, message, reasonText: "模型上游返回錯誤（網路或服務異常）", actionKey: "retry_scan" };
    return { code, message, reasonText: "模型未正常結束（" + (kind || "未知原因") + "）", actionKey: "retry_scan" };
  }
  // 3) 輸出內容類
  if (code === "ARCHITECTURE_LLM_EMPTY") return { code, message, reasonText: "模型返回了空內容", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_INVALID_JSON") return { code, message, reasonText: "模型輸出無法解析為 JSON（自動修復也已失敗）", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_SCHEMA") return { code, message, reasonText: "模型輸出不符合架構 schema", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_TIMEOUT" || /timeout/i.test(message)) return { code, message, reasonText: "呼叫超時（預設 60 秒）", actionKey: "retry_scan" };
  // 4) 兜底
  return { code, message, reasonText: "架構生成失敗：" + (message || "未知錯誤"), actionKey: "retry_scan" };
}

async function collectEvidence(fs, projectPath, scan, config) {
  const allFiles = (scan.files || []).filter((file) => !isGeneratedOrVendor(file));
  const readmePath = allFiles.find((file) => README_NAMES.test(file.split("/").pop()));
  const readme = readmePath ? { path: readmePath, content: cleanText(await readProjectFile(fs, projectPath, readmePath), 9000) } : null;
  const manifests = [];
  for (const path of allFiles.filter((file) => MANIFEST_NAMES.test(file.split("/").pop())).slice(0, 12)) {
    const content = cleanText(await readProjectFile(fs, projectPath, path), 6000);
    manifests.push({ path, content, hash: hashText(content) });
  }
  const sourceFiles = allFiles.filter((file) => SOURCE_EXTENSIONS.test(file)).sort((a, b) => evidencePriority(b, scan) - evidencePriority(a, scan) || a.localeCompare(b)).slice(0, clamp(Number(config.architectureMaxFiles) || 240, 20, 1000));
  const sourceFacts = []; let totalBytes = 0;
  for (const file of sourceFiles) {
    if (totalBytes >= 1200000) break;
    const text = (await readProjectFile(fs, projectPath, file)).slice(0, 100000); totalBytes += text.length;
    const language = languageOf(file);
    sourceFacts.push({ file, language, imports: extractImports(text, language), symbols: extractSymbols(text, language), excerpt: sourceExcerpt(text), hash: hashText(text) });
  }
  return { allFiles, readme, manifests, sourceFacts };
}

export function resolveSessionRoute(session) {
  // request/context is the canonical resolved route, but it is only appended
  // after DSH has prepared a model call.  During a newly-created Session the
  // request/header event can already contain the selected provider/model, so
  // use it as the second source instead of prematurely falling back to local.
  try {
    const context = session && typeof session.requestContext === "function" ? session.requestContext() : null;
    if (context && context.provider && context.model) return { provider: context.provider, model: context.model };
  } catch (e) {}
  try {
    const header = session && typeof session.requestHeader === "function" ? session.requestHeader() : null;
    const config = header && header.config;
    if (config && config.provider && config.model) return { provider: config.provider, model: config.model };
  } catch (e) {}
  // Some host bridges expose a Session-shaped projection rather than the
  // class methods.  Reading the immutable event log keeps this compatible
  // without trusting any browser-provided model identifier.
  try {
    const events = session && Array.isArray(session.events) ? session.events : [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index] || {};
      if (event.type === "request/context") {
        const data = event.data || {};
        if (data.provider && data.model) return { provider: data.provider, model: data.model };
      }
      if (event.type === "request/header") {
        const data = event.data || {};
        const eventConfig = (data.header && data.header.config) || data.config;
        if (eventConfig && eventConfig.provider && eventConfig.model) {
          return { provider: eventConfig.provider, model: eventConfig.model };
        }
      }
    }
  } catch (e) {}
  return null;
}
export function createLlmRuntime(ctx, initialService = null) {
  let service = initialService && typeof initialService.stream === "function" ? initialService : null;
  if (!service && ctx) {
    try {
      const current = ctx.get ? ctx.get("llm") : ctx.llm;
      if (current && typeof current.stream === "function") service = current;
    } catch (e) {}
  }
  // `llm` is declared in the plugin's static inject list, so no dynamic child
  // fiber is needed here.  Do not register `effect(() => { service = null })`:
  // Cordis executes an effect factory immediately, which used to clear the
  // freshly resolved service during startup and caused a permanent local-only
  // fallback. The parent plugin fiber already owns this service reference.
  return { get: () => service };
}
export async function buildArchitecture({ fs, projectPath, scan, previous, config = {}, llm, route, getRoute, sessionId } = {}) {
  const evidence = await collectEvidence(fs, projectPath, scan, config);
  const local = buildLocalArchitecture(scan, evidence, previous, config);
  const requested = config.architectureLlmEnabled !== false;
  const includeSource = config.architectureLlmIncludeSource !== false;
  local.llm.requested = requested;
  if (!requested) return local;
  if (!local.changed && previous && previous.schemaVersion === 2 && previous.llm && previous.llm.used) return { ...previous, generatedAt: Date.now(), changed: false };
  if (!llm || typeof llm.stream !== "function") {
    local.llm.error = explainLlmError({ code: "ARCHITECTURE_LLM_SERVICE_UNAVAILABLE", message: "DSH 未向外掛提供 LLM 服務，已生成本地概念架構", details: { serviceAvailable: false, routeAvailable: Boolean(route) } });
    return local;
  }
  // Evidence collection can take a moment. Resolve the route again here so a
  // Session that was still preparing its first model call when scanning began
  // can reuse that route once it becomes available.
  if (!route && typeof getRoute === "function") {
    try { route = getRoute(); } catch (e) { route = null; }
  }
  if (!route) {
    local.llm.error = explainLlmError({ code: "ARCHITECTURE_LLM_SESSION_ROUTE_UNAVAILABLE", message: "當前 Session 尚未產生可複用的模型路由，請先完成一次對話後重試", details: { serviceAvailable: true, routeAvailable: false, sessionId: sessionId || null } });
    return local;
  }
  local.llm.provider = route.provider; local.llm.model = route.model;
  try {
    const text = await streamLlmText(llm, route, llmPrompt(local, evidence, includeSource), sessionId, config.architectureLlmTimeoutMs || 60000);
    let enriched; let repaired = false;
    try {
      enriched = parseLlmArchitecture(text, local, evidence.allFiles);
    } catch (firstError) {
      if (firstError.code !== "ARCHITECTURE_LLM_INVALID_JSON" && firstError.code !== "ARCHITECTURE_LLM_SCHEMA") throw firstError;
      const repairedText = await streamLlmText(
        llm,
        route,
        repairArchitecturePrompt(text),
        sessionId,
        Math.min(config.architectureLlmTimeoutMs || 60000, 45000),
        { purpose: "project-architecture-json-repair", maxTokens: 6200, system: "Repair the supplied architecture output into one strict JSON object. Output JSON only." },
      );
      enriched = parseLlmArchitecture(repairedText, local, evidence.allFiles);
      repaired = true;
    }
    enriched.llm = { requested: true, used: true, provider: route.provider, model: route.model, attempts: repaired ? 2 : 1, repaired, error: null };
    enriched.evidence = { ...local.evidence, sourceSnippetsShared: includeSource };
    return enriched;
  } catch (error) { local.llm.error = explainLlmError(error); return local; }
}
const LOCK_NAMES = /^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|cargo\.lock|go\.sum|composer\.lock|poetry\.lock)$/i;
const CHANGELOG_NAMES = /^changelog(?:\.[a-z0-9]+)?$/i;
function fileNameOf(file) {
  return String(file || "").replaceAll("\\", "/").split("/").pop() || "";
}
function isTestPath(file) {
  const path = String(file || "").replaceAll("\\", "/");
  return /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)/i.test(path) || /\.(?:test|spec)\./i.test(path);
}
export function sourceChangeFiles(files) {
  return (files || []).some((file) => !isGeneratedOrVendor(file) && SOURCE_EXTENSIONS.test(file));
}
// 約定入口檔名：跨語言通用（js/ts 的 index、go 的 main、python 的 __init__/__main__、rust 的 mod/lib）
const ENTRY_BASENAMES = /^(?:index|main|app|server|mod|lib|__init__|__main__)$/i;
function normalizeTriggerPath(file) {
  return String(file || "").replaceAll("\\", "/").replace(/^\.\//, "");
}
function entrypointPathSet(entrypoints) {
  const set = new Set();
  for (const item of entrypoints || []) {
    const raw = typeof item === "string" ? item : (item && item.path);
    const type = item && typeof item === "object" ? String(item.type || "") : "";
    if (type === "script") continue;
    const path = normalizeTriggerPath(raw);
    // 「npm run build」這類指令碼入口不是檔案，不能當觸發源
    if (!path || (/\s/.test(path) && !path.includes("/"))) continue;
    set.add(path.toLowerCase());
  }
  return set;
}
// 只有「架構可能真的變了」才值得重跑 LLM：manifest、宣告入口、約定入口檔案、原始碼檔案增刪。
// 普通原始碼改內容一律不觸發（寧可漏觸發，也不要因為改一行 UI 就跑一次 LLM）。
export function architectureTriggerFiles(files, options = {}) {
  const entrypoints = entrypointPathSet(options && options.entrypoints);
  const structural = new Set();
  for (const change of (options && options.changes) || []) {
    const type = change && change.type;
    if (type !== "added" && type !== "removed") continue;
    const path = normalizeTriggerPath(change && change.path);
    if (path) structural.add(path.toLowerCase());
  }
  const candidates = (files && files.length) ? files : ((options && options.changes) || []).map((c) => c && c.path);
  return (candidates || []).some((file) => {
    if (!file || isGeneratedOrVendor(file) || isTestPath(file)) return false;
    const path = normalizeTriggerPath(file);
    const name = fileNameOf(path);
    if (README_NAMES.test(name) || LOCK_NAMES.test(name) || CHANGELOG_NAMES.test(name)) return false;
    if (MANIFEST_NAMES.test(name) || /^cordis\.patch\.ya?ml$/i.test(name)) return true;
    if (entrypoints.has(path.toLowerCase())) return true;
    if (!SOURCE_EXTENSIONS.test(path)) return false;
    if (ENTRY_BASENAMES.test(name.replace(/\.[^.]+$/, ""))) return true;
    if (structural.has(path.toLowerCase())) return true;
    return false;
  });
}
export function architectureRelevantFiles(files, options) {
  return architectureTriggerFiles(files, options);
}
