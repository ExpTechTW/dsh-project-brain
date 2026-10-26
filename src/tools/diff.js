// project_diff Tool
// dryRun 預設 true。mock / parse-fallback 禁止寫入。真實輸出走 admitMemory。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { brainPath, appendJsonl } from "../host/store/brain-files.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { detectChanges, buildDiffPrompt } from "../host/diff/detector.js";
import { callLLMWithFallback, parseLLMArchitectureResponse } from "../host/integrations/llm.js";
import { admitMemory, isMockLlmPayload } from "../host/memory/admit.js";

export function buildDiffTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_diff",
    description:
      "dsh-project-brain: 讀取 git diff 並用 LLM 分析架構變化。" +
      " dryRun 預設 true（只掃描不寫記憶）；dryRun=false 時僅真實 LLM 輸出可經 admit 寫入 architecture 記憶。" +
      " mock / fallback 禁止寫入。",
    parameters: {
      path: { type: "string", description: "專案根路徑（絕對路徑，必傳）" },
      since: { type: "string", description: "git diff 視窗（commit 數，預設 1）" },
      maxTokens: { type: "number", description: "LLM 輸出 token 預算（預設 2000）" },
      dryRun: { type: "boolean", description: "只掃描不寫 memory（預設 true）" },
      llmApiUrl: { type: "string", description: "LLM API endpoint（可選）" },
      llmApiKey: { type: "string", description: "LLM API key（可選）" },
      llmModel: { type: "string", description: "LLM 模型名（預設 gpt-4o-mini）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => renderDiff(value),
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const since = (args && typeof args.since === "string" && args.since.trim()) ? args.since.trim() : "1";
        const maxTokens = (args && typeof args.maxTokens === "number") ? args.maxTokens : 2000;
        const dryRun = !(args && args.dryRun === false);
        const llmApiUrl = (args && typeof args.llmApiUrl === "string" && args.llmApiUrl.trim()) ? args.llmApiUrl.trim()
          : (typeof process !== "undefined" && process.env && process.env.DSH_LLM_API_URL) || null;
        const llmApiKey = (args && typeof args.llmApiKey === "string" && args.llmApiKey.trim()) ? args.llmApiKey.trim()
          : (typeof process !== "undefined" && process.env && process.env.DSH_LLM_API_KEY) || null;
        const llmModel = (args && typeof args.llmModel === "string" && args.llmModel.trim()) ? args.llmModel.trim()
          : (typeof process !== "undefined" && process.env && process.env.DSH_LLM_MODEL) || "gpt-4o-mini";

        const changes = await detectChanges({ projectPath, since });
        if (changes.error) {
          return { ok: false, code: "E_DIFF_SCAN_FAILED", message: changes.error };
        }
        if (!changes.files.length && !changes.changes.length) {
          return { ok: true, data: { changes, llmSkipped: "no changes detected", note: "無程式碼變更，無需調 LLM", dryRun } };
        }

        const prompt = buildDiffPrompt({ changes, projectPath });
        const rawText = await callLLMWithFallback({
          prompt,
          maxTokens,
          apiUrl: llmApiUrl,
          apiKey: llmApiKey,
          model: llmModel,
        });
        const parsed = parseLLMArchitectureResponse(rawText);
        const mock = isMockLlmPayload(rawText) || isMockLlmPayload(parsed && parsed.note);

        if (!dryRun && mock) {
          return {
            ok: false,
            code: "E_ADMIT_MOCK_FORBIDDEN",
            message: "mock / fallback LLM 輸出禁止寫入 memory.jsonl",
            data: {
              changes: {
                files: changes.files || [],
                changes: changes.changes || [],
                stat: changes.stat,
                commits: changes.commits,
                since: changes.since,
              },
              architectureMemory: parsed.architectureMemory,
              note: parsed.note || "[MOCK_LLM]",
              dryRun,
            },
          };
        }

        if (!dryRun && parsed.architectureMemory && parsed.architectureMemory.title) {
          const now = Date.now();
          const admitted = await admitMemory({
            fs,
            projectPath,
            candidate: {
              type: "architecture",
              title: parsed.architectureMemory.title,
              content: parsed.architectureMemory.content || "",
              importance: 0.75,
              confidence: 0.7,
              relatedFiles: (parsed.changes || []).map((c) => c.file).filter(Boolean).slice(0, 20),
              source: { kind: "project_diff", model: llmModel, since },
            },
            channel: "automatic",
            now,
            llmConfirm: { admit: true, type: "architecture" },
          });
          if (!admitted.ok) {
            return {
              ok: false,
              code: admitted.code || "E_ADMIT_REJECTED",
              message: admitted.message || admitted.reason || "architecture memory not admitted",
              data: { architectureMemory: parsed.architectureMemory, dryRun },
            };
          }
          if (admitted.action === "insert") {
            await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
              id: "evt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "project_diff 完成（" + (parsed.changes ? parsed.changes.length : 0) + " 檔案變化）",
              eventType: "diff",
              occurredAt: Date.now(),
              detail: "since=" + since + " files=" + (changes.files ? changes.files.length : 0),
            });
          }
        }

        return {
          ok: true,
          data: {
            changes: {
              files: changes.files || [],
              changes: changes.changes || [],
              stat: changes.stat,
              commits: changes.commits,
              since: changes.since,
            },
            architectureMemory: parsed.architectureMemory,
            changeDetails: parsed.changes || [],
            dryRun,
            note: parsed.note || ("dr=" + (dryRun ? "true" : "false") + " llm=" + (mock ? "mock" : "ok")),
          },
        };
      } catch (e) {
        return { ok: false, code: "E_DIFF_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

function renderDiff(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: project_diff FAILED - " + String(value) }];
  if (!value.ok) {
    return [{ type: "text", text: "dsh-project-brain: project_diff FAILED - " + (value.code || "") + ": " + (value.message || "") }];
  }
  const d = value.data || {};
  const lines = [{ type: "text", text: "dsh-project-brain: project_diff 完成" }];
  if (d.changes) {
    const files = d.changes.files || [];
    const commits = d.changes.commits || [];
    const detailed = d.changes.changes || [];
    lines.push({ type: "text", text: "  變更檔案: " + files.length + " 個 / commits: " + commits.length + " 條 / detailed: " + detailed.length + " 條" });
    if (d.changes.since) lines.push({ type: "text", text: "  時間視窗: " + d.changes.since });
  }
  if (d.architectureMemory && d.architectureMemory.title) {
    lines.push({ type: "text", text: "  ✓ architecture memory: " + d.architectureMemory.title });
  }
  if (d.changeDetails && d.changeDetails.length) {
    for (const c of d.changeDetails.slice(0, 5)) {
      lines.push({ type: "text", text: "    [" + (c.type || "?") + "] " + (c.file || "?") + " — " + (c.summary || "") });
    }
  }
  if (d.note) lines.push({ type: "text", text: "  note: " + d.note });
  if (d.dryRun) lines.push({ type: "text", text: "  dryRun=true，未寫 memory" });
  return lines;
}
