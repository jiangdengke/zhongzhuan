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
  listenQwen: "语音识别",
  deepseek: "DeepSeek",
  voiceSession: "会话控制",
  modelResponse: "模型回复",
  robotEvents: "页面推送",
};

const MESSAGE_LABELS = {
  voiceMonitor: {
    request_received: "📥 收到语音服务状态回调",
    invalid_json: "❌ JSON 解析失败",
    invalid_status: "❌ 状态无效",
    request_completed: "✅ 已接收说话状态",
    response_sent: "📤 返回语音状态结果",
  },
  listenQwen: {
    invalid_json: "❌ JSON 解析失败",
    request_received: "📥 收到语音服务回调",
    skip_speech_after_cmd: "⚠️ 跳过重复语音请求",
    redirect_speech_to_cmd: "🔀 转为固定指令",
    response_ready: "✅ 语音回复已生成",
    asr_partial_received: "✅ 收到 ASR 识别结果",
    branch_cmd: "✅ 固定命令已处理",
    unknown_event: "⚠️ 未知事件",
    response_sent: "📤 返回语音服务结果",
    route_selected: "🔀 已选择回复来源",
  },
  deepseek: {
    request_start: "⏳ 请求 DeepSeek",
    api_key_missing: "⚠️ 缺少 DeepSeek 密钥",
    response_received: "📥 收到 DeepSeek 响应",
    request_failed_status: "❌ DeepSeek 返回异常",
    request_success: "✅ DeepSeek 请求完成",
    request_exception: "❌ DeepSeek 请求失败",
    first_delta: "📥 收到 DeepSeek 首片",
  },
  voiceSession: {
    request_received: "📥 收到页面控制请求",
    request_rejected: "⚠️ 拒绝页面控制请求",
    response_sent: "📤 返回页面控制结果",
    session_created: "🆕 创建整段会话",
    session_reused: "🔁 复用整段会话",
    forward_started: "📤 下发语音控制指令",
    forward_succeeded: "✅ 语音服务已接收控制指令",
    control_sending: "📤 下发语音控制指令",
    control_failed: "❌ 下发语音控制失败",
    started: "✅ 整段会话已进入活动状态",
    ended: "🛑 整段会话已结束",
    state_changed: "🔄 整段会话状态已更新",
    conflict: "⚠️ 会话控制冲突",
    ignored: "⚠️ 忽略重复控制",
  },
  modelResponse: {
    request_received: "📥 收到模型回调",
    started: "📥 已创建模型回复",
    completed: "✅ 模型输出完成",
    delta_received: "⏳ 收到模型增量",
    progress: "⏳ 模型输出中",
    ignored: "⚠️ 忽略模型回调",
    interrupted: "⚠️ 模型回复被中断",
    expired: "⚠️ 模型回复已过期清理",
    response_sent: "📤 返回模型回调结果",
  },
  robotEvents: {
    event_published: "📤 事件已写入页面推送",
    subscriber_connected: "📥 页面已连接事件流",
    subscriber_disconnected: "⚠️ 页面已断开事件流",
    replay_completed: "📤 已完成事件重放",
    snapshot_sent: "📤 已发送模型回复快照",
    listener_failed: "❌ 页面推送监听器失败",
  },
};

const DEFAULT_DIRECTIONS = {
  voiceMonitor: "语音服务→中转服务",
  listenQwen: "语音服务→中转服务",
  modelResponse: "语音服务→中转服务",
  robotEvents: "中转服务→页面",
};

