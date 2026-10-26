import { STACK_FIELD_TO_TECHSTACK } from "./stack-taxonomy.js";

// Scanner：掃專案根、識別技術棧、統計語言、找入口
// 全部基於 fs 服務（DSH 抽象），無直接 Node fs 依賴
//
// 關鍵修復（P0.4.8 / 續開發）：
//   DSH fs.listDir 返回 FsDirEntry = { name, type: 'file'|'directory'|'other', target: FsTarget }
//   之前的程式碼用 e.isFile / e.isDirectory（boolean）— DSH 實際沒這倆欄位，導致
//   recursion 一個檔案都沒計數（實測 files:0 / languages:{}）。
//   改為 e.type 優先，e.isFile/isDirectory（boolean/method）作為 fallback，
//   recursion 直接用 e.target（resolved FsTarget），僅當缺失時回退 fs.resolve。

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".venv", "venv", ".next", "target", ".DS_Store",
  ".idea", ".vscode", "coverage", ".turbo", ".cache", "out",
  ".project-brain", // 自身的專案腦資料目錄，不應被掃
]);

function shouldIgnoreDir(name) {
  return IGNORE_DIRS.has(name)
    || /^node_modules(?:[._-].*)?$/i.test(name)
    || /(?:^|[._-])backup(?:[._-]|$)/i.test(name)
    || /\.bak(?:[._-]|$)/i.test(name);
}

function isPythonRequirementsName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower === "requirements.txt" || lower === "requirement.txt" || lower === "requirment.txt" || lower === "requirments.txt") return true;
  return /^requirements[-._][a-z0-9._-]+\.txt$/.test(lower);
}

// v1.2.x：技術流行度分數表（使用者核心訴求："主要的技術棧放前面，次要往後排"）
//   分數依據（粗略估算）：
//     - GitHub stars / npm 每週下載量 / pip 周下載量 / 行業滲透率
//     - 同一 field 內，分數越高越靠前
//     - 沒收錄的技術 → 預設 50（中等）
//   注意：分數是"重要性啟發"，不是"客觀真理"；使用者可按專案特徵覆蓋
const STACK_POPULARITY = {
  // === framework-frontend ===
  "React": 100, "Vue": 95, "Angular": 80, "Svelte": 70, "Solid": 45, "Preact": 50,
  "Next.js": 95, "Nuxt": 70, "SvelteKit": 65, "Remix": 55, "Astro": 50, "Qwik": 40, "SolidStart": 40,
  "Mithril": 20, "Ember": 25, "Stimulus": 35, "Lit": 40, "Yew": 30,
  "Streamlit": 70, "Gradio": 65, "Dash": 35, "Panel": 30, "NiceGUI": 25, "Taipy": 20,
  // === framework-backend ===
  "Express": 100, "Fastify": 60, "NestJS": 85, "Koa": 50, "Hapi": 35, "Hono": 55,
  "AdonisJS": 30, "LoopBack": 20, "Spring Boot": 100, "Spring Framework": 60, "Quarkus": 55, "Micronaut": 45,
  "FastAPI": 95, "Django": 90, "Flask": 75, "Sanic": 25, "Starlette": 35, "Litestar": 30,
  "aiohttp": 40, "Tornado": 35, "Pyramid": 15, "Bottle": 10, "CherryPy": 12, "Falcon": 25, "Masonite": 12, "Hug": 10,
  "Gin": 75, "Echo": 45, "Fiber": 50, "Chi": 40, "FastHTTP": 30,
  "Actix Web": 55, "Axum": 65, "Rocket": 45, "Warp": 25, "Tide": 15, "Salvo": 25,
  "Leptos": 30, "Dioxus": 35,
  "Go": 70, "Rust": 60, "Java": 70, "Kotlin": 55, "Scala": 40, "Scala (sbt)": 40, "Swift": 50, "Dart": 45,
  "C++": 55, "C#": 55, ".NET": 60, "PHP": 50, "Ruby": 55,
  // === webserver ===
  "Nginx": 100, "Apache": 80, "Caddy": 50, "Traefik": 55, "HAProxy": 50,
  // === database ===
  "PostgreSQL": 100, "MySQL": 85, "MongoDB": 80, "MariaDB": 55, "SQLite": 65,
  "ClickHouse": 55, "Cassandra": 35, "InfluxDB": 40, "DynamoDB": 55, "BigQuery": 50,
  "Snowflake": 45, "Redshift": 40, "libSQL": 25, "SQL": 30,
  // === cache ===
  "Redis": 100, "Memcached": 45, "Valkey": 60, "Node-Cache": 20, "Keyv": 15, "Dragonfly": 35,
  // === queue ===
  "Kafka": 95, "RabbitMQ": 90, "NATS": 55, "Bull": 50, "Celery": 65, "RQ": 30, "Dramatiq": 25, "Huey": 20, "arq": 25,
  "Upstash Kafka": 30,
  // === search ===
  "Elasticsearch": 80, "OpenSearch": 50, "Algolia": 50, "Meilisearch": 35, "Typesense": 40,
  // === container ===
  "Docker Compose": 100, "Docker": 90, "Kubernetes": 100, "Podman": 45,
  // === mobile / desktop ===
  "Flutter": 90, "React Native": 80, "Expo": 70, "Electron": 85, "Tauri": 60, "Neutralino": 25,
  "Flet": 30, "Wails": 25,
  // === iac ===
  "Terraform": 90, "Ansible": 70, "Pulumi": 50, "CloudFormation": 55, "Bicep": 45, "Helm": 65, "Kustomize": 45,
  // === ci ===
  "GitHub Actions": 100, "GitLab CI": 70, "Jenkins": 55, "CircleCI": 50, "Azure Pipelines": 45, "Travis CI": 30, "Bitbucket Pipelines": 25, "Drone": 25,
  // === observability ===
  "Prometheus": 90, "Grafana": 85, "Sentry": 80, "OpenTelemetry": 75, "Datadog": 70, "Datadog APM": 70,
  "Pino": 50, "Winston": 45, "Structlog": 40, "Loguru": 35, "Loki": 60, "Jaeger": 45, "Micrometer": 50,
  // === auth ===
  "Passport.js": 50, "Auth.js (NextAuth)": 70, "Clerk": 55, "Auth0": 50, "Supabase": 75, "Firebase": 75,
  "JWT": 60, "JOSE": 35, "Keycloak": 65, "Vault": 60, "OAuth2": 50, "OAuth2/OIDC": 55,
  "Django Auth": 35, "Flask-Login": 25, "Authlib": 40, "OAuthLib": 40,
  // === api ===
  "GraphQL": 85, "gRPC": 75, "OpenAPI/Swagger": 65, "tRPC": 55, "REST": 50, "MCP": 70,
  // === payment ===
  "Stripe": 90, "PayPal": 50,
  // === ai（v1.2.x patch #4：AI/ML 框架提升到主視野）===
  "LangChain": 90, "LangGraph": 88, "LlamaIndex": 75, "OpenAI SDK": 100, "Anthropic SDK": 95,
  "Google Generative AI": 75, "Cohere": 55, "Hugging Face": 85,
  "PyTorch": 90, "TensorFlow": 80, "JAX": 45, "scikit-learn": 75, "Keras": 60,
  "pandas": 70, "NumPy": 75, "Polars": 50, "Dask": 35,
    "Matplotlib": 60, "Seaborn": 40, "Plotly": 45, "Bokeh": 25, "Altair": 25,
  "Candle": 25, "tch (PyTorch)": 40,
  // === orm ===
  "Prisma": 95, "SQLAlchemy": 80, "TypeORM": 60, "Sequelize": 55, "Drizzle": 75, "Mongoose": 65,
  "Knex": 50, "MikroORM": 40, "Objection.js": 30, "Bookshelf": 20, "Waterline": 15,
  "SQLModel": 50, "Django ORM": 40, "Peewee": 25, "Tortoise ORM": 35, "Pony ORM": 20, "Ormar": 20, "Piccolo": 15, "dataset": 15,
  "GORM": 65, "Ent": 35, "sqlx": 55, "Bun": 35, "Diesel": 45, "SeaORM": 40, "Hibernate": 65, "MyBatis": 50,
};
const STACK_DEFAULT_SCORE = 50;
// 按 popularity 分數降序排序 stack[field] 陣列（使用者核心訴求：主要的在前）
function sortStackByPopularity(stack) {
  const score = (item) => (STACK_POPULARITY[item] != null ? STACK_POPULARITY[item] : STACK_DEFAULT_SCORE);
  for (const field of Object.keys(stack)) {
    if (Array.isArray(stack[field])) {
      stack[field] = stack[field].slice().sort((a, b) => score(b) - score(a));
    }
  }
  return stack;
}

// v1.2.x patch #4：把常被誤歸為"工具"的 AI/ML 資料棧庫提升到主視野 stack.ai
//   pandas/numpy/scikit-learn 是"用了什麼"級別的依賴，不是輔助工具
//   歸到 tooling 摺疊後用戶看不到，導致"識別為空"的錯覺
const AI_ML_TOOLING_TO_STACK = {
  "pandas": "pandas",
  "numpy": "NumPy",
  "polars": "Polars",
  "dask": "Dask",
  "scikit-learn": "scikit-learn",
  "pytorch": "PyTorch",
  "tensorflow": "TensorFlow",
  "jax": "JAX",
  "keras": "Keras",
  "transformers": "Hugging Face",
  "datasets": "Hugging Face",
  "huggingface-hub": "Hugging Face",
};
function promoteAIMLToStack(result) {
  if (!Array.isArray(result.tooling)) return;
  const remaining = [];
  for (const item of result.tooling) {
    const aiName = AI_ML_TOOLING_TO_STACK[item];
    if (aiName) {
      // 用 setStack 保持 techStack 相容 + pushStack 進 stack.ai
      result.techStack && (function () {
        if (!Array.isArray(result.techStack.ai)) result.techStack.ai = result.techStack.ai ? [result.techStack.ai] : [];
        if (!result.techStack.ai.includes(aiName)) result.techStack.ai.push(aiName);
      })();
      if (!Array.isArray(result.stack.ai)) result.stack.ai = result.stack.ai ? [result.stack.ai] : [];
      if (!result.stack.ai.includes(aiName)) result.stack.ai.push(aiName);
    } else {
      remaining.push(item);
    }
  }
  result.tooling = remaining;
}

