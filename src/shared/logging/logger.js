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

const SCOPE_LABELS = {
  voiceMonitor: "语音状态",
  listenQwen: "语音转发",
  deepseek: "DeepSeek",
  voiceSession: "语音会话",
  modelResponse: "模型回调",
};

const MESSAGE_LABELS = {
  voiceMonitor: {
    invalid_json: "❌ JSON 解析失败",
    invalid_status: "❌ 状态无效",
    request_completed: "✅ 语音状态已更新",
  },
  listenQwen: {
    invalid_json: "❌ JSON 解析失败",
    request_received: "📥 收到语音请求",
    skip_speech_after_cmd: "⚠️ 跳过重复语音请求",
    redirect_speech_to_cmd: "🔀 转为固定指令",
    response_ready: "✅ 返回响应",
    unknown_event: "⚠️ 未知事件",
  },
  deepseek: {
    request_start: "⏳ 请求 DeepSeek",
    api_key_missing: "⚠️ 缺少 DeepSeek 密钥",
    response_received: "📥 收到 DeepSeek 响应",
    request_failed_status: "❌ DeepSeek 返回异常",
    request_success: "✅ DeepSeek 请求完成",
    request_exception: "❌ DeepSeek 请求失败",
  },
  voiceSession: {
    control_sending: "📤 正在连接机器人",
    control_failed: "❌ 机器人控制失败",
    started: "✅ 语音会话已开始",
    ended: "🛑 语音会话已结束",
  },
  modelResponse: {
    started: "📥 收到模型响应开始",
    completed: "✅ 模型响应已完成",
    delta_received: "📥 收到模型增量",
  },
};

const KEY_LABELS = {
  traceId: "追踪",
  requestId: "请求",
  sessionId: "会话",
  robotId: "机器人",
  status: "状态",
  phase: "阶段",
  event: "事件",
  functionName: "函数",
  model: "模型",
  contentPreview: "用户",
  functionParamPreview: "参数",
  replyPreview: "回复",
  answerPreview: "回答",
  answerLength: "字数",
  returnedLength: "返回字数",
  chunkCount: "片段数",
  hasFunctionParam: "有参数",
  hasApiKey: "有密钥",
  statusCode: "HTTP",
  statusText: "状态文本",
  ok: "成功",
  durationMs: "耗时",
  timeoutMs: "超时",
  baseUrl: "地址",
  target: "地址",
  stream: "模式",
  wasTruncated: "已截断",
  error: "原因",
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
  "target",
  "durationMs",
  "timeoutMs",
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
    const formattedError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    for (const propertyName of ["code", "address", "port", "targetUrl", "durationMs", "timeoutMs"]) {
      if (error[propertyName] !== undefined) {
        formattedError[propertyName] = error[propertyName];
      }
    }

    if (error.cause && typeof error.cause === "object") {
      for (const propertyName of ["code", "address", "port"]) {
        if (formattedError[propertyName] === undefined && error.cause[propertyName] !== undefined) {
          formattedError[propertyName] = error.cause[propertyName];
        }
      }
    }

    return formattedError;
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

function shortenIdentifier(value) {
  if (typeof value !== "string" || value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 12)}...`;
}

function readErrorProperty(error, propertyName) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if (error[propertyName] !== undefined) {
    return error[propertyName];
  }

  if (error.cause && typeof error.cause === "object") {
    return error.cause[propertyName];
  }

  return undefined;
}

function getNetworkErrorReason(errorCode) {
  return {
    ECONNREFUSED: "连接被拒绝",
    ECONNRESET: "连接被对方关闭",
    ETIMEDOUT: "连接超时",
    UND_ERR_CONNECT_TIMEOUT: "连接超时",
    ENOTFOUND: "地址无法解析",
    EAI_AGAIN: "地址解析暂时失败",
    ECONNABORTED: "连接被中止",
    ABORT_ERR: "请求超时",
  }[errorCode];
}

function formatReadableError(error) {
  const errorMessage = readErrorProperty(error, "message") ?? String(error);
  const errorCode = readErrorProperty(error, "code");
  const errorAddress = readErrorProperty(error, "address");
  const errorPort = readErrorProperty(error, "port");
  const networkReason = getNetworkErrorReason(errorCode);
  const detailParts = [networkReason ?? errorMessage];

  if (errorCode) {
    detailParts.push(`代码=${errorCode}`);
  }

  if (errorAddress || errorPort) {
    detailParts.push(`地址=${errorAddress ?? "未知"}:${errorPort ?? "未知"}`);
  }

  return detailParts.join(" ");
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

function readableScope(scope) {
  return SCOPE_LABELS[scope] ?? scope;
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

  if (key === "timeoutMs") {
    return `${value}ms`;
  }

  if (key === "stream") {
    return value ? "流式" : "普通";
  }

  if (key === "hasApiKey") {
    return value ? "是" : "否";
  }

  if (key === "hasFunctionParam") {
    return value ? "是" : "否";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (key === "traceId" || key === "requestId") {
    return shortenTrace(value);
  }

  if (key === "error") {
    return formatReadableError(value);
  }

  if (key === "sessionId") {
    return shortenIdentifier(value);
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
    .join(" | ");
}

function formatPretty(record) {
  const { ts, level, scope, message, ...details } = record;
  const detailText = formatDetails(details);
  const line = `${formatTimestamp(new Date(ts))} ${level.toUpperCase().padEnd(5)} [${readableScope(scope)}] ${readableMessage(scope, message)}`;

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
