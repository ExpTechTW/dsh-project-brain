// 簡易 esbuild 構建指令碼：把 src/index.js 和 src/client.js 各自打成單檔案
// 產物輸出到 dsh-project-brain/lib/{index,client}.js
// P0.2c-fix：build 接受 --workspace=<path> 引數，inline **該 workspace** 的 .project-brain/ 資料
// 修復"切專案仍顯示 dsh-project-brain 自己內容"的 bug
// P0.4.1：embed 真實 stats（todo/memory）+ Dashboard 全量資料（timelineAll/memoriesAll/todos）
// P0.4.2-final：**架構事實** —— 靜態 workspace client 下 host.call 不存在（typeof host === 'undefined'），
//   webServer route 被 DSH 靜態 server fallback 搶先 404（路徑衝突）。靜態 plugin fiber 沒 host 資料通道。
//   **最終方案：build 時列舉所有 DSH workspace（~/.dsh/storages/workspace.json）下的 .project-brain/，
//   inline 雙 map：sessionId→workspaceId + workspaceId→[previewData]。client 啟動時
//   用 props.sessionId 查表 → 精確命中當前 session 所屬 workspace 的預覽資料 → 切換 workspace 即更新**。
//   已生成直接讀（純檔案 IO，零 token），未生成顯示 Onboarding。
// 用法：
//   node build.js                                # 釋出安全模式：不嵌入本機專案資料
//   node build.js --workspace-all                # 開發模式：掃描 DSH 所有 workspace
//   node build.js --workspace=/path/to/specific  # 單 workspace 模式（向後相容）
//   node build.js --workspace-root=/home/user    # 自定義 DSH state 目錄（預設 ~/.dsh）
//
// loadProjectData(workspace) 已匯出，供 scripts/smoke-test.mjs 離線驗證。

import { build, context } from "esbuild";

