import { deepseekConfig } from "./config.js";
import { formatError, logError, logInfo, previewText } from "@/shared/logging/logger.js";

const FALLBACK_REPLY = "抱歉，我现在暂时无法处理这个请求，请稍后再试。";

function buildMessages(content) {
  return [
    {
      role: "system",
      content: deepseekConfig.systemPrompt,
    },
    {
      role: "user",
      content: typeof content === "string" ? content : "",
    },
  ];
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function limitReplyLength(text) {
  const maxReplyChars = deepseekConfig.maxReplyChars;

  if (!Number.isFinite(maxReplyChars) || maxReplyChars <= 0) {
    return text;
  }

  const chars = Array.from(text);
  if (chars.length <= maxReplyChars) {
    return text;
  }

  return chars.slice(0, maxReplyChars).join("");
}

function createReplyLimiter() {
  const maxReplyChars = deepseekConfig.maxReplyChars;
  let returnedLength = 0;

  return (text) => {
    if (!Number.isFinite(maxReplyChars) || maxReplyChars <= 0) {
      return {
        text,
        wasTruncated: false,
        reachedLimit: false,
      };
    }

    const remaining = maxReplyChars - returnedLength;
    if (remaining <= 0) {
      return {
        text: "",
        wasTruncated: true,
        reachedLimit: true,
      };
    }

    const chars = Array.from(text);
    const limited = chars.slice(0, remaining).join("");
    returnedLength += Array.from(limited).length;

    return {
      text: limited,
      wasTruncated: limited !== text,
      reachedLimit: returnedLength >= maxReplyChars,
    };
  };
}

function parseDeepSeekStreamBlock(block) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) {
    return null;
  }

  if (data === "[DONE]") {
    return { done: true, content: "" };
  }

  try {
    const json = JSON.parse(data);
    const content = json?.choices?.[0]?.delta?.content;

    return {
      done: false,
      content: typeof content === "string" ? content : "",
    };
  } catch {
    return null;
  }
}

export async function getDeepSeekReply(content, context = {}) {
  const traceId = context.traceId ?? "deepseek";
  const sessionId = context.sessionId ?? "";
  const apiKey = deepseekConfig.apiKey;
  const startedAt = Date.now();

  logInfo("deepseek", "request_start", {
    traceId,
    sessionId,
    model: deepseekConfig.model,
    baseUrl: deepseekConfig.baseUrl,
    contentPreview: previewText(content, 120),
    hasApiKey: Boolean(apiKey),
    stream: false,
  });

  if (!apiKey) {
    logInfo("deepseek", "api_key_missing", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      stream: false,
    });
    return FALLBACK_REPLY;
  }

  try {
    const response = await fetch(`${normalizeBaseUrl(deepseekConfig.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deepseekConfig.model,
        messages: buildMessages(content),
        stream: false,
      }),
      signal: AbortSignal.timeout(12000),
    });

    logInfo("deepseek", "response_received", {
      traceId,
      sessionId,
      statusCode: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      stream: false,
    });

    if (!response.ok) {
      logError("deepseek", "request_failed_status", {
        traceId,
        sessionId,
        statusCode: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt,
        stream: false,
      });
      return FALLBACK_REPLY;
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (typeof answer !== "string") {
      return FALLBACK_REPLY;
    }

    const trimmed = answer.trim();
    const limited = limitReplyLength(trimmed);
    const wasTruncated = limited !== trimmed;

    logInfo("deepseek", "request_success", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      answerPreview: previewText(limited, 120),
      answerLength: trimmed.length,
      returnedLength: Array.from(limited).length,
      wasTruncated,
      stream: false,
    });
    return limited || FALLBACK_REPLY;
  } catch (error) {
    logError("deepseek", "request_exception", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      error: formatError(error),
      stream: false,
    });
    return FALLBACK_REPLY;
  }
}

export async function* getDeepSeekReplyStream(content, context = {}) {
  const traceId = context.traceId ?? "deepseek";
  const sessionId = context.sessionId ?? "";
  const apiKey = deepseekConfig.apiKey;
  const startedAt = Date.now();

  logInfo("deepseek", "request_start", {
    traceId,
    sessionId,
    model: deepseekConfig.model,
    baseUrl: deepseekConfig.baseUrl,
    contentPreview: previewText(content, 120),
    hasApiKey: Boolean(apiKey),
    stream: true,
  });

  if (!apiKey) {
    logInfo("deepseek", "api_key_missing", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      stream: true,
    });
    yield FALLBACK_REPLY;
    return;
  }

  let answer = "";
  let wasTruncated = false;
  let chunkCount = 0;

  try {
    const response = await fetch(`${normalizeBaseUrl(deepseekConfig.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deepseekConfig.model,
        messages: buildMessages(content),
        stream: true,
      }),
      signal: AbortSignal.timeout(12000),
    });

    logInfo("deepseek", "response_received", {
      traceId,
      sessionId,
      statusCode: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      stream: true,
    });

    if (!response.ok || !response.body) {
      logError("deepseek", "request_failed_status", {
        traceId,
        sessionId,
        statusCode: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt,
        stream: true,
      });
      yield FALLBACK_REPLY;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const limitChunk = createReplyLimiter();
    let buffer = "";
    let shouldStop = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || shouldStop) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let separatorIndex = buffer.indexOf("\n\n");

        while (separatorIndex !== -1) {
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const event = parseDeepSeekStreamBlock(block);
          if (event?.done) {
            shouldStop = true;
            break;
          }

          if (event?.content) {
            const limited = limitChunk(event.content);
            if (limited.wasTruncated) {
              wasTruncated = true;
            }

            if (limited.text) {
              answer += limited.text;
              chunkCount += 1;
              yield limited.text;
            }

            if (limited.reachedLimit) {
              wasTruncated = true;
              shouldStop = true;
              await reader.cancel();
              break;
            }
          }

          separatorIndex = buffer.indexOf("\n\n");
        }

        if (shouldStop) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    logInfo("deepseek", "request_success", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      answerPreview: previewText(answer, 120),
      answerLength: answer.length,
      returnedLength: Array.from(answer).length,
      chunkCount,
      wasTruncated,
      stream: true,
    });
  } catch (error) {
    logError("deepseek", "request_exception", {
      traceId,
      sessionId,
      durationMs: Date.now() - startedAt,
      error: formatError(error),
      stream: true,
    });
    yield FALLBACK_REPLY;
  }
}