// v1.2.x patch #4：兜底——manifest 缺失時掃原始碼 import 識別 framework
//   限制：僅當 stack 完全為空時啟用；只讀前幾個 .py/.js/.ts 檔案頭 50 行
//   目的：解決"只有原始碼沒有 manifest"的資料科學專案識別為空問題
async function fallbackScanImports(fs, rootTarget, result) {
  // 僅當 stack 完全沒有內容時啟用
  const hasAny = Object.keys(result.stack).some((k) => Array.isArray(result.stack[k]) && result.stack[k].length > 0);
  if (hasAny) return;

  // 限制：最多讀 20 個檔案，每個檔案前 60 行
  const MAX_FILES = 20;
  const MAX_LINE = 60;
  const candidates = [];
  async function walk(target, depth) {
    if (depth > 3 || candidates.length >= MAX_FILES) return;
    let entries;
    try { entries = await fs.listDir(target); } catch (e) { return;
    }
    for (const e of entries) {
      if (candidates.length >= MAX_FILES) return;
      if (!e || !e.name) continue;
      if (shouldIgnoreDir(e.name)) continue;
      const kind = e.type || (e.isDirectory ? "directory" : (e.isFile ? "file" : "other"));
      if (kind === "file" && /\.(py|js|ts|jsx|tsx|mjs)$/i.test(e.name)) {
        candidates.push(e);
      } else if (kind === "directory") {
        const subT = e.target || await childTarget(fs, target, e);
        if (subT) await walk(subT, depth + 1);
      }
    }
  }
  await walk(rootTarget, 0);

  // import 模式：from X import Y / import X
  const IMPORT_HINTS = {
    "fastapi": "framework-backend", "django": "framework-backend", "flask": "framework-backend",
    "starlette": "framework-backend", "aiohttp": "framework-backend", "tornado": "framework-backend",
    "sanic": "framework-backend", "falcon": "framework-backend", "hug": "framework-backend", "litestar": "framework-backend",
    "celery": "queue", "rq": "queue", "dramatiq": "queue",
    "sqlalchemy": "orm", "peewee": "orm", "tortoise": "orm", "pony": "orm", "dataset": "orm", "piccolo": "orm", "ormar": "orm",
    "pydantic": "framework-backend",
    "redis": "cache", "aioredis": "cache", "pymemcache": "cache",
    "pymongo": "database", "motor": "database", "asyncpg": "database", "psycopg2": "database", "psycopg": "database",
    "pymysql": "database", "aiomysql": "database", "mysqlclient": "database",
    "elasticsearch": "search", "opensearchpy": "search",
    "kafka": "queue", "aiokafka": "queue", "confluent_kafka": "queue",
    "nats": "queue",
    "boto3": "framework-backend",
    "pandas": "ai", "numpy": "ai", "polars": "ai", "dask": "ai",
    "sklearn": "ai", "scikit-learn": "ai", "scikit_learn": "ai",
    "torch": "ai", "tensorflow": "ai", "keras": "ai", "jax": "ai",
    "transformers": "ai", "datasets": "ai", "huggingface_hub": "ai",
    "langchain": "ai", "langchain_core": "ai", "langgraph": "ai", "llama_index": "ai",
    "openai": "ai", "anthropic": "ai", "cohere": "ai", "google.generativeai": "ai",
    "tiktoken": "ai",
    "matplotlib": "ai", "seaborn": "ai", "plotly": "ai", "bokeh": "ai", "altair": "ai", "streamlit": "framework-frontend", "gradio": "framework-frontend", "dash": "framework-frontend", "panel": "framework-frontend",
    "react": "framework-frontend", "vue": "framework-frontend", "svelte": "framework-frontend",
    "express": "framework-backend", "fastify": "framework-backend", "koa": "framework-backend", "hapi": "framework-backend", "hono": "framework-backend",
    "@nestjs/core": "framework-backend",
    "next": "framework-fullstack", "nuxt": "framework-fullstack",
    "electron": "desktop", "@tauri-apps/api": "desktop",
    "prisma": "orm", "typeorm": "orm", "sequelize": "orm", "drizzle-orm": "orm",
    "mongoose": "orm",
    "passport": "auth", "next-auth": "auth",
    "stripe": "payment",
  };
  const NAME_TO_DISPLAY = {
    "fastapi": "FastAPI", "django": "Django", "flask": "Flask", "starlette": "Starlette",
    "aiohttp": "aiohttp", "tornado": "Tornado", "sanic": "Sanic", "falcon": "Falcon", "hug": "Hug", "litestar": "Litestar",
    "celery": "Celery", "rq": "RQ", "dramatiq": "Dramatiq",
    "sqlalchemy": "SQLAlchemy", "peewee": "Peewee", "tortoise": "Tortoise ORM", "pony": "Pony ORM", "dataset": "dataset", "piccolo": "Piccolo", "ormar": "Ormar",
    "pydantic": "Pydantic",
    "redis": "Redis", "aioredis": "Redis", "pymemcache": "Memcached",
    "pymongo": "MongoDB", "motor": "MongoDB", "asyncpg": "PostgreSQL", "psycopg2": "PostgreSQL", "psycopg": "PostgreSQL",
    "pymysql": "MySQL", "aiomysql": "MySQL", "mysqlclient": "MySQL",
    "elasticsearch": "Elasticsearch", "opensearchpy": "OpenSearch",
    "kafka": "Kafka", "aiokafka": "Kafka", "confluent_kafka": "Kafka",
    "nats": "NATS",
    "boto3": "Boto3",
    "pandas": "pandas", "numpy": "NumPy", "polars": "Polars", "dask": "Dask",
    "sklearn": "scikit-learn", "scikit-learn": "scikit-learn", "scikit_learn": "scikit-learn",
    "torch": "PyTorch", "tensorflow": "TensorFlow", "keras": "Keras", "jax": "JAX",
    "transformers": "Hugging Face", "datasets": "Hugging Face", "huggingface_hub": "Hugging Face",
    "langchain": "LangChain", "langchain_core": "LangChain", "langgraph": "LangGraph", "llama_index": "LlamaIndex",
    "openai": "OpenAI SDK", "anthropic": "Anthropic SDK",
    "cohere": "Cohere", "google.generativeai": "Google Generative AI",
    "tiktoken": "tiktoken",
    "matplotlib": "Matplotlib", "seaborn": "Seaborn", "plotly": "Plotly", "bokeh": "Bokeh", "altair": "Altair",
    "streamlit": "Streamlit", "gradio": "Gradio", "dash": "Dash", "panel": "Panel",
    "react": "React", "vue": "Vue", "svelte": "Svelte",
    "express": "Express", "fastify": "Fastify", "koa": "Koa", "hapi": "Hapi", "hono": "Hono",
    "@nestjs/core": "NestJS",
    "next": "Next.js", "nuxt": "Nuxt",
    "electron": "Electron", "@tauri-apps/api": "Tauri",
    "prisma": "Prisma", "typeorm": "TypeORM", "sequelize": "Sequelize", "drizzle-orm": "Drizzle",
    "mongoose": "Mongoose",
    "passport": "Passport.js", "next-auth": "Auth.js (NextAuth)",
    "stripe": "Stripe",
  };
  // 收集 import 訊號：每個欄位命中次數累加，取 ≥1 的視為存在
  const hits = {};
  for (const entry of candidates) {
    const target = entry.target || await childTarget(fs, rootTarget, entry);
    if (!target) continue;
    let txt;
    try { txt = await fs.readText(target); } catch (e) { continue; }
    if (!txt) continue;
    const lines = txt.split(/\n/).slice(0, MAX_LINE).join("\n");
    for (const [hint, field] of Object.entries(IMPORT_HINTS)) {
      const esc = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 相容 4 種語法：
      //   1) Python: `import foo` / `import foo.bar` / `import foo as bar`
      //   2) Python: `from foo import ...` / `from foo.bar import ...`
      //   3) JS/TS: `from "foo"` / `from "foo/bar"`
      //   4) JS/TS: `import foo from "foo"` / `import "foo"` / `require("foo")`
      const patterns = [
        // 1) Python: import foo (後跟空白/; /行尾)
        new RegExp("(?:^|\\s)import\\s+['\"]?" + esc + "['\"]?(?:\\s*as\\s+\\w+|\\s|;|$)", "m"),
        // 2) Python: from foo import / from foo.bar import
        new RegExp("(?:^|\\s)from\\s+['\"]?" + esc + "(?:\\.\\w+)?['\"]?\\s+import", "m"),
        // 3) JS/TS: from "foo" / from 'foo'
        new RegExp("(?:^|\\s|;)from\\s+['\"]" + esc + "(?:[/.][^'\"]+)?['\"]", "m"),
        // 4) JS/TS: import x from "foo" / import "foo" / require("foo")
        new RegExp("(?:^|\\s|;|\\()(?:import\\s+(?:[^'\"]*\\s+from\\s+['\"]" + esc + "(?:[/.][^'\"]+)?['\"]|['\"]" + esc + "(?:[/.][^'\"]+)?['\"])|require\\(\\s*['\"]" + esc + "(?:[/.][^'\"]+)?['\"]\\s*\\))", "m"),
      ];
      for (const re of patterns) {
        if (re.test(lines)) {
          hits[hint] = (hits[hint] || 0) + 1;
          break;
        }
      }
    }
  }
  // 寫入 result.stack
  for (const [hint, count] of Object.entries(hits)) {
    if (count < 1) continue;
    const field = IMPORT_HINTS[hint];
    const display = NAME_TO_DISPLAY[hint] || hint;
    if (!Array.isArray(result.stack[field])) result.stack[field] = result.stack[field] ? [result.stack[field]] : [];
    if (!result.stack[field].includes(display)) result.stack[field].push(display);
    const techField = STACK_FIELD_TO_TECHSTACK[field] || field;
    const cur = result.techStack[techField];
    if (!cur) result.techStack[techField] = display;
    else if (Array.isArray(cur)) { if (!cur.includes(display)) cur.push(display); }
    else if (cur !== display) result.techStack[techField] = [cur, display];
  }
}

