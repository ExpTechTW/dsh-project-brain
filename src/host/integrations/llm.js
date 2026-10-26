// llm.js - v0.4.2 真實 LLM 呼叫（OpenAI / Anthropic 相容 API）+ mock fallback
//
// v0.4.1 教訓：DSH Desktop 靜態 plugin fiber 靜默阻止 ctx.get('llm').stream()。
// v0.4.2 改用 node:fetch 直接調 user-configured OpenAI 相容 API。
// v0.4.7 加 Anthropic 相容支援：baseUrl 含 "anthropic" 路徑時走 /v1/messages 協議
//   （如 https://api.minimaxi.com/anthropic → POST {baseUrl}/v1/messages）
//
// 三層 fallback：
//   1. user-configured API（引數或 env DSH_LLM_API_URL/KEY/MODEL）→ node:fetch
//   2. mock LLM fallback（無 API key 時降級，保證工具不卡死）
//   3. fetch 失敗時（API key 錯/網路問題）→ 同樣降級到 mock
//
// 輸出統一為 string（LLM 原始輸出文本，由呼叫方 parseLLMArchitectureResponse 解析）

const MOCK_RESPONSE_TEXT = JSON.stringify({
  changes: [
    { file: 'src/auth/login.ts', type: 'modified', summary: '認證邏輯調整' },
    { file: 'src/auth/oauth.ts', type: 'added', summary: '新增 OAuth2 接入' },
  ],
  architectureMemory: {
    title: '架構變更：從 session 認證遷移到 OAuth2',
    content: '本次重構將 auth 模組從 session-based 認證遷移到 OAuth2，新增 oauth.ts 模組封裝 OAuth2 client，處理 token 重新整理 + 回撥路由。',
  },
  commit: 'git@HEAD',
  note: '[MOCK_LLM] DSH llm service 不可用或未配置 API key，返回 mock 資料。請配置 llmApiUrl/llmApiKey/llmModel 引數或 DSH_LLM_API_URL/KEY/MODEL env。',
});

// Mock fallback：API 未配置或失敗時
async function mockFetchLLM({ prompt }) {
  // 在 mock JSON 裡嵌一段 prompt 前 200 字元作為佔位（讓使用者能識別"這確實是 mock"）
  const preview = prompt.slice(0, 200).replace(/"/g, '\\"');
  return MOCK_RESPONSE_TEXT.replace(
    '"[MOCK_LLM] DSH llm service 不可用或未配置 API key，返回 mock 資料。請配置 llmApiUrl/llmApiKey/llmModel 引數或 DSH_LLM_API_URL/KEY/MODEL env。"',
    `"[MOCK_LLM] 使用者 prompt 前 200 字: ${preview}。請配置 llmApiUrl/llmApiKey/llmModel 引數或 DSH_LLM_API_URL/KEY/MODEL env。"`
  );
}

// 自動檢測 API 協議：baseUrl 含 "anthropic" 路徑 → Anthropic（POST /v1/messages）
//                              否則 → OpenAI 相容（POST /chat/completions）
export function detectProtocol(apiUrl) {
  if (!apiUrl) return "openai";
  // 路徑含 /anthropic 或 baseUrl 含 anthropic 子域 → Anthropic 協議
  // 例：https://api.minimaxi.com/anthropic → Anthropic
  if (/anthropic/i.test(apiUrl)) return "anthropic";
  return "openai";
}

// Anthropic 協議 fetch（POST {baseUrl}/v1/messages）
async function fetchAnthropic({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl/apiKey not configured");
  const url = apiUrl.replace(/\/$/, "") + "/v1/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-20240620",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens || 2000,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("LLM API error " + res.status + ": " + text.slice(0, 200));
  }
  const data = await res.json();
  // Anthropic messages response：content[0].text（content 是陣列，每個有 type 和 text）
  const text = data && data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error("LLM API returned empty content: " + JSON.stringify(data).slice(0, 200));
  return String(text);
}

// OpenAI 協議 fetch（POST {baseUrl}/chat/completions）
async function fetchOpenAI({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl/apiKey not configured");
  const url = apiUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens || 2000,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("LLM API error " + res.status + ": " + text.slice(0, 200));
  }
  const data = await res.json();
  // OpenAI chat completions response：choices[0].message.content
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("LLM API returned empty content: " + JSON.stringify(data).slice(0, 200));
  return String(content);
}

// 真實 fetch：根據 apiUrl 自動選 OpenAI 或 Anthropic 協議
async function realFetchLLM({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  const protocol = detectProtocol(apiUrl);
  if (protocol === "anthropic") {
    return await fetchAnthropic({ prompt, maxTokens, apiUrl, apiKey, model, signal });
  }
  return await fetchOpenAI({ prompt, maxTokens, apiUrl, apiKey, model, signal });
}

// 主入口：調 LLM，帶三層 fallback
export async function callLLMWithFallback({ prompt, maxTokens, apiUrl, apiKey, model, signal } = {}) {
  // 1) 真實 fetch（如果 apiUrl + apiKey 都齊）
  if (apiUrl && apiKey) {
    try {
      return await realFetchLLM({ prompt, maxTokens, apiUrl, apiKey, model, signal });
    } catch (e) {
      // 失敗 → fallback mock（不拋錯讓工具不卡死）
      return await mockFetchLLM({ prompt });
    }
  }
  // 2) 沒有任何配置 → mock
  return await mockFetchLLM({ prompt });
}

// 解析 LLM 輸出（約定 JSON 格式）
export function parseLLMArchitectureResponse(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.architectureMemory && parsed.architectureMemory.title) {
      return parsed;
    }
  } catch (e) {
    // text 不是 JSON → 包成 fallback
  }
  return {
    changes: [],
    architectureMemory: {
      title: "架構變更（未結構化）",
      content: text.slice(0, 1000),
    },
    note: "[parse-fallback] LLM 輸出非 JSON，已包成 fallback",
  };
}