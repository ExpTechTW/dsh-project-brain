// project_init / project_rescan Tools
// 走 dsh-tools 的 defineTool（標準通道）
//
// P0.4.1 修復：
//  - project_init 重跑時保留已有 projectId / createdAt（此前每次重新生成）
//  - 寫入 timeline.jsonl 事件（init / rescan），SidebarPreview 最近活動有真實資料
//  - 新增 project_rescan 工具（原 project_init 描述裡承諾過但一直不存在）
//
// P0.4.2 修復（使用者實測反饋）：
//  - 去掉 process.cwd() fallback：tool 在 DSH Desktop 程序下 cwd=安裝目錄，會掃到 DSH.exe。
//    改為 path 必傳（或顯式 fail），避免掃錯目錄。
//  - 寫檔案用 sandboxPolicy.resolve({mode:'workspace-write'}) 拿寬鬆 policy，
//    作為引數傳給 fs.writeText 第 5 引數。即使預設 mode='read-only' 也能寫。
//  - render 容錯：value 結構異常時 fallback 顯示。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { sanitizeProjectDescription } from "./scanner.js";
import { resolveProjectPath } from "./host/store/path-resolver.js";
import { resolveSessionRoute } from "./host/architecture/analyzer.js";
import { scanAndWrite, emitPreviewChanged } from "./host/scan-and-write.js";

// 共享掃描 + 寫入邏輯（scanAndWrite + emitPreviewChanged + resolveWritePolicy）
// 已抽到 ./host/scan-and-write.js（v0.7.0-beta.3 release-fix）：
//   - 拆出目的是去掉 @deepseek-ai/dsh-tools 對 smoke / summarizer / sidebar 的傳遞依賴。
//   - 舊匯出 `scanAndWrite` 在檔案頂部已 import，保持呼叫方零改動。

// output schema 簡化為只宣告 ok + data (additionalProperties: true)
// 讓 fail/success 都通過 schema 校驗，避免框架吞 data 欄位
// v0.3.8：顯式宣告 ok/code/message，錯誤路徑返回不再被拒（頂層 { ok:false, code, message }）
const baseOutputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" },
  },
};

const pathParam = { type: "string", description: "專案根路徑（可選；預設從當前 DSH Session 的 workspace 自動解析）" };
const dryRunParam = { type: "boolean", description: "僅預覽，不寫檔案（預設 false）" };

function executionRoute(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session)
    || resolveSessionRoute(exec.currentSession)
    || resolveSessionRoute(exec.agent && exec.agent.session)
    || resolveSessionRoute(exec.agent)
    || resolveSessionRoute(exec.ctx && exec.ctx.session);
}

function executionSessionId(exec) {
  return exec && (exec.sessionId
    || (exec.session && exec.session.id)
    || (exec.agent && exec.agent.sessionId)
    || (exec.agent && exec.agent.session && exec.agent.session.id)) || null;
}

function buildInitTool({ fs, sandboxPolicy, getMemoryConfig, getLlm }) {
  return defineTool({
    name: "project_init",
    description:
      "dsh-project-brain: 掃描目標專案、識別技術棧、生成 .project-brain/project.json（含 timeline init 事件）。" +
      "首次訪問新專案時呼叫一次；重複呼叫安全（保留 projectId/createdAt）；增量更新用 project_rescan。" +
      "預設自動使用當前 DSH Session 的 workspace；僅 CLI/舊宿主需要顯式傳 path。",
    parameters: { path: pathParam, dryRun: dryRunParam },
    // 關鍵修復（P0.4.3）：render 必須巢狀在 output 裡（dsh-tools 0.1.0-rc.x 期望
    // options.output.render）。之前誤把 render 放 top-level，導致 userRender 變 undefined，
    // 框架呼叫時拋 "userRender is not a function"。
    output: { schema: baseOutputSchema, render: (_args, value) => renderProjectTool(value, "project init") },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "無法從當前 Session 解析 workspace 路徑" } } };
        }
        const resolvedArgs = Object.assign({}, args || {}, { path: projectPath });
        const result = await scanAndWrite(fs, sandboxPolicy, resolvedArgs, "project_init", {
          getMemoryConfig,
          getLlm,
          llmRoute: executionRoute(exec),
          getLlmRoute: () => executionRoute(exec),
          sessionId: executionSessionId(exec),
        });
        if (result.ok && !(args && args.dryRun)) {
          emitPreviewChanged(exec, projectPath);
        }
        return result;
      } catch (e) {
        return {
          ok: false,
          data: { error: { code: "E_SCAN_FAILED", message: String((e && e.message) || e) } },
        };
      }
    },
  });
}

function buildRescanTool({ fs, sandboxPolicy, getMemoryConfig, getLlm }) {
  return defineTool({
    name: "project_rescan",
    description:
      "dsh-project-brain: 重掃已有 .project-brain 的專案並增量重新整理 project.json" +
      "（保留 projectId/createdAt/記憶/待辦，只更新技術棧/入口/語言統計），追加 timeline rescan 事件。" +
      "專案結構變化後呼叫；預設自動使用當前 DSH Session 的 workspace。",
    parameters: { path: pathParam, dryRun: dryRunParam },
    output: { schema: baseOutputSchema, render: (_args, value) => renderProjectTool(value, "rescan") },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "無法從當前 Session 解析 workspace 路徑" } } };
        }
        const resolvedArgs = Object.assign({}, args || {}, { path: projectPath });
        const result = await scanAndWrite(fs, sandboxPolicy, resolvedArgs, "project_rescan", {
          getMemoryConfig,
          getLlm,
          llmRoute: executionRoute(exec),
          getLlmRoute: () => executionRoute(exec),
          sessionId: executionSessionId(exec),
        });
        if (result.ok && !(args && args.dryRun)) {
          emitPreviewChanged(exec, projectPath);
        }
        return result;
      } catch (e) {
        return {
          ok: false,
          data: { error: { code: "E_SCAN_FAILED", message: String((e && e.message) || e) } },
        };
      }
    },
  });
}

function renderProjectTool(value, toolLabel) {
  // 容錯：value 可能不是 {ok, data} 結構（比如 schema 校驗失敗時框架剝了 data）
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - non-object result: ` + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.error) {
      return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ${d.error.code}: ${d.error.message}` }];
    }
    return [
      { type: "text", text: `dsh-project-brain: ${toolLabel} OK` },
      { type: "text", text: `  projectId: ${d.projectId}` },
      { type: "text", text: `  name: ${d.name}` },
      { type: "text", text: `  isRescan: ${d.isRescan}（id/createdAt 已保留）` },
      { type: "text", text: `  scanDurationMs: ${d.scanDurationMs}` },
      { type: "text", text: `  stats: ${JSON.stringify(d.stats)}` },
      { type: "text", text: `  architecture: ${JSON.stringify(d.architecture || {})}` },
      ...(d.dryRun ? [{ type: "text", text: "  (dry run)" }] : []),
    ];
  }
  // value.ok 是 false，但 value.data 可能 undefined（框架剝了）
  if (value.data && value.data.error) {
    return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ${value.data.error.code}: ${value.data.error.message}` }];
  }
  return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ` + JSON.stringify(value) }];
}

// 向後相容舊匯出
export function buildProjectInitTool(opts) { return buildInitTool(opts); }
export function buildProjectRescanTool(opts) { return buildRescanTool(opts); }