const EXT_LANG = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".rs": "rust",
  ".c": "c", ".h": "c",
  ".cc": "cpp", ".cpp": "cpp", ".cxx": "cpp", ".hpp": "cpp",
  ".cs": "csharp", ".php": "php", ".rb": "ruby",
  ".kt": "kotlin", ".kts": "kotlin", ".swift": "swift",
  ".dart": "dart", ".scala": "scala", ".sh": "shell",
  ".sql": "sql", ".vue": "vue", ".svelte": "svelte",
};

function decodeReadmeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return named[entity.toLowerCase()] || all;
  });
}

export function sanitizeProjectDescription(value) {
  if (!value) return null;
  const cleaned = decodeReadmeEntities(String(value)
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|svg|picture)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s+)\s*/gm, "")
    .replace(/[*_~`|]+/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 500) : null;
}

function isMeaningfulDescription(value) {
  const text = String(value || "").trim();
  if (text.length < 12) return false;
  if (/^(?:english|中文|簡體中文|繁體中文|docs?|documentation|homepage)(?:\s*[|·/]\s*(?:english|中文|簡體中文|繁體中文|docs?|documentation|homepage))*$/i.test(text)) return false;
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g) || []).length;
  return chinese >= 6 || words >= 3;
}

export function firstReadmeParagraph(text) {
  if (!text) return null;
  const source = String(text).replace(/^\uFEFF/, "").replace(/<!--([\s\S]*?)-->/g, "");
  const lines = source.split(/\r?\n/);
  const parts = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) {
      if (started && parts.length) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line) || /^<h[1-6]\b/i.test(line)) {
      if (started && parts.length) break;
      continue;
    }
    const visible = sanitizeProjectDescription(line);
    if (!visible || !isMeaningfulDescription(visible)) {
      if (started && parts.length && /^(?:[-*]\s|\d+\.\s|#{1,6}\s+)/.test(line)) break;
      continue;
    }
    started = true;
    parts.push(visible);
    if (parts.join(" ").length >= 360) break;
  }
  return sanitizeProjectDescription(parts.join(" "));
}

function processPathOf(fs, target) {
  return typeof fs.processPath === "function" ? fs.processPath(target) : String(target);
}

async function readText(fs, rootPath, name) {
  try {
    const t = await fs.resolve(name, { cwd: rootPath });
    return await fs.readText(t);
  } catch (e) {
    return null;
  }
}

// 檢測 entry 是 file / directory / other（相容 DSH FsDirEntry + 舊 adapter）
function entryKind(e) {
  if (!e) return "other";
  // DSH FsDirEntry.type 優先
  if (typeof e.type === "string") {
    if (e.type === "file" || e.type === "directory" || e.type === "other") return e.type;
  }
  // 舊 adapter：boolean
  if (e.isFile === true) return "file";
  if (e.isDirectory === true) return "directory";
  // 舊 adapter：method（node Dirent）
  if (typeof e.isFile === "function" && e.isFile()) return "file";
  if (typeof e.isDirectory === "function" && e.isDirectory()) return "directory";
  return "other";
}

// 拿到 child 的 FsTarget（用於遞迴）。優先用 entry 自帶的 target，否則 re-resolve。
async function childTarget(fs, parentTarget, entry) {
  if (entry && entry.target) return entry.target;
  try {
    return await fs.resolve(entry.name, { cwd: parentTarget });
  } catch (e) {
    return null;
  }
}

export async function scanProject(fs, projectPath) {
  const rootTarget = await fs.resolve(projectPath);
  const rootPath = processPathOf(fs, rootTarget);

  // ── 輸出 schema（v1.2.x 重構） ──
  //   techStack：老 schema，按分類鍵（structure/backend/frontend/orm/database/cache/queue/...）存原始識別結果
  //              保留向後相容，mergeTechStackWithArchitecture 仍消費它
  //   stack：    新 schema，主視野技術棧。按"用了什麼"的視角分組：
  //                framework-frontend / framework-backend / framework-fullstack
  //                webserver / database / cache / queue / search
  //                container / mobile / desktop
  //                iac / ci / observability / auth / api
  //              每個值是陣列。多語言棧並存自動累加。
  //   tooling：  縮小到"工程工具"語義：構建/Lint/測試/型別/包管理。
  //              不再含 GitHub Actions / Make / Docker / Terraform（這些已歸到 stack）。
  //   structure：程式碼結構標籤（Monorepo / Cargo Workspace）單獨保留，獨立展示。
  function addTo(map, field, value) {
    if (!value) return;
    const cur = map[field];
    if (!cur) map[field] = value;
    else if (Array.isArray(cur)) { if (!cur.includes(value)) cur.push(value); }
    else if (cur !== value) map[field] = [cur, value];
  }
  // techStack 相容老程式碼（單值 → 陣列漸進式）
  function setStack(field, value) {
    addTo(result.techStack, field, value);
  }
  // stack：新的主視野分組（始終陣列形式）
  function pushStack(field, value) {
    if (!value) return;
    if (!Array.isArray(result.stack[field])) result.stack[field] = result.stack[field] ? [result.stack[field]] : [];
    if (!result.stack[field].includes(value)) result.stack[field].push(value);
  }

  const result = {
    projectName: null,
    description: null,
    techStack: {},          // 老 schema（保留向後相容）
    stack: {},              // 新 schema（主視野：框架/中介軟體/執行時）
    structure: [],          // 程式碼結構標籤（Monorepo/Cargo Workspace）單獨
    languages: {},
    tooling: [],            // 工程工具（構建/Lint/測試/型別/包管理）
    fileCount: 0,
    topLevel: [],
    entrypoints: [],
    files: [],
  };

  let entries;
  try {
    entries = await fs.listDir(rootTarget);
  } catch (e) {
    return result;
  }

  // topLevel：保留所有非忽略項（包括目錄），方便後續 Phase 區塊展示
  result.topLevel = entries
    .map((e) => e && e.name)
    .filter((n) => n && !shouldIgnoreDir(n))
    .slice()
    .sort();

  const names = result.topLevel;

  // —— Package.json → JS/TS framework ——
  if (names.includes("package.json")) {
    const txt = await readText(fs, rootPath, "package.json");
    if (txt) {
      try {
        const pkg = JSON.parse(txt);
        result.projectName = typeof pkg.name === "string" ? pkg.name : null;
        result.description = typeof pkg.description === "string" ? sanitizeProjectDescription(pkg.description) : null;
        const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
        // Fullstack
        if (deps.next) { setStack("fullstack", "Next.js"); pushStack("framework-fullstack", "Next.js"); }
        else if (deps.nuxt) { setStack("fullstack", "Nuxt"); pushStack("framework-fullstack", "Nuxt"); }
        else if (deps["@sveltejs/kit"]) { setStack("fullstack", "SvelteKit"); pushStack("framework-fullstack", "SvelteKit"); }
        else if (deps["remix"] || deps["@remix-run/react"]) { setStack("fullstack", "Remix"); pushStack("framework-fullstack", "Remix"); }
        else if (deps.astro) { setStack("fullstack", "Astro"); pushStack("framework-fullstack", "Astro"); }
        else if (deps["@builder.io/qwik"] || deps["@builder.io/qwik-city"]) { setStack("fullstack", "Qwik"); pushStack("framework-fullstack", "Qwik"); }
        else if (deps["solid-start"]) { setStack("fullstack", "SolidStart"); pushStack("framework-fullstack", "SolidStart"); }
        // Backend
        if (deps.express) { setStack("backend", "Express"); pushStack("framework-backend", "Express"); }
        else if (deps.fastify) { setStack("backend", "Fastify"); pushStack("framework-backend", "Fastify"); }
        else if (deps["@nestjs/core"]) { setStack("backend", "NestJS"); pushStack("framework-backend", "NestJS"); }
        else if (deps.koa) { setStack("backend", "Koa"); pushStack("framework-backend", "Koa"); }
        else if (deps.hapi || deps["@hapi/hapi"]) { setStack("backend", "Hapi"); pushStack("framework-backend", "Hapi"); }
        else if (deps["@adonisjs/core"]) { setStack("backend", "AdonisJS"); pushStack("framework-backend", "AdonisJS"); }
        else if (deps["@hono/node-server"] || deps.hono) { setStack("backend", "Hono"); pushStack("framework-backend", "Hono"); }
        else if (deps["@loopback/core"]) { setStack("backend", "LoopBack"); pushStack("framework-backend", "LoopBack"); }
        else if (deps["@nestjs/platform-express"]) { /* covered by @nestjs/core */ }
        // Frontend
        if (deps.react) { setStack("frontend", "React"); pushStack("framework-frontend", "React"); }
        else if (deps.vue) { setStack("frontend", "Vue"); pushStack("framework-frontend", "Vue"); }
        else if (deps.svelte) { setStack("frontend", "Svelte"); pushStack("framework-frontend", "Svelte"); }
        else if (deps.solid || deps["solid-js"]) { setStack("frontend", "Solid"); pushStack("framework-frontend", "Solid"); }
        else if (deps.preact) { setStack("frontend", "Preact"); pushStack("framework-frontend", "Preact"); }
        else if (deps.angular || deps["@angular/core"]) { setStack("frontend", "Angular"); pushStack("framework-frontend", "Angular"); }
        else if (deps["@angular/material"]) { /* covered by @angular/core */ }
        else if (deps.mithril) { setStack("frontend", "Mithril"); pushStack("framework-frontend", "Mithril"); }
        else if (deps["ember-source"] || deps.ember) { setStack("frontend", "Ember"); pushStack("framework-frontend", "Ember"); }
        else if (deps["@hotwired/stimulus"]) { setStack("frontend", "Stimulus"); pushStack("framework-frontend", "Stimulus"); }
        else if (deps["lit-element"] || deps.lit || deps["@lit/reactive-element"]) { setStack("frontend", "Lit"); pushStack("framework-frontend", "Lit"); }
        // Desktop / Mobile
        if (deps.electron) { setStack("desktop", "Electron"); pushStack("desktop", "Electron"); }
        if (deps["react-native"]) { setStack("mobile", "React Native"); pushStack("mobile", "React Native"); }
        if (deps.expo) { setStack("mobile", "Expo"); pushStack("mobile", "Expo"); }
        if (deps["@tauri-apps/api"] || deps.tauri) { setStack("desktop", "Tauri"); pushStack("desktop", "Tauri"); }
        if (deps["@neutralino/neu"]) { setStack("desktop", "Neutralino"); pushStack("desktop", "Neutralino"); }
        // ORM
        if (deps.prisma || deps["@prisma/client"]) { setStack("orm", "Prisma"); pushStack("orm", "Prisma"); }
        if (deps.typeorm) { setStack("orm", "TypeORM"); pushStack("orm", "TypeORM"); }
        if (deps.sequelize || deps["sequelize-cli"]) { setStack("orm", "Sequelize"); pushStack("orm", "Sequelize"); }
        if (deps.mongoose) { setStack("orm", "Mongoose"); pushStack("orm", "Mongoose"); }
        if (deps["drizzle-orm"] || deps.drizzle) { setStack("orm", "Drizzle"); pushStack("orm", "Drizzle"); }
        if (deps.knex) { setStack("orm", "Knex"); pushStack("orm", "Knex"); }
        if (deps.mikro) { setStack("orm", "MikroORM"); pushStack("orm", "MikroORM"); }
        if (deps["@mikro-orm/core"]) { setStack("orm", "MikroORM"); pushStack("orm", "MikroORM"); }
        if (deps["@objection.js/objection"]) { setStack("orm", "Objection.js"); pushStack("orm", "Objection.js"); }
        if (deps.bookshelf) { setStack("orm", "Bookshelf"); pushStack("orm", "Bookshelf"); }
        if (deps.waterline) { setStack("orm", "Waterline"); pushStack("orm", "Waterline"); }
        // Database drivers (npm)
        if (deps.pg || deps["pg-promise"]) { setStack("database", "PostgreSQL"); pushStack("database", "PostgreSQL"); }
        if (deps.mysql || deps.mysql2) { setStack("database", "MySQL"); pushStack("database", "MySQL"); }
        if (deps["better-sqlite3"] || deps.sqlite3 || deps["@sqlite.org/sqlite-wasm"]) { setStack("database", "SQLite"); pushStack("database", "SQLite"); }
        if (deps.mongodb || deps["mongodb-memory-server"]) { setStack("database", "MongoDB"); pushStack("database", "MongoDB"); }
        if (deps["@libsql/client"]) { setStack("database", "libSQL"); pushStack("database", "libSQL"); }
        if (deps["@databases/mysql"] || deps["@databases/pg"] || deps["@databases/sqlite"]) { /* covered */ }
        if (deps["@clickhouse/client"]) { setStack("database", "ClickHouse"); pushStack("database", "ClickHouse"); }
        if (deps["@elastic/elasticsearch"]) { setStack("search", "Elasticsearch"); pushStack("search", "Elasticsearch"); }
        if (deps.algoliasearch) { setStack("search", "Algolia"); pushStack("search", "Algolia"); }
        if (deps.meilisearch) { setStack("search", "Meilisearch"); pushStack("search", "Meilisearch"); }
        // Cache
        if (deps.ioredis || deps.redis) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
        if (deps.memcached || deps.memjs) { setStack("cache", "Memcached"); pushStack("cache", "Memcached"); }
        if (deps["node-cache"]) { setStack("cache", "Node-Cache"); pushStack("cache", "Node-Cache"); }
        if (deps["@keyv/redis"] || deps.keyv) { setStack("cache", "Keyv"); pushStack("cache", "Keyv"); }
        // Queue / Stream
        if (deps.bull || deps.bullmq) { setStack("queue", "Bull"); pushStack("queue", "Bull"); }
        if (deps.amqplib) { setStack("queue", "RabbitMQ"); pushStack("queue", "RabbitMQ"); }
        if (deps["kafkajs"]) { setStack("queue", "Kafka"); pushStack("queue", "Kafka"); }
        if (deps["@upstash/kafka"]) { setStack("queue", "Upstash Kafka"); pushStack("queue", "Upstash Kafka"); }
        if (deps["nats.io"]) { setStack("queue", "NATS"); pushStack("queue", "NATS"); }
        if (deps["googleapis"]) { /* leave for LLM inference */ }
        // Auth
        if (deps.passport || deps["passport-jwt"]) { setStack("auth", "Passport.js"); pushStack("auth", "Passport.js"); }
        if (deps["next-auth"] || deps["@auth/core"]) { setStack("auth", "Auth.js (NextAuth)"); pushStack("auth", "Auth.js (NextAuth)"); }
        if (deps["@clerk/nextjs"] || deps["@clerk/clerk-sdk-node"]) { setStack("auth", "Clerk"); pushStack("auth", "Clerk"); }
        if (deps["@auth0/nextjs-auth0"]) { setStack("auth", "Auth0"); pushStack("auth", "Auth0"); }
        if (deps["@supabase/supabase-js"]) { setStack("auth", "Supabase"); pushStack("auth", "Supabase"); }
        if (deps["firebase"]) { setStack("auth", "Firebase"); pushStack("auth", "Firebase"); }
        if (deps["jsonwebtoken"]) { setStack("auth", "JWT"); pushStack("auth", "JWT"); }
        if (deps["jose"]) { setStack("auth", "JOSE"); pushStack("auth", "JOSE"); }
        // API
        if (deps["@grpc/grpc-js"] || deps["@grpc/proto-loader"]) { setStack("api", "gRPC"); pushStack("api", "gRPC"); }
        if (deps["graphql"] || deps["@apollo/server"]) { setStack("api", "GraphQL"); pushStack("api", "GraphQL"); }
        if (deps["@trpc/server"]) { setStack("api", "tRPC"); pushStack("api", "tRPC"); }
        if (deps["swagger-ui-express"] || deps["@nestjs/swagger"]) { setStack("api", "OpenAPI/Swagger"); pushStack("api", "OpenAPI/Swagger"); }
        // Observability
        if (deps["prom-client"]) { setStack("observability", "Prometheus"); pushStack("observability", "Prometheus"); }
        if (deps["@sentry/node"] || deps["@sentry/react-native"] || deps["@sentry/browser"]) { setStack("observability", "Sentry"); pushStack("observability", "Sentry"); }
        if (deps["@opentelemetry/api"] || deps["@opentelemetry/sdk-node"]) { setStack("observability", "OpenTelemetry"); pushStack("observability", "OpenTelemetry"); }
        if (deps["pino"]) { setStack("observability", "Pino"); pushStack("observability", "Pino"); }
        if (deps.winston) { setStack("observability", "Winston"); pushStack("observability", "Winston"); }
        if (deps["winston-pino"]) { /* covered */ }
        if (deps["dd-trace"]) { setStack("observability", "Datadog APM"); pushStack("observability", "Datadog APM"); }
        // Payment
        if (deps.stripe) { setStack("payment", "Stripe"); pushStack("payment", "Stripe"); }
        if (deps["@paypal/checkout-server-sdk"]) { setStack("payment", "PayPal"); pushStack("payment", "PayPal"); }
        // AI/ML
        if (deps["openai"]) { setStack("ai", "OpenAI SDK"); pushStack("ai", "OpenAI SDK"); }
        if (deps["@anthropic-ai/sdk"]) { setStack("ai", "Anthropic SDK"); pushStack("ai", "Anthropic SDK"); }
        if (deps["@google/generative-ai"]) { setStack("ai", "Google Generative AI"); pushStack("ai", "Google Generative AI"); }
        if (deps["cohere-ai"]) { setStack("ai", "Cohere"); pushStack("ai", "Cohere"); }
        if (deps["langchain"] || deps["@langchain/core"]) { setStack("ai", "LangChain"); pushStack("ai", "LangChain"); }
        if (deps["llamaindex"]) { setStack("ai", "LlamaIndex"); pushStack("ai", "LlamaIndex"); }
        // Engineering tooling（構建/Lint/測試/型別/包管理）—— 不進 stack
        if (deps.vite) result.tooling.push("Vite");
        if (deps.webpack) result.tooling.push("webpack");
        if (deps.esbuild) result.tooling.push("esbuild");
        if (deps.rollup) result.tooling.push("Rollup");
        if (deps.parcel) result.tooling.push("Parcel");
        if (deps.turbo) result.tooling.push("Turbopack");
        if (deps["@swc/core"]) result.tooling.push("SWC");
        if (deps.babel || deps["@babel/core"]) result.tooling.push("Babel");
        if (deps.tsup) result.tooling.push("tsup");
        if (deps.typescript) result.tooling.push("TypeScript");
        if (deps.eslint) result.tooling.push("ESLint");
        if (deps["@biomejs/biome"]) result.tooling.push("Biome");
        if (deps.prettier) result.tooling.push("Prettier");
        if (deps.jest) result.tooling.push("Jest");
        if (deps.vitest) result.tooling.push("Vitest");
        if (deps.mocha) result.tooling.push("Mocha");
        if (deps["ava"]) result.tooling.push("AVA");
        if (deps.tap) result.tooling.push("tap");
        if (deps["@playwright/test"] || deps.playwright) result.tooling.push("Playwright");
        if (deps.cypress) result.tooling.push("Cypress");
        if (deps.puppeteer) result.tooling.push("Puppeteer");
        if (deps["testcontainers"]) result.tooling.push("Testcontainers");
        if (deps.tailwindcss) result.tooling.push("Tailwind CSS");
        if (deps["styled-components"]) result.tooling.push("styled-components");
        if (deps["@emotion/react"]) result.tooling.push("Emotion");
        if (deps.sass || deps["sass-loader"]) result.tooling.push("Sass");
        if (deps["postcss"]) result.tooling.push("PostCSS");
        // 包管理器（通過 lockfile 檢測，由 build.js 補）
        if (pkg.workspaces) { setStack("structure", "Monorepo"); if (!result.structure.includes("Monorepo")) result.structure.push("Monorepo"); }
        // 入口：npm run dev / build（僅當 scripts 存在時）
        if (pkg.scripts && pkg.scripts.dev) {
          result.entrypoints.push({ path: "npm run dev", type: "script" });
        }
        if (pkg.scripts && pkg.scripts.build) {
          result.entrypoints.push({ path: "npm run build", type: "script" });
        }
      } catch (e) { /* ignore parse error */ }
    }
  }

  // —— Python ——
  const requirementParts = [];
  for (const reqName of names.filter(isPythonRequirementsName)) {
    const txt = await readText(fs, rootPath, reqName);
    if (txt) requirementParts.push(txt);
  }
  const requirements = requirementParts.length ? requirementParts.join("\n") : null;
  const pyProject = names.includes("pyproject.toml") ? await readText(fs, rootPath, "pyproject.toml") : null;
  // v1.2.x patch #4：加 Pipfile（pipenv）/ setup.cfg 識別
  const pipfile = names.includes("Pipfile") ? await readText(fs, rootPath, "Pipfile") : null;
  const setupCfg = names.includes("setup.cfg") ? await readText(fs, rootPath, "setup.cfg") : null;
  // 合併所有 Python manifest 用於 pyHas 檢測
  const pyAllSources = [pyProject, requirements, pipfile, setupCfg].filter(Boolean).join("\n");
  // helper：檢查所有 Python manifest（pyproject/requirements/Pipfile/setup.cfg）是否含某包名
  const pyHas = (pkg) => {
    const re = new RegExp("(?:^|\\s|\\[|\\b)" + pkg + "(?:\\b|\\s|\\[|>=|<|=|!|~)", "i");
    return pyAllSources ? re.test(pyAllSources) : false;
  };
  // Backend frameworks
  if (pyHas("fastapi")) { setStack("backend", "FastAPI"); pushStack("framework-backend", "FastAPI"); }
  else if (pyHas("django")) { setStack("backend", "Django"); pushStack("framework-backend", "Django"); }
  else if (pyHas("flask")) { setStack("backend", "Flask"); pushStack("framework-backend", "Flask"); }
  else if (pyHas("sanic")) { setStack("backend", "Sanic"); pushStack("framework-backend", "Sanic"); }
  else if (pyHas("starlette")) { setStack("backend", "Starlette"); pushStack("framework-backend", "Starlette"); }
  else if (pyHas("aiohttp")) { setStack("backend", "aiohttp"); pushStack("framework-backend", "aiohttp"); }
  else if (pyHas("tornado")) { setStack("backend", "Tornado"); pushStack("framework-backend", "Tornado"); }
  else if (pyHas("pyramid")) { setStack("backend", "Pyramid"); pushStack("framework-backend", "Pyramid"); }
  else if (pyHas("bottle")) { setStack("backend", "Bottle"); pushStack("framework-backend", "Bottle"); }
  else if (pyHas("cherrypy")) { setStack("backend", "CherryPy"); pushStack("framework-backend", "CherryPy"); }
  else if (pyHas("falcon")) { setStack("backend", "Falcon"); pushStack("framework-backend", "Falcon"); }
  else if (pyHas("hug")) { setStack("backend", "Hug"); pushStack("framework-backend", "Hug"); }
  else if (pyHas("masonite")) { setStack("backend", "Masonite"); pushStack("framework-backend", "Masonite"); }
  else if (pyHas("litestar")) { setStack("backend", "Litestar"); pushStack("framework-backend", "Litestar"); }
  else if (pyHas("nevo")) { /* skip */ }
  else if (pyHas("streamlit")) { setStack("frontend", "Streamlit"); pushStack("framework-frontend", "Streamlit"); }
  else if (pyHas("gradio")) { setStack("frontend", "Gradio"); pushStack("framework-frontend", "Gradio"); }
  else if (pyHas("dash")) { setStack("frontend", "Dash"); pushStack("framework-frontend", "Dash"); }
  else if (pyHas("panel")) { setStack("frontend", "Panel"); pushStack("framework-frontend", "Panel"); }
  else if (pyHas("nicegui")) { setStack("frontend", "NiceGUI"); pushStack("framework-frontend", "NiceGUI"); }
  else if (pyHas("taipy")) { setStack("frontend", "Taipy"); pushStack("framework-frontend", "Taipy"); }
  else if (pyHas("flet")) { setStack("desktop", "Flet"); pushStack("desktop", "Flet"); }
  // ORM
  if (pyHas("sqlalchemy")) { setStack("orm", "SQLAlchemy"); pushStack("orm", "SQLAlchemy"); }
  if (pyHas("peewee")) { setStack("orm", "Peewee"); pushStack("orm", "Peewee"); }
  if (pyHas("tortoise-orm")) { setStack("orm", "Tortoise ORM"); pushStack("orm", "Tortoise ORM"); }
  if (pyHas("django")) { setStack("orm", "Django ORM"); pushStack("orm", "Django ORM"); }
  if (pyHas("sqlmodel")) { setStack("orm", "SQLModel"); pushStack("orm", "SQLModel"); }
  if (pyHas("pony")) { setStack("orm", "Pony ORM"); pushStack("orm", "Pony ORM"); }
  if (pyHas("ormar")) { setStack("orm", "Ormar"); pushStack("orm", "Ormar"); }
  if (pyHas("piccolo")) { setStack("orm", "Piccolo"); pushStack("orm", "Piccolo"); }
  if (pyHas("dataset")) { setStack("orm", "dataset"); pushStack("orm", "dataset"); }
  // Database drivers
  if (pyHas("asyncpg") || pyHas("psycopg2") || pyHas("psycopg")) { setStack("database", "PostgreSQL"); pushStack("database", "PostgreSQL"); }
  if (pyHas("aiomysql") || pyHas("pymysql") || pyHas("mysqlclient") || pyHas("mysql-connector-python")) { setStack("database", "MySQL"); pushStack("database", "MySQL"); }
  if (pyHas("pymongo") || pyHas("motor")) { setStack("database", "MongoDB"); pushStack("database", "MongoDB"); }
  if (pyHas("sqlite3") || pyHas("aiosqlite")) { setStack("database", "SQLite"); pushStack("database", "SQLite"); }
  if (pyHas("clickhouse-driver")) { setStack("database", "ClickHouse"); pushStack("database", "ClickHouse"); }
  if (pyHas("cassandra-driver")) { setStack("database", "Cassandra"); pushStack("database", "Cassandra"); }
  if (pyHas("influxdb-client")) { setStack("database", "InfluxDB"); pushStack("database", "InfluxDB"); }
  if (pyHas("elasticsearch")) { setStack("search", "Elasticsearch"); pushStack("search", "Elasticsearch"); }
  if (pyHas("opensearchpy")) { setStack("search", "OpenSearch"); pushStack("search", "OpenSearch"); }
  // Cache
  if (pyHas("redis") || pyHas("aioredis")) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
  if (pyHas("pymemcache")) { setStack("cache", "Memcached"); pushStack("cache", "Memcached"); }
  // Queue
  if (pyHas("celery")) { setStack("queue", "Celery"); pushStack("queue", "Celery"); }
  if (pyHas("rq")) { setStack("queue", "RQ"); pushStack("queue", "RQ"); }
  if (pyHas("dramatiq")) { setStack("queue", "Dramatiq"); pushStack("queue", "Dramatiq"); }
  if (pyHas("huey")) { setStack("queue", "Huey"); pushStack("queue", "Huey"); }
  if (pyHas("arq")) { setStack("queue", "arq"); pushStack("queue", "arq"); }
  if (pyHas("kombu")) { /* celery dependency, already covered */ }
  if (pyHas("pika")) { setStack("queue", "RabbitMQ"); pushStack("queue", "RabbitMQ"); }
  if (pyHas("confluent-kafka") || pyHas("aiokafka")) { setStack("queue", "Kafka"); pushStack("queue", "Kafka"); }
  if (pyHas("nats-py")) { setStack("queue", "NATS"); pushStack("queue", "NATS"); }
  // Auth
  if (pyHas("django-allauth") || pyHas("django.contrib.auth")) { setStack("auth", "Django Auth"); pushStack("auth", "Django Auth"); }
  if (pyHas("flask-login") || pyHas("flask-security")) { setStack("auth", "Flask-Login"); pushStack("auth", "Flask-Login"); }
  if (pyHas("authlib")) { setStack("auth", "Authlib"); pushStack("auth", "Authlib"); }
  if (pyHas("python-jose") || pyHas("pyjwt")) { setStack("auth", "JWT"); pushStack("auth", "JWT"); }
  if (pyHas("oauthlib")) { setStack("auth", "OAuthLib"); pushStack("auth", "OAuthLib"); }
  // Observability
  if (pyHas("sentry-sdk")) { setStack("observability", "Sentry"); pushStack("observability", "Sentry"); }
  if (pyHas("prometheus-client") || pyHas("prometheus_flask_exporter")) { setStack("observability", "Prometheus"); pushStack("observability", "Prometheus"); }
  if (pyHas("opentelemetry-api") || pyHas("opentelemetry-sdk")) { setStack("observability", "OpenTelemetry"); pushStack("observability", "OpenTelemetry"); }
  if (pyHas("structlog")) { setStack("observability", "Structlog"); pushStack("observability", "Structlog"); }
  if (pyHas("loguru")) { setStack("observability", "Loguru"); pushStack("observability", "Loguru"); }
  // AI / ML — v1.2.x patch #4：AI/ML 框架全部進入主視野 stack.ai（不再歸 tooling）
  //   pandas/numpy / scikit-learn / pytorch / tensorflow / keras / jax
  //   langchain / llama-index / openai / anthropic / huggingface 已經在下面識別並 setStack("ai", ...)
  if (pyHas("pandas")) { setStack("ai", "pandas"); pushStack("ai", "pandas"); }
  if (pyHas("numpy")) { setStack("ai", "NumPy"); pushStack("ai", "NumPy"); }
  if (pyHas("polars")) { setStack("ai", "Polars"); pushStack("ai", "Polars"); }
  if (pyHas("dask")) { setStack("ai", "Dask"); pushStack("ai", "Dask"); }
  if (pyHas("scikit-learn")) { setStack("ai", "scikit-learn"); pushStack("ai", "scikit-learn"); }
  if (pyHas("torch")) { setStack("ai", "PyTorch"); pushStack("ai", "PyTorch"); }
  if (pyHas("tensorflow") || pyHas("keras")) { setStack("ai", "TensorFlow"); pushStack("ai", "TensorFlow"); }
  if (pyHas("jax") || pyHas("flax")) { setStack("ai", "JAX"); pushStack("ai", "JAX"); }
  if (pyHas("openai")) { setStack("ai", "OpenAI SDK"); pushStack("ai", "OpenAI SDK"); }
  if (pyHas("anthropic")) { setStack("ai", "Anthropic SDK"); pushStack("ai", "Anthropic SDK"); }
  if (pyHas("google-generativeai")) { setStack("ai", "Google Generative AI"); pushStack("ai", "Google Generative AI"); }
  if (pyHas("cohere")) { setStack("ai", "Cohere"); pushStack("ai", "Cohere"); }
  if (pyHas("langchain") || pyHas("langchain-core")) { setStack("ai", "LangChain"); pushStack("ai", "LangChain"); }
  if (pyHas("langgraph")) { setStack("ai", "LangGraph"); pushStack("ai", "LangGraph"); }
  if (pyHas("llama-index")) { setStack("ai", "LlamaIndex"); pushStack("ai", "LlamaIndex"); }
  if (pyHas("huggingface-hub") || pyHas("transformers")) { setStack("ai", "Hugging Face"); pushStack("ai", "Hugging Face"); }
  // 工程工具（保留）—— pandas/numpy 已遷到 stack.ai，不再 push tooling
  if (pyHas("pytest")) result.tooling.push("pytest");
  if (pyHas("ruff")) result.tooling.push("Ruff");
  if (pyHas("black")) result.tooling.push("Black");
  if (pyHas("mypy")) result.tooling.push("mypy");
  if (pyHas("flake8")) result.tooling.push("flake8");
  if (pyHas("isort")) result.tooling.push("isort");
  if (pyHas("pylint")) result.tooling.push("pylint");
  // 包管理
  if (pyProject && /\[tool\.poetry\]/.test(pyProject)) result.tooling.push("Poetry");
  if (pyProject && /\[tool\.uv\]/.test(pyProject)) result.tooling.push("uv");
  if (pyProject && /\[tool\.hatch/.test(pyProject)) result.tooling.push("Hatch");
  if (pyProject && /\[tool\.pdm\.projects\]/.test(pyProject)) result.tooling.push("PDM");
  if (pyProject && /\[tool\.rye\]/.test(pyProject)) result.tooling.push("Rye");
  if (pyProject && /\[tool\.pixi\]/.test(pyProject)) result.tooling.push("Pixi");
  if (pyProject && /setup\.py|setuptools/.test(pyProject) && !/Poetry|uv|Hatch|PDM/.test(result.tooling.join(","))) result.tooling.push("setuptools");

  // —— Go ——
  const goMod = names.includes("go.mod") ? await readText(fs, rootPath, "go.mod") : null;
  if (goMod) {
    setStack("backend", "Go");
    pushStack("framework-backend", "Go");
    // ORM / DB
    if (/gorm\.io\/gorm/.test(goMod)) { setStack("orm", "GORM"); pushStack("orm", "GORM"); }
    if (/ent\.go/.test(goMod)) { setStack("orm", "Ent"); pushStack("orm", "Ent"); }
    if (/sqlx/.test(goMod)) { setStack("orm", "sqlx"); pushStack("orm", "sqlx"); }
    if (/bun\.build/.test(goMod)) { setStack("orm", "Bun"); pushStack("orm", "Bun"); }
    if (/pgx|lib\/pq/.test(goMod)) { setStack("database", "PostgreSQL"); pushStack("database", "PostgreSQL"); }
    if (/go-sql-driver\/mysql/.test(goMod)) { setStack("database", "MySQL"); pushStack("database", "MySQL"); }
    if (/mongo-driver/.test(goMod)) { setStack("database", "MongoDB"); pushStack("database", "MongoDB"); }
    if (/go-redis\/redis/.test(goMod)) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
    if (/valkey/.test(goMod)) { setStack("cache", "Valkey"); pushStack("cache", "Valkey"); }
    if (/clickhouse-go/.test(goMod)) { setStack("database", "ClickHouse"); pushStack("database", "ClickHouse"); }
    // Web 框架
    if (/gin-gonic\/gin/.test(goMod)) { setStack("backend", "Gin"); pushStack("framework-backend", "Gin"); }
    else if (/labstack\/echo/.test(goMod)) { setStack("backend", "Echo"); pushStack("framework-backend", "Echo"); }
    else if (/gofiber\/fiber/.test(goMod)) { setStack("backend", "Fiber"); pushStack("framework-backend", "Fiber"); }
    else if (/go-chi\/chi/.test(goMod)) { setStack("backend", "Chi"); pushStack("framework-backend", "Chi"); }
    else if (/valyala\/fasthttp/.test(goMod)) { setStack("backend", "FastHTTP"); pushStack("framework-backend", "FastHTTP"); }
    else if (/grpc-ecosystem\/grpc-gateway/.test(goMod)) { setStack("api", "gRPC"); pushStack("api", "gRPC"); }
    else if (/99designs\/gqlgen/.test(goMod)) { setStack("api", "GraphQL"); pushStack("api", "GraphQL"); }
    // 佇列
    if (/segmentio\/kafka-go/.test(goMod) || /confluentinc\/confluent-kafka-go/.test(goMod)) { setStack("queue", "Kafka"); pushStack("queue", "Kafka"); }
    if (/nats-io\/nats\.go/.test(goMod)) { setStack("queue", "NATS"); pushStack("queue", "NATS"); }
    if (/streadway\/amqp/.test(goMod) || /rabbitmq\/amqp091-go/.test(goMod)) { setStack("queue", "RabbitMQ"); pushStack("queue", "RabbitMQ"); }
    // 認證
    if (/golang-jwt\/jwt/.test(goMod) || /lestrrat-go\/jxw/.test(goMod)) { setStack("auth", "JWT"); pushStack("auth", "JWT"); }
    if (/coreos\/go-oidc/.test(goMod) || /oauth2/.test(goMod)) { setStack("auth", "OAuth2/OIDC"); pushStack("auth", "OAuth2/OIDC"); }
    // 可觀測性
    if (/prometheus\/client_golang/.test(goMod)) { setStack("observability", "Prometheus"); pushStack("observability", "Prometheus"); }
    if (/getsentry\/sentry-go/.test(goMod)) { setStack("observability", "Sentry"); pushStack("observability", "Sentry"); }
    if (/opentelemetry\/otel/.test(goMod)) { setStack("observability", "OpenTelemetry"); pushStack("observability", "OpenTelemetry"); }
    // AI
    if (/sashabaranov\/go-openai/.test(goMod)) { setStack("ai", "OpenAI SDK"); pushStack("ai", "OpenAI SDK"); }
    if (/anthropics\/anthropic-sdk-go/.test(goMod)) { setStack("ai", "Anthropic SDK"); pushStack("ai", "Anthropic SDK"); }
  }
  // —— Java ——
  const pomXml = names.includes("pom.xml") ? await readText(fs, rootPath, "pom.xml") : null;
  const buildGradle = names.some((n) => n === "build.gradle" || n === "build.gradle.kts") ? await readText(fs, rootPath, names.find((n) => n === "build.gradle" || n === "build.gradle.kts")) : null;
  if (pomXml || buildGradle) {
    const javaText = (pomXml || "") + "\n" + (buildGradle || "");
    // Spring Boot 細分
    if (/spring-boot-starter|spring-boot-starter-web|spring-boot-starter-data/i.test(javaText)) {
      setStack("backend", "Spring Boot");
      pushStack("framework-backend", "Spring Boot");
    } else if (/spring-framework/i.test(javaText)) {
      setStack("backend", "Spring (Maven)");
      pushStack("framework-backend", "Spring Framework");
    } else if (pomXml || buildGradle) {
      setStack("backend", "Java");
      pushStack("framework-backend", "Java");
    }
    // 其他 Java 框架
    if (/quarkus/.test(javaText)) { setStack("framework-backend", "Quarkus"); pushStack("framework-backend", "Quarkus"); }
    if (/micronaut/.test(javaText)) { setStack("framework-backend", "Micronaut"); pushStack("framework-backend", "Micronaut"); }
    if (/jakarta\.ee|javax\.servlet|jakarta\.servlet/.test(javaText)) { /* implicit */ }
    // ORM
    if (/hibernate|spring-data-jpa/.test(javaText)) { setStack("orm", "Hibernate"); pushStack("orm", "Hibernate"); }
    if (/mybatis/.test(javaText)) { setStack("orm", "MyBatis"); pushStack("orm", "MyBatis"); }
    if (/spring-data-mongodb/.test(javaText)) { setStack("database", "MongoDB"); pushStack("database", "MongoDB"); }
    if (/spring-data-redis/.test(javaText)) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
    if (/spring-kafka/.test(javaText)) { setStack("queue", "Kafka"); pushStack("queue", "Kafka"); }
    if (/rabbitmq|spring-amqp/.test(javaText)) { setStack("queue", "RabbitMQ"); pushStack("queue", "RabbitMQ"); }
    if (/spring-cloud|micrometer/.test(javaText)) { setStack("observability", "Micrometer"); pushStack("observability", "Micrometer"); }
    if (pomXml && /gradle/.test(pomXml)) {
      /* gradle misconfig, ignore */
    }
  }
  // —— Kotlin / Scala 獨立識別 ——
  if (names.some((n) => /\.kt$|\.kts$/i.test(n))) {
    setStack("framework-backend", "Kotlin");
    pushStack("framework-backend", "Kotlin");
  }
  if (names.some((n) => /\.scala$|sbt$/i.test(n))) {
    if (names.includes("build.sbt")) {
      setStack("framework-backend", "Scala (sbt)");
      pushStack("framework-backend", "Scala (sbt)");
    } else {
      setStack("framework-backend", "Scala");
      pushStack("framework-backend", "Scala");
    }
  }
  // —— Flutter / Dart ——
  if (names.includes("pubspec.yaml")) {
    const pubspec = await readText(fs, rootPath, "pubspec.yaml");
    if (pubspec) {
      if (/^flutter\s*:/m.test(pubspec) || /\bflutter\s*:\s*[\s\S]*sdk:\s*flutter/m.test(pubspec)) {
        setStack("mobile", "Flutter");
        pushStack("mobile", "Flutter");
      } else {
        setStack("framework-backend", "Dart");
        pushStack("framework-backend", "Dart");
      }
      if (/^name:\s*(\S+)/m.test(pubspec)) {
        const match = pubspec.match(/^name:\s*(\S+)/m);
        if (match && !result.projectName) result.projectName = match[1];
      }
    }
  }
  // —— .NET ——
  if (names.some((n) => /\.csproj$|\.sln$|\.fsproj$/i.test(n))) {
    setStack("framework-backend", ".NET");
    pushStack("framework-backend", ".NET");
  }
  if (names.some((n) => /\.csproj$/.test(n))) {
    /* ASP.NET 隱式覆蓋 */
  }
  // —— Rust ——
  const cargoToml = names.includes("Cargo.toml") ? await readText(fs, rootPath, "Cargo.toml") : null;
  if (cargoToml) {
    setStack("backend", "Rust");
    pushStack("framework-backend", "Rust");
    // 識別子 crate workspace
    if (/\[workspace\]/.test(cargoToml)) {
      setStack("structure", "Cargo Workspace");
      if (!result.structure.includes("Cargo Workspace")) result.structure.push("Cargo Workspace");
    }
    // Web 框架
    if (/^actix-web\s*=/m.test(cargoToml)) { setStack("backend", "Actix Web"); pushStack("framework-backend", "Actix Web"); }
    else if (/^axum\s*=/m.test(cargoToml)) { setStack("backend", "Axum"); pushStack("framework-backend", "Axum"); }
    else if (/^rocket\s*=/m.test(cargoToml)) { setStack("backend", "Rocket"); pushStack("framework-backend", "Rocket"); }
    else if (/^warp\s*=/m.test(cargoToml)) { setStack("backend", "Warp"); pushStack("framework-backend", "Warp"); }
    else if (/^tide\s*=/m.test(cargoToml)) { setStack("backend", "Tide"); pushStack("framework-backend", "Tide"); }
    else if (/^salvo\s*=/m.test(cargoToml)) { setStack("backend", "Salvo"); pushStack("framework-backend", "Salvo"); }
    else if (/^leptos\s*=/m.test(cargoToml)) { setStack("framework-fullstack", "Leptos"); pushStack("framework-fullstack", "Leptos"); }
    else if (/^dioxus\s*=/m.test(cargoToml)) { setStack("framework-fullstack", "Dioxus"); pushStack("framework-fullstack", "Dioxus"); }
    else if (/^yew\s*=/m.test(cargoToml)) { setStack("framework-frontend", "Yew"); pushStack("framework-frontend", "Yew"); }
    else if (/^tauri\s*=/m.test(cargoToml)) { setStack("desktop", "Tauri"); pushStack("desktop", "Tauri"); }
    // ORM
    if (/^diesel\s*=/m.test(cargoToml)) { setStack("orm", "Diesel"); pushStack("orm", "Diesel"); }
    if (/^sea-orm\s*=/m.test(cargoToml)) { setStack("orm", "SeaORM"); pushStack("orm", "SeaORM"); }
    if (/^sqlx\s*=/m.test(cargoToml)) { setStack("orm", "SQLx"); pushStack("orm", "SQLx"); }
    if (/^rusqlite\s*=/m.test(cargoToml)) { setStack("database", "SQLite"); pushStack("database", "SQLite"); }
    // DB
    if (/^postgres\s*=/m.test(cargoToml)) { setStack("database", "PostgreSQL"); pushStack("database", "PostgreSQL"); }
    if (/^mysql\s*=/m.test(cargoToml)) { setStack("database", "MySQL"); pushStack("database", "MySQL"); }
    if (/^redis\s*=/m.test(cargoToml)) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
    // gRPC / API
    if (/^tonic\s*=/m.test(cargoToml)) { setStack("api", "gRPC"); pushStack("api", "gRPC"); }
    // Auth
    if (/^jsonwebtoken\s*=/m.test(cargoToml)) { setStack("auth", "JWT"); pushStack("auth", "JWT"); }
    if (/^oauth2\s*=/m.test(cargoToml)) { setStack("auth", "OAuth2"); pushStack("auth", "OAuth2"); }
    // AI
    if (/async-openai/.test(cargoToml)) { setStack("ai", "OpenAI SDK"); pushStack("ai", "OpenAI SDK"); }
    if (/anthropic-sdk-rs|anthropic-rs/.test(cargoToml)) { setStack("ai", "Anthropic SDK"); pushStack("ai", "Anthropic SDK"); }
    if (/candle-core/.test(cargoToml)) { setStack("ai", "Candle"); pushStack("ai", "Candle"); }
    if (/tch-rs/.test(cargoToml)) { setStack("ai", "tch (PyTorch)"); pushStack("ai", "tch (PyTorch)"); }
    // 工具
    if (/^tokio\s*=/m.test(cargoToml)) result.tooling.push("Tokio");
    if (/^serde\s*=/m.test(cargoToml)) result.tooling.push("Serde");
  }
  // —— 頂層基礎設施：Web Server / 容器 / IaC / CI / k8s ——
  // Dockerfile 檢測：從內容找 FROM nginx/caddy/traefik/apache/httpd（更魯棒，支援 multi-stage）
  const dockerfileNames = names.filter((n) => /^Dockerfile(\..+)?$/.test(n));
  if (dockerfileNames.length > 0) {
    setStack("container", "Docker");
    pushStack("container", "Docker");
  }
  for (const df of dockerfileNames) {
    const txt = await readText(fs, rootPath, df);
    if (!txt) continue;
    // global match：multi-stage build 有多個 FROM，全部要識別
    const fromRe = /^\s*FROM\s+([^\s]+)/gm;
    let m;
    while ((m = fromRe.exec(txt)) !== null) {
      const img = m[1].toLowerCase();
      if (/(^|\/)nginx\b/.test(img)) { setStack("webserver", "Nginx"); pushStack("webserver", "Nginx"); }
      if (/(^|\/)caddy\b/.test(img)) { setStack("webserver", "Caddy"); pushStack("webserver", "Caddy"); }
      if (/(^|\/)traefik\b/.test(img)) { setStack("webserver", "Traefik"); pushStack("webserver", "Traefik"); }
      if (/(^|\/)(apache|httpd)\b/.test(img)) { setStack("webserver", "Apache"); pushStack("webserver", "Apache"); }
      // 不識別純基礎映象（node/python/alpine/ubuntu/debian）
    }
  }
  // docker-compose / compose 檔案
  const composeNames = names.filter((n) => /^(docker-compose|compose)(\..+)?\.(yml|yaml)$/.test(n));
  for (const cf of composeNames) {
    const txt = await readText(fs, rootPath, cf);
    if (!txt) continue;
    setStack("container", "Docker Compose");
    pushStack("container", "Docker Compose");
    const lower = txt.toLowerCase();
    if (/image:\s*(nginx|caddy|traefik|httpd|apache)/i.test(txt)) {
      /* handled below per-service */
    }
    // 服務級識別（粗略掃描常見 image: xxx）
    const imageRe = /image:\s*([^\s]+)/gi;
    let m;
    while ((m = imageRe.exec(txt)) !== null) {
      const img = m[1].toLowerCase().replace(/['"]/g, "");
      if (/(^|\/)nginx\b/.test(img)) { setStack("webserver", "Nginx"); pushStack("webserver", "Nginx"); }
      if (/(^|\/)caddy\b/.test(img)) { setStack("webserver", "Caddy"); pushStack("webserver", "Caddy"); }
      if (/(^|\/)traefik\b/.test(img)) { setStack("webserver", "Traefik"); pushStack("webserver", "Traefik"); }
      if (/(^|\/)(apache|httpd)\b/.test(img)) { setStack("webserver", "Apache"); pushStack("webserver", "Apache"); }
      if (/(^|\/)redis\b/.test(img)) { setStack("cache", "Redis"); pushStack("cache", "Redis"); }
      if (/(^|\/)postgres\b/.test(img)) { setStack("database", "PostgreSQL"); pushStack("database", "PostgreSQL"); }
      if (/(^|\/)mysql\b/.test(img)) { setStack("database", "MySQL"); pushStack("database", "MySQL"); }
      if (/(^|\/)mariadb\b/.test(img)) { setStack("database", "MariaDB"); pushStack("database", "MariaDB"); }
      if (/(^|\/)mongo\b/.test(img)) { setStack("database", "MongoDB"); pushStack("database", "MongoDB"); }
      if (/(^|\/)elasticsearch\b/.test(img)) { setStack("search", "Elasticsearch"); pushStack("search", "Elasticsearch"); }
      if (/(^|\/)rabbitmq\b/.test(img)) { setStack("queue", "RabbitMQ"); pushStack("queue", "RabbitMQ"); }
      if (/(^|\/)kafka\b/.test(img)) { setStack("queue", "Kafka"); pushStack("queue", "Kafka"); }
      if (/(^|\/)nats\b/.test(img)) { setStack("queue", "NATS"); pushStack("queue", "NATS"); }
      if (/(^|\/)clickhouse\b/.test(img)) { setStack("database", "ClickHouse"); pushStack("database", "ClickHouse"); }
      if (/(^|\/)grafana\b/.test(img)) { setStack("observability", "Grafana"); pushStack("observability", "Grafana"); }
      if (/(^|\/)prometheus\b/.test(img)) { setStack("observability", "Prometheus"); pushStack("observability", "Prometheus"); }
      if (/(^|\/)loki\b/.test(img)) { setStack("observability", "Loki"); pushStack("observability", "Loki"); }
      if (/(^|\/)traefik\b/.test(img)) { /* duplicate */ }
      if (/(^|\/)keycloak\b/.test(img)) { setStack("auth", "Keycloak"); pushStack("auth", "Keycloak"); }
      if (/(^|\/)vault\b/.test(img)) { setStack("auth", "Vault"); pushStack("auth", "Vault"); }
    }
  }
  // 獨立配置檔案：Caddyfile / nginx.conf / Traefik 動態配置
  if (names.includes("Caddyfile")) { setStack("webserver", "Caddy"); pushStack("webserver", "Caddy"); }
  if (names.some((n) => /^nginx(\..+)?\.conf$|^nginx\.conf$/.test(n))) { setStack("webserver", "Nginx"); pushStack("webserver", "Nginx"); }
  if (names.some((n) => /^traefik(\..+)?\.yml$|^traefik(\..+)?\.yaml$/.test(n))) { setStack("webserver", "Traefik"); pushStack("webserver", "Traefik"); }
  // Kubernetes / Helm
  if (names.includes("k8s") || names.includes("kubernetes")) { setStack("iac", "Kubernetes"); pushStack("iac", "Kubernetes"); }
  if (names.some((n) => /(^|\/)deployment\.ya?ml$|(^|\/)service\.ya?ml$|(^|\/)ingress\.ya?ml$|(^|\/)statefulset\.ya?ml$|(^|\/)configmap\.ya?ml$/.test(n))) { setStack("iac", "Kubernetes"); pushStack("iac", "Kubernetes"); }
  // Helm chart
  if (names.includes("Chart.yaml") || names.some((n) => /^charts?\/[^\/]+\/Chart\.yaml$/.test(n))) { setStack("iac", "Helm"); pushStack("iac", "Helm"); }
  // kustomize
  if (names.includes("kustomization.yaml") || names.includes("kustomization.yml")) { setStack("iac", "Kustomize"); pushStack("iac", "Kustomize"); }
  // IaC
  if (names.some((n) => n.endsWith(".tf"))) { setStack("iac", "Terraform"); pushStack("iac", "Terraform"); }
  if (names.some((n) => /\.tfstate$/.test(n))) { /* covered by .tf */ }
  if (names.includes("Pulumi.yaml") || names.includes("Pulumi.yml")) { setStack("iac", "Pulumi"); pushStack("iac", "Pulumi"); }
  if (names.includes("ansible.cfg") || names.some((n) => /^playbook\.ya?ml$|roles\//.test(n))) { setStack("iac", "Ansible"); pushStack("iac", "Ansible"); }
  if (names.some((n) => /^cloudformation\/|\.cf\.json$|\.cfn\.yaml$|\.cfn\.yml$/.test(n))) { setStack("iac", "CloudFormation"); pushStack("iac", "CloudFormation"); }
  if (names.some((n) => /\.bicep$/.test(n))) { setStack("iac", "Bicep"); pushStack("iac", "Bicep"); }
  // CI/CD
  if (names.includes(".github")) { setStack("ci", "GitHub Actions"); pushStack("ci", "GitHub Actions"); }
  if (names.includes(".gitlab-ci.yml")) { setStack("ci", "GitLab CI"); pushStack("ci", "GitLab CI"); }
  if (names.includes(".circleci")) { setStack("ci", "CircleCI"); pushStack("ci", "CircleCI"); }
  if (names.includes("Jenkinsfile")) { setStack("ci", "Jenkins"); pushStack("ci", "Jenkins"); }
  if (names.includes(".travis.yml")) { setStack("ci", "Travis CI"); pushStack("ci", "Travis CI"); }
  if (names.some((n) => /^azure-pipelines.*\.yml$/.test(n))) { setStack("ci", "Azure Pipelines"); pushStack("ci", "Azure Pipelines"); }
  if (names.some((n) => /^bitbucket-pipelines\.yml$/.test(n))) { setStack("ci", "Bitbucket Pipelines"); pushStack("ci", "Bitbucket Pipelines"); }
  if (names.some((n) => /^\.drone\.yml$|^drone\.yml$/.test(n))) { setStack("ci", "Drone"); pushStack("ci", "Drone"); }
  // 包管理器（lockfile 檢測）
  if (names.includes("pnpm-lock.yaml") || names.includes("pnpm-workspace.yaml")) result.tooling.push("pnpm");
  if (names.includes("yarn.lock")) result.tooling.push("Yarn");
  if (names.includes("package-lock.json")) result.tooling.push("npm");
  if (names.includes("bun.lockb") || names.includes("bun.lock")) result.tooling.push("Bun");
  // Monorepo 工具
  if (names.includes("pnpm-workspace.yaml") || names.includes("turbo.json") || names.includes("nx.json")) {
    setStack("structure", "Monorepo");
    if (!result.structure.includes("Monorepo")) result.structure.push("Monorepo");
  }
  if (names.includes("lerna.json")) {
    setStack("structure", "Lerna Monorepo");
    if (!result.structure.includes("Lerna Monorepo")) result.structure.push("Lerna Monorepo");
  }
  if (names.includes("rush.json")) {
    setStack("structure", "Rush Monorepo");
    if (!result.structure.includes("Rush Monorepo")) result.structure.push("Rush Monorepo");
  }
  // 構建/Make
  if (names.includes("Makefile")) result.tooling.push("Make");
  // 檢測 SQL 檔案存在（之前 EXT_LANG 有 .sql 但 techStack 沒資料庫欄位）
  if (result.languages.sql && !result.techStack.database) {
    setStack("database", "SQL");
    pushStack("database", "SQL");
  }

  // README 首段通常比目錄名更能幫助使用者快速理解陌生專案。
  if (!result.description) {
    const readmeName = names.find((n) => /^readme(?:\.[a-z0-9]+)?$/i.test(n));
    if (readmeName) result.description = firstReadmeParagraph(await readText(fs, rootPath, readmeName));
  }

  // —— 入口候選（遞迴完成後按相對路徑判斷）——
  const entryCandidates = [
    ["main.ts", "service"], ["main.js", "service"],
    ["index.ts", "service"], ["index.js", "service"],
    ["app.py", "service"], ["server.py", "service"],
    ["manage.py", "cli"],
    ["cmd/main.go", "service"], ["main.go", "service"],
    ["src/main.ts", "service"], ["src/main.js", "service"],
    ["src/index.ts", "service"], ["src/index.js", "service"],
  ];
  // —— 遞迴掃檔案 / 目錄（限深 5，足夠覆蓋典型專案 src/host/store/...）——
  const relativeFiles = new Set();
  async function scanDepth(target, depth, prefix) {
    if (depth > 5) return;
    let sub;
    try { sub = await fs.listDir(target); } catch (e) { return; }
    for (const e of sub) {
      if (!e || !e.name) continue;
      if (shouldIgnoreDir(e.name)) continue;
      const kind = entryKind(e);
      if (kind === "file") {
        result.fileCount += 1;
        const rel = prefix ? prefix + "/" + e.name : e.name;
        relativeFiles.add(rel);
        const lower = e.name.toLowerCase();
        for (const [ext, lang] of Object.entries(EXT_LANG)) {
          if (lower.endsWith(ext)) {
            result.languages[lang] = (result.languages[lang] || 0) + 1;
            break;
          }
        }
      } else if (kind === "directory") {
        const subT = await childTarget(fs, target, e);
        if (!subT) continue;
        const nextPrefix = prefix ? prefix + "/" + e.name : e.name;
        await scanDepth(subT, depth + 1, nextPrefix);
      }
      // kind === 'other' 跳過（symlink / 不識別）
    }
  }
  await scanDepth(rootTarget, 0, "");

  for (const [cand, type] of entryCandidates) {
    if (relativeFiles.has(cand) && !result.entrypoints.some((e) => e.path === cand)) {
      result.entrypoints.push({ path: cand, type });
    }
  }
  result.tooling = Array.from(new Set(result.tooling)).sort();
  // 架構分析只消費相對路徑，不在 project.json 中暴露機器絕對路徑。
  result.files = Array.from(relativeFiles).sort();

  // v1.2.x patch #4：把常被誤歸為"工具"的 AI/ML 資料棧庫提升到主視野 stack.ai
  //   使用者的"能量分析"專案（資料科學典型）只裝 pandas/numpy/pytorch 等，
  //   它們被歸到 tooling 後摺疊，主視野顯示空——所以要把它們升級到 stack.ai
  promoteAIMLToStack(result);

  // v1.2.x patch #4：兜底——manifest 為空時掃原始碼 import 找 framework
  //   僅當 stack 完全為空時啟用（避免與 manifest 識別重複）
  await fallbackScanImports(fs, rootTarget, result);

  // v1.2.x patch #3：按 popularity 分數降序排序 stack 各欄位（使用者核心訴求：主要的在前）
  sortStackByPopularity(result.stack);

  return result;
}