// v0.4.15：build-time 嵌入智慧續接建議
// 複用 host/suggest.js 的純規則路徑；失敗降級，返回 null 讓 client 端 fallback 拉 RPC
function buildSuggestForBuild({ project, memories, todos, timeline, architecture }) {
  try {
    const brain = { project: project || null, memories: memories || [], todos: todos || [], timeline: timeline || [], architecture: architecture || null };
    const out = buildLocalSuggestion(brain, Date.now());
    if (out && out.ok && out.data) {
      return Object.assign({}, out.data, { built: true });
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 合併 architecture.technologies 到 scan.techStack / scan.stack
// 實現見 src/stack-taxonomy.js，build embed 與 runtime preview 共用
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "os";
import { todoStats, activeTodos, techStackToType, isCoreMemory } from "./src/host/store/brain-logic.js";
import { sanitizeProjectDescription } from "./src/scanner.js";
import { mergeStackWithArchitecture, mergeTechStackWithArchitecture } from "./src/stack-taxonomy.js";
import { buildLocalSuggestion } from "./src/host/suggest.js";
import { buildProjectBriefing } from "./src/host/memory/briefing.js";
import { buildSessionGraph } from "./src/host/memory/session-graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(__dirname, "dsh-project-brain");
const projectRoot = __dirname;  // dsh-project-brain 自己（workspace 沒指定時的 fallback）
const watch = process.argv.includes("--watch");

// 解析 --workspace=<path> 引數
function getWorkspaceArg() {
  const arg = process.argv.find((a) => a.startsWith("--workspace="));
  if (!arg) return null;
  return arg.slice("--workspace=".length);
}
const workspacePath = getWorkspaceArg();
const workspaceAll = process.argv.includes("--workspace-all");

// --workspace-root=<path>：DSH state 目錄（預設 ~/.dsh）
function getWorkspaceRootArg() {
  const arg = process.argv.find((a) => a.startsWith("--workspace-root="));
  if (!arg) return null;
  return arg.slice("--workspace-root=".length);
}
const workspaceRoot = getWorkspaceRootArg() || join(homedir(), ".dsh");

// DSH 已經安裝在 peer 依賴裡；構建時不要把這些打進 bundle
const EXTERNAL = [
  "@deepseek-ai/cordis",
  "@deepseek-ai/cordis/*",
  "@deepseek-ai/dsh-tools",
  "@deepseek-ai/dsh-*",
  "@deepseek-ai/schemastery",
];

function readJsonlFile(filePath) {
  if (!existsSync(filePath)) return [];
  const out = [];
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (e) { /* skip bad line */ }
  }
  return out;
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch (e) { return null; }
}

function sortRecentDesc(list, key) {
  return (list || []).slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
}

// ─── P0.4.1 build-time data injection ───
// 讀 .project-brain/ 四類資料，決定 client 渲染什麼。
// 沒 .project-brain -> Onboarding 佔位；有 -> 真實資料 inline。
export function loadProjectData(workspace) {
  const root = workspace || projectRoot;
  const brainDir = join(root, ".project-brain");
  const projPath = join(brainDir, "project.json");
  if (!existsSync(projPath)) {
    return {
      generatedAt: Date.now(),
      initialized: false,
      project: null,
      phase: null,
      recentActivity: [],
      memories: [],
      memoriesAll: [],
      todos: [],
      timelineAll: [],
      architecture: null,
      stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 },
    };
  }
  try {
    const raw = readJsonFile(projPath);
    if (!raw || raw.__error) throw new Error(raw ? raw.__error : "empty project.json");
    const architecture = readJsonFile(join(brainDir, "architecture.json"));

    // timeline（全部，recent-first，最多 50）
    const timelineAll = sortRecentDesc(readJsonlFile(join(brainDir, "timeline.jsonl")), "occurredAt").slice(0, 50);
    const recentActivity = timelineAll.slice(0, 5).map((e) => ({
      id: e.id, title: e.title, occurredAt: e.occurredAt, eventType: e.eventType,
    }));

    // memory（Top3 預覽 + 全部給 Dashboard）
    const memoriesRaw = readJsonlFile(join(brainDir, "memory.jsonl"));
    const coreMemories = memoriesRaw.filter(isCoreMemory);
    const dormantMemories = memoriesRaw.filter((m) => m && m.status === "dormant");
    const memoriesAll = coreMemories.concat(dormantMemories)
      .slice()
      .sort((a, b) => {
        const ac = isCoreMemory(a) ? 0 : 1;
        const bc = isCoreMemory(b) ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return (b.importance || 0) - (a.importance || 0) || (b.createdAt || 0) - (a.createdAt || 0);
      })
      .slice(0, 50);
    const memories = coreMemories.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 3);

    // todo（真實 stats + Dashboard 全量，active 優先）
    const todosAll = readJsonlFile(join(brainDir, "todo.jsonl"));
    const stats = todoStats(todosAll);
    const todosActive = activeTodos(todosAll);
    const todosDone = todosAll.filter((t) => t && t.status === "done");
    const todos = todosActive.concat(todosDone).slice(0, 50);

    // phase：有 todo 資料時用任務進度
    const activeForPhase = todosAll.filter((t) => t && t.status !== "cancelled");
    const inProgress = todosAll.filter((t) => t.status === "in_progress");
    const phase = activeForPhase.length > 0
      ? {
          title: inProgress.length > 0 ? "進行中：" + inProgress[0].title : "待辦 " + (stats.pendingTodos) + " 項",
          progress: { done: stats.completedTodos, total: activeForPhase.length },
        }
      : {
          title: "已掃描（" + (raw.entrypoints ? raw.entrypoints.length : 0) + " 個入口）",
          progress: { done: 1, total: 1 },
        };

    return {
      generatedAt: Date.now(),
      initialized: true,
      project: {
        id: raw.id,
        name: raw.name || "(unnamed)",
        type: techStackToType(raw.techStack),
        description: sanitizeProjectDescription(raw.description) || "",
        techStack: raw.techStack || {},
        // v1.2.x：stack 是新 schema（主視野：框架/中介軟體/執行時）；techStack 保留為底層資料
        // 注意：合併 LLM 後的 stack 在頂層 stack 欄位定義；此處同步引用以保持 project 檢視一致
        stack: mergeStackWithArchitecture(raw.stack || {}, architecture),
        structure: raw.structure || [],
        tooling: raw.tooling || [],
        languages: raw.languages || {},
        entrypoints: raw.entrypoints || [],
        lastUpdateAt: raw.updatedAt || raw.lastScannedAt || Date.now(),
        architectureStale: Boolean(raw.architectureStale),
      },
      phase: phase,
      recentActivity: recentActivity.length > 0 ? recentActivity : [
        {
          id: "scan",
          title: "完成 project_init 掃描（" + (raw.languages ? Object.keys(raw.languages).join("/") : "") + "）",
          occurredAt: raw.lastScannedAt || Date.now(),
          eventType: "init",
        },
      ],
      memories: memories,
      memoriesAll: memoriesAll,
      todos: todos,
      timelineAll: timelineAll,
      architecture: architecture,
      // 合併 architecture.technologies 到 techStack 欄位（v0.4.14 增強）
      // architecture.json 裡的 components[].technologies 含 LLM 識別的技術名，比 scan.techStack 更準確
      techStack: mergeTechStackWithArchitecture(raw.techStack || {}, architecture),
      // v1.2.x：stack 是新 schema（主視野：框架/中介軟體/執行時），同樣合併 LLM 識別的技術
      stack: mergeStackWithArchitecture(raw.stack || {}, architecture),
      stats: {
        pendingTodos: stats.pendingTodos,
        completedTodos: stats.completedTodos,
        decisions: coreMemories.filter((m) => m.type === "decision").length,
      },
      // v0.4.15：build-time 嵌入智慧續接建議（僅本地規則，不調 LLM）
      suggestion: buildSuggestForBuild({
        project: raw,
        memories: coreMemories,
        todos: todosAll,
        timeline: timelineAll,
        architecture,
      }),
      briefing: buildProjectBriefing({
        project: raw,
        architecture,
        timeline: timelineAll,
        memories: memoriesRaw,
        todos: todosAll,
        architectureStale: Boolean(raw.architectureStale),
      }),
      sessionGraph: buildSessionGraph({
        timeline: timelineAll,
        memories: memoriesRaw,
        todos: todosAll,
      }),
    };
  } catch (e) {
    return {
      generatedAt: Date.now(),
      initialized: false,
      project: null,
      phase: null,
      recentActivity: [],
      memories: [],
      memoriesAll: [],
      todos: [],
      timelineAll: [],
      architecture: null,
      stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 },
      _error: String((e && e.message) || e),
    };
  }
}