const KEY_LABELS = {
  traceId: "追踪",
  requestId: "请求",
  sessionId: "会话",
  wholeSessionId: "会话",
  activeSessionId: "当前会话",
  utteranceSessionId: "话轮",
  turnId: "话轮",
  responseId: "回复",
  eventId: "事件",
  eventType: "事件类型",
  robotId: "终端",
  status: "状态",
  phase: "阶段",
  action: "动作",
  event: "事件",
  route: "接口",
  method: "方法",
  service: "服务",
  source: "来源",
  responseSource: "回复来源",
  outcome: "结果",
  reason: "原因",
  ignored: "已忽略",
  ignoreReason: "忽略原因",
  association: "关联",
  functionName: "函数",
  model: "模型",
  contentPreview: "内容",
  functionParamPreview: "参数",
  language: "语言",
  replyPreview: "回复",
  answerPreview: "回答",
  answerLength: "字数",
  contentLength: "字数",
  characterCount: "累计字数",
  totalChars: "总字数",
  returnedLength: "返回字数",
  chunkCount: "片段数",
  receivedChunkCount: "已收片段",
  firstChunkLatencyMs: "首片耗时",
  totalDurationMs: "总耗时",
  hasFunctionParam: "有参数",
  hasApiKey: "有密钥",
  statusCode: "HTTP",
  httpStatus: "HTTP",
  statusText: "状态文本",
  ok: "成功",
  durationMs: "耗时",
  timeoutMs: "超时",
  baseUrl: "地址",
  target: "地址",
  address: "地址",
  listenerCount: "在线页面",
  replayCount: "重放数",
  snapshotCount: "快照数",
  connectionId: "连接",
  connectionDurationMs: "连接时长",
  queueWaitMs: "排队耗时",
  stream: "模式",
  wasTruncated: "已截断",
  error: "原因",
};

const DETAIL_ORDER = [
  "traceId",
  "requestId",
  "sessionId",
  "wholeSessionId",
  "activeSessionId",
  "utteranceSessionId",
  "turnId",
  "responseId",
  "eventId",
  "eventType",
  "stream",
  "robotId",
  "status",
  "phase",
  "action",
  "event",
  "route",
  "method",
  "service",
  "source",
  "responseSource",
  "outcome",
  "reason",
  "ignoreReason",
  "association",
  "functionName",
  "model",
  "baseUrl",
  "hasApiKey",
  "statusCode",
  "statusText",
  "ok",
  "contentPreview",
  "functionParamPreview",
  "language",
  "hasFunctionParam",
  "replyPreview",
  "answerPreview",
  "answerLength",
  "contentLength",
  "characterCount",
  "totalChars",
  "returnedLength",
  "chunkCount",
  "receivedChunkCount",
  "firstChunkLatencyMs",
  "totalDurationMs",
  "wasTruncated",
  "target",
  "address",
  "listenerCount",
  "replayCount",
  "snapshotCount",
  "connectionId",
  "connectionDurationMs",
  "queueWaitMs",
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

function readableDirection(scope, message, direction) {
  if (direction) {
    return direction;
  }

  if (scope === "deepseek") {
    return message === "response_received" || message === "request_success"
      ? "DeepSeek→中转服务"
      : "中转服务→DeepSeek";
  }

  return DEFAULT_DIRECTIONS[scope] ?? "中转内部";
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

  if (key.endsWith("Ms")) {
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

  if (
    key === "traceId" ||
    key === "requestId" ||
    key === "sessionId" ||
    key === "wholeSessionId" ||
    key === "activeSessionId" ||
    key === "utteranceSessionId" ||
    key === "turnId" ||
    key === "responseId" ||
    key === "eventId" ||
    key === "connectionId"
  ) {
    return shortenTrace(value);
  }

  if (key === "error") {
    return formatReadableError(value);
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
  const { ts, level, scope, message, direction, ...details } = record;
  const detailText = formatDetails(details);
  const readableScopeName = readableScope(scope);
  const readableDirectionName = readableDirection(scope, message, direction);
  const line = `${formatTimestamp(new Date(ts))} ${level.toUpperCase().padEnd(5)} [${readableScopeName}][${readableDirectionName}] ${readableMessage(scope, message)}`;

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

  if (level === "warn") {
    console.warn(line);
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

export function logWarn(scope, message, details = {}) {
  emit("warn", scope, message, details);
}
