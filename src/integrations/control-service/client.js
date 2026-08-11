import { controlServiceConfig } from "./config.js";

function createControlServiceUrl(pathname) {
  return new URL(pathname, controlServiceConfig.baseUrl).toString();
}

export function getControlServiceVoiceSessionControlTarget() {
  return createControlServiceUrl("/robot/voiceSession/control");
}

function enrichControlServiceError(error, targetUrl, startedAt, timeoutMs) {
  let requestError = error instanceof Error ? error : new Error(String(error));

  if (requestError.name === "AbortError") {
    const timeoutError = new Error("Control service request timed out");
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
      if (
        requestError[propertyName] === undefined &&
        requestError.cause[propertyName] !== undefined
      ) {
        requestError[propertyName] = requestError.cause[propertyName];
      }
    }
  }

  return requestError;
}

export async function sendControlServiceVoiceSessionControl({ status }) {
  const controller = new AbortController();
  const targetUrl = getControlServiceVoiceSessionControlTarget();
  const startedAt = Date.now();
  const timeout = setTimeout(() => {
    controller.abort();
  }, controlServiceConfig.timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Connection: "close",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ status }),
      signal: controller.signal,
      cache: "no-store",
    });

    const responseStatus = response.status;
    await response.text();

    if (!response.ok) {
      const responseError = new Error(`Control service returned HTTP ${responseStatus}`);
      responseError.statusCode = responseStatus;
      throw responseError;
    }

    return {
      status: responseStatus,
      targetUrl,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw enrichControlServiceError(
      error,
      targetUrl,
      startedAt,
      controlServiceConfig.timeoutMs,
    );
  } finally {
    clearTimeout(timeout);
  }
}