const SHARED_OPTIONS = {
  bundle: true,
  target: "node22",
  platform: "node",
  sourcemap: true,
  logLevel: "info",
  external: EXTERNAL,
};

// ─── P0.4.2-final: 多 workspace scan ───
// 掃 DSH ~/.dsh/storages/workspace.json，對每個 workspace.path 遞迴 .project-brain/
// 返回 { sessionToWorkspaceId, workspaceProjects: { [wsId]: [previewData, ...] }, allCodegraphs }
function loadAllWorkspacesData(dshRootArg) {
  const root = dshRootArg;
  const stateFile = join(root, "storages", "workspace.json");
  const result = {
    sessionToWorkspaceId: {},
    workspaceProjects: {}, // workspaceId -> [previewData]
    workspacePaths: {}, // workspaceId -> path
    dshRoot: root,
  };
  if (!existsSync(stateFile)) {
    return { ...result, _error: "workspace.json not found at " + stateFile };
  }
  let state;
  try { state = JSON.parse(readFileSync(stateFile, "utf8")); }
  catch (e) { return { ...result, _error: "parse workspace.json failed: " + String((e && e.message) || e) }; }

  const tables = (state && state.tables && state.tables.workspaces) || {};
  const order = (state && state.global && state.global.workspaceIds) || Object.keys(tables);

  for (const wsId of order) {
    const ws = tables[wsId];
    if (!ws || !ws.path) continue;
    result.workspacePaths[wsId] = ws.path;
    const projects = [];
    // 遞迴（限深 4）掃該 workspace path 下的所有 .project-brain/
    const brainFiles = findBrainsUnder(ws.path, 4);
    for (const projRootPath of brainFiles) {
      const preview = loadProjectData(projRootPath);
      if (preview) {
        preview._workspaceId = wsId;
        preview._workspacePath = ws.path;
        preview._projectRootPath = projRootPath;
        projects.push(preview);
      }
    }
    result.workspaceProjects[wsId] = projects;
    // sessionId -> workspaceId（用 workspace.json 裡 sessionIds）
    if (Array.isArray(ws.sessionIds)) {
      for (const sid of ws.sessionIds) {
        result.sessionToWorkspaceId[sid] = wsId;
      }
    }
  }
  return result;
}

function findBrainsUnder(rootPath, maxDepth) {
  const out = [];
  function walk(p, depth) {
    if (depth > maxDepth) return;
    let st;
    try { st = statSync(p); } catch (e) { return; }
    if (!st.isDirectory()) return;
    // v0.3.5：跳過 plugin 自身目錄（plugin 根有 cordis.patch.yml，標識不是使用者專案）
    //   否則會把 dsh-project-brain/plugin/.project-brain 當成 plugins workspace 的專案
    if (existsSync(join(p, "cordis.patch.yml"))) return;
    const brainDir = join(p, ".project-brain");
    const projJson = join(brainDir, "project.json");
    if (existsSync(projJson)) {
      out.push(p);
      // 找到了就不再深入該目錄
      return;
    }
    let entries;
    try { entries = readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(join(p, e.name), depth + 1);
    }
  }
  try { walk(rootPath, 0); } catch (e) { /* ignore */ }
  return out;
}

