import { randomUUID } from "crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { dirname, resolve } from "path";

const LOG_FORMAT = process.env.LOG_FORMAT ?? "pretty";
const LOG_FILE_ENABLED = process.env.LOG_FILE_ENABLED !== "false";
const LOG_FILE_DIR = process.env.LOG_FILE_DIR ?? "logs";
const LOG_FILE_TIME_UNIT = process.env.LOG_FILE_TIME_UNIT ?? "hour";
const LOG_FILE_MAX_BYTES = Number(process.env.LOG_FILE_MAX_BYTES ?? 5 * 1024 * 1024);
const LOG_FILE_MAX_BACKUPS = Number(process.env.LOG_FILE_MAX_BACKUPS ?? 5);
const LOG_FILE_RETENTION_DAYS = Number(process.env.LOG_FILE_RETENTION_DAYS ?? 7);
let lastLogRetentionPruneDay = "";

const MESSAGE_LABELS = {
  voiceMonitor: {
    invalid_json: "JSON 解析失败",
    invalid_status: "状态值非法",
    request_completed: "语音状态",
  },
  listenQwen: {
    invalid_json: "JSON 解析失败",
    request_received: "收到请求",
    branch_speech_context: "对话转发 DeepSeek",
    branch_cmd: "命令固定回复",
    response_ready: "返回响应",
    unknown_event: "未知事件",
  },
  deepseek: {
    request_start: "请求 DeepSeek",
    api_key_missing: "DeepSeek 缺少 API Key",
    response_received: "DeepSeek 已响应",
    request_failed_status: "DeepSeek 状态异常",
    request_success: "DeepSeek 完成",
    request_exception: "DeepSeek 异常",
  },
};

const KEY_LABELS = {
  traceId: "trace",
  requestId: "req",
  sessionId: "session",
  robotId: "robot",
  functionName: "function",
  contentPreview: "user",
  functionParamPreview: "param",
  replyPreview: "reply",
  answerPreview: "answer",
  answerLength: "chars",
  returnedLength: "outChars",
  chunkCount: "chunks",
  hasFunctionParam: "hasParam",
  hasApiKey: "key",
  statusCode: "http",
  durationMs: "cost",
  baseUrl: "upstream",
  stream: "mode",
  wasTruncated: "truncated",
};

const DETAIL_ORDER = [
  "traceId",
  "requestId",
  "sessionId",
  "stream",
  "robotId",
  "status",
  "phase",
  "event",
  "functionName",
  "model",
  "baseUrl",
  "hasApiKey",
  "statusCode",
  "statusText",
  "ok",
  "contentPreview",
  "functionParamPreview",
  "hasFunctionParam",
  "replyPreview",
  "answerPreview",
  "answerLength",
  "returnedLength",
  "chunkCount",
  "wasTruncated",
  "durationMs",
  "error",
];

export function makeTraceId(prefix = "req") {
  return `${prefix}_${randomUUID()}`;
}

export function previewText(value, maxLength = 120) {
  if (typeof value !== "string") {
    return "";
  }

  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength)}...`;
}

export function formatError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object") {
    return {
      name: error.name ?? "Error",
      message: error.message ?? String(error),
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function padNumber(value, width = 2) {
  return String(value).padStart(width, "0");
}

function formatTimestamp(date) {
  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}.${padNumber(date.getMilliseconds(), 3)}`,
  ].join(" ");
}

function getLogFilePath(date) {
  const day = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

  if (LOG_FILE_TIME_UNIT === "day") {
    return resolve(LOG_FILE_DIR, `${day}.log`);
  }

  return resolve(LOG_FILE_DIR, day, `${padNumber(date.getHours())}.log`);
}

function readableMessage(scope, message) {
  return MESSAGE_LABELS[scope]?.[message] ?? message;
}

function readableKey(key) {
  return KEY_LABELS[key] ?? key;
}

