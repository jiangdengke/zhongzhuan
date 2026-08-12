import { robotClientConfig } from "./config.js";

function createRobotClientUrl(pathname) {
  return new URL(pathname, robotClientConfig.baseUrl).toString();
}

export function getRobotVoiceSessionControlTarget() {
  return createRobotClientUrl("/robot/voiceSession/control");
}

function enrichRobotClientError(error, targetUrl, startedAt, timeoutMs) {
  let requestError = error instanceof Error ? error : new Error(String(error));

  if (requestError.name === "AbortError") {
    const timeoutError = new Error("Voice service request timed out");
    timeoutError.name = "TimeoutError";
    timeoutError.code = "ETIMEDOUT";
    timeoutError.cause = requestError;
    requestError = timeoutError;
  }

  requestError.targetUrl = targetUrl;
  requestError.durationMs = Date.now() - startedAt;
  requestError.timeoutMs = timeoutMs;

  if (requestError.cause && typeof requestError.cause === "object") {
    for (const propertyName of ["code", "address", "port"]) {
      if (requestError[propertyName] === undefined && requestError.cause[propertyName] !== undefined) {
        requestError[propertyName] = requestError.cause[propertyName];
      }
    }
  }

  return requestError;
}

function isUnavailableProbeStatus(status) {
  return status >= 500 && status <= 599 && status !== 501;
}

async function requestVoiceSessionControl({ method, payload }) {
  const controller = new AbortController();
  const targetUrl = getRobotVoiceSessionControlTarget();
  const startedAt = Date.now();
  const timeout = setTimeout(() => {
    controller.abort();
  }, robotClientConfig.timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method,
      headers: {
        Connection: "close",
        ...(method === "HEAD" ? { "Cache-Control": "no-store" } : {}),
        ...(payload ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
      cache: "no-store",
      redirect: method === "HEAD" ? "manual" : "follow",
    });

    const responseStatus = response.status;
    await response.text();

    const responseIsUnavailable = method === "HEAD"
      ? isUnavailableProbeStatus(responseStatus)
      : !response.ok;

    if (responseIsUnavailable) {
      const responseError = new Error(`Voice service returned HTTP ${responseStatus}`);
      responseError.statusCode = responseStatus;
      throw responseError;
    }

    return {
      status: responseStatus,
      targetUrl,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw enrichRobotClientError(error, targetUrl, startedAt, robotClientConfig.timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

export function probeVoiceSessionControl() {
  return requestVoiceSessionControl({ method: "HEAD" });
}

export function sendVoiceSessionControl({ robotId, sessionId, status }) {
  return requestVoiceSessionControl({
    method: "POST",
    payload: { robotId, sessionId, status },
  });
}
