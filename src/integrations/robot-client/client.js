import { robotClientConfig } from "./config.js";

function createRobotClientUrl(pathname) {
  return new URL(pathname, robotClientConfig.baseUrl).toString();
}

export function getRobotVoiceSessionControlTarget() {
  return createRobotClientUrl("/robot/voiceSession/control");
}

function enrichRobotClientError(error, targetUrl, startedAt, timeoutMs) {
  const requestError = error instanceof Error ? error : new Error(String(error));
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

  if (requestError.name === "AbortError" && requestError.code === undefined) {
    requestError.code = "ETIMEDOUT";
  }

  return requestError;
}

export async function sendVoiceSessionControl({ robotId, sessionId, status }) {
  const controller = new AbortController();
  const targetUrl = getRobotVoiceSessionControlTarget();
  const startedAt = Date.now();
  const timeout = setTimeout(() => {
    controller.abort();
  }, robotClientConfig.timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Connection: "close",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ robotId, sessionId, status }),
      signal: controller.signal,
      cache: "no-store",
    });

    const responseStatus = response.status;
    await response.text();

    if (!response.ok) {
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