function shortenTrace(value) {
  if (typeof value !== "string" || value.length <= 32) {
    return value;
  }

  return `${value.slice(0, 20)}...`;
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (key === "durationMs") {
    return `${value}ms`;
  }

  if (key === "stream") {
    return value ? "stream" : "json";
  }

  if (key === "hasApiKey") {
    return value ? "yes" : "no";
  }

  if (key === "hasFunctionParam") {
    return value ? "yes" : "no";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (key === "traceId" || key === "requestId") {
    return shortenTrace(value);
  }

  if (key === "error") {
    return value.message ?? String(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value);
  if (
    key.endsWith("Preview") ||
    text.includes(" ") ||
    text.includes("\t") ||
    text.includes("\n")
  ) {
    return JSON.stringify(text);
  }

  return text;
}

function formatDetails(details) {
  const keys = [
    ...DETAIL_ORDER.filter((key) => Object.hasOwn(details, key)),
    ...Object.keys(details).filter((key) => !DETAIL_ORDER.includes(key)),
  ];

  return keys
    .map((key) => {
      const value = formatValue(key, details[key]);
      if (!value) {
        return "";
      }

      return `${readableKey(key)}=${value}`;
    })
    .filter(Boolean)
    .join(" ");
}

function formatPretty(record) {
  const { ts, level, scope, message, ...details } = record;
  const detailText = formatDetails(details);
  const line = `${formatTimestamp(new Date(ts))} ${level.toUpperCase().padEnd(5)} [${scope}] ${readableMessage(scope, message)}`;

  return detailText ? `${line} | ${detailText}` : line;
}

function rotateLogFile(filePath) {
  if (
    !Number.isFinite(LOG_FILE_MAX_BYTES) ||
    LOG_FILE_MAX_BYTES <= 0 ||
    !Number.isFinite(LOG_FILE_MAX_BACKUPS) ||
    LOG_FILE_MAX_BACKUPS <= 0 ||
    !existsSync(filePath)
  ) {
    return;
  }

  if (statSync(filePath).size < LOG_FILE_MAX_BYTES) {
    return;
  }

  for (let index = LOG_FILE_MAX_BACKUPS; index >= 1; index -= 1) {
    const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
    const target = `${filePath}.${index}`;

    if (!existsSync(source)) {
      continue;
    }

    if (index === LOG_FILE_MAX_BACKUPS && existsSync(target)) {
      unlinkSync(target);
    }

    renameSync(source, target);
  }
}

function removeExpiredLogFiles(directoryPath, cutoffTimestamp) {
  if (!existsSync(directoryPath)) {
    return;
  }

  for (const directoryEntry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = resolve(directoryPath, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      removeExpiredLogFiles(entryPath, cutoffTimestamp);
      continue;
    }

    const isManagedLogFile = (
      directoryEntry.isFile() &&
      /\.log(?:\.\d+)?$/.test(directoryEntry.name)
    );

    if (isManagedLogFile && statSync(entryPath).mtimeMs < cutoffTimestamp) {
      unlinkSync(entryPath);
    }
  }
}

function pruneExpiredLogs(date) {
  if (!Number.isFinite(LOG_FILE_RETENTION_DAYS) || LOG_FILE_RETENTION_DAYS <= 0) {
    return;
  }

  const currentDay = [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
  ].join("-");

  if (lastLogRetentionPruneDay === currentDay) {
    return;
  }

  const retentionMilliseconds = LOG_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  removeExpiredLogFiles(resolve(LOG_FILE_DIR), date.getTime() - retentionMilliseconds);
  lastLogRetentionPruneDay = currentDay;
}

function appendLogFile(line, date) {
  if (!LOG_FILE_ENABLED) {
    return;
  }

  try {
    const filePath = getLogFilePath(date);
    mkdirSync(dirname(filePath), { recursive: true });
    rotateLogFile(filePath);
    appendFileSync(filePath, `${line}\n`, "utf8");
    pruneExpiredLogs(date);
  } catch (error) {
    console.error(`日志文件写入失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function emit(level, scope, message, details = {}) {
  const date = new Date();
  const record = {
    ts: date.toISOString(),
    level,
    scope,
    message,
    ...details,
  };

  const line = LOG_FORMAT === "json" ? JSON.stringify(record) : formatPretty(record);
  appendLogFile(line, date);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function logInfo(scope, message, details = {}) {
  emit("info", scope, message, details);
}

export function logError(scope, message, details = {}) {
  emit("error", scope, message, details);
}