const HOST_OPTIONS = {
  ...SHARED_OPTIONS,
  entryPoints: [resolve(__dirname, "src/index.js")],
  outfile: resolve(pkgDir, "lib/index.js"),
  format: "esm",
};

// P0.4.2-final: 預設走 multi-workspace scan；--workspace=<path> 單 workspace 模式（向後相容）
let projectData, codegraph, allWorkspaces;
if (workspaceAll) {
  allWorkspaces = loadAllWorkspacesData(workspaceRoot);
  // 相容舊 define key（client 可能仍引用），用空 embed（client 主要用 __ALL_WORKSPACES__）
  projectData = {
    initialized: false,
    project: null,
    phase: null,
    recentActivity: [],
    memories: [],
    memoriesAll: [],
    todos: [],
    timelineAll: [],
    stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 },
    _embedMode: "multi-workspace",
  };
  codegraph = null;
} else if (workspacePath) {
  projectData = loadProjectData(workspacePath);
  codegraph = (() => {
    const root = workspacePath || projectRoot;
    const p = join(root, ".project-brain", "codegraph.json");
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { return null; }
  })();
  allWorkspaces = null;
} else {
  // Published bundles must never contain the publisher's local workspace,
  // memories, todos, or paths. Runtime Connection RPC supplies real data.
  projectData = {
    initialized: false,
    project: null,
    phase: null,
    recentActivity: [],
    memories: [],
    memoriesAll: [],
    todos: [],
    timelineAll: [],
    stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 },
    _embedMode: "runtime-rpc",
  };
  codegraph = null;
  allWorkspaces = null;
}

const CLIENT_OPTIONS = {
  ...SHARED_OPTIONS,
  entryPoints: [resolve(__dirname, "src/client.js")],
  outfile: resolve(pkgDir, "lib/client.js"),
  format: "iife",
  platform: "browser",
  define: {
    __PROJECT_DATA_JSON__: JSON.stringify(JSON.stringify(projectData)),
    __CODEGRAPH_JSON__: JSON.stringify(JSON.stringify(codegraph)),
    __ALL_WORKSPACES_JSON__: JSON.stringify(JSON.stringify(allWorkspaces || {
      sessionToWorkspaceId: {},
      workspaceProjects: {},
      workspacePaths: {},
      // Release-safe builds must not embed the publisher's home directory.
      dshRoot: null,
    })),
  },
};

async function runOnce() {
  if (workspaceAll) {
    const totalWs = Object.keys(allWorkspaces ? allWorkspaces.workspaceProjects || {} : {}).length;
    let totalProjects = 0;
    if (allWorkspaces && allWorkspaces.workspaceProjects) {
      for (const k of Object.keys(allWorkspaces.workspaceProjects)) {
        totalProjects += allWorkspaces.workspaceProjects[k].length;
      }
    }
    console.log(`[dsh-project-brain] mode: multi-workspace (DSH root=${workspaceRoot})`);
    console.log(`[dsh-project-brain] scanned: ${totalWs} workspaces, ${totalProjects} .project-brain found`);
    if (allWorkspaces && allWorkspaces._error) {
      console.log(`[dsh-project-brain] WARN: ${allWorkspaces._error}`);
    }
  } else if (workspacePath) {
    console.log(`[dsh-project-brain] mode: single-workspace ${workspacePath || projectRoot}`);
    console.log(`[dsh-project-brain] project data: initialized=${projectData.initialized} name=${projectData.project && projectData.project.name || "(none)"}`);
    console.log(`[dsh-project-brain] stats: pending=${projectData.stats.pendingTodos} done=${projectData.stats.completedTodos} decisions=${projectData.stats.decisions}`);
    console.log(`[dsh-project-brain] codegraph: ${codegraph ? codegraph.stats.files + " files, " + codegraph.stats.edges + " edges" : "(none)"}`);
  } else {
    console.log("[dsh-project-brain] mode: runtime-rpc (release-safe, no local workspace data embedded)");
  }
  await build(HOST_OPTIONS);
  await build(CLIENT_OPTIONS);
  console.log("[dsh-project-brain] build complete ->", pkgDir);
}

async function runWatch() {
  const hostCtx = await context(HOST_OPTIONS);
  const clientCtx = await context(CLIENT_OPTIONS);
  await hostCtx.watch();
  await clientCtx.watch();
  console.log("[dsh-project-brain] watching for changes...");
}

// 僅當直接執行時構建（import 用於 loadProjectData 測試時不觸發）
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  if (watch) {
    await runWatch();
  } else {
    await runOnce();
  }
}
