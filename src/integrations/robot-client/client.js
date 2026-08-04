import { robotClientConfig } from "./config.js";

function createRobotClientUrl(pathname) {
  return new URL(pathname, robotClientConfig.baseUrl).toString();
}

export async function sendVoiceSessionControl({ robotId, sessionId, status }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, robotClientConfig.timeoutMs);

  try {
    const response = await fetch(createRobotClientUrl("/robot/voiceSession/control"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ robotId, sessionId, status }),
      signal: controller.signal,
      cache: "no-store",
    });

    const responseStatus = response.status;
    await response.body?.cancel();

    if (!response.ok) {
      throw new Error(`Robot client returned HTTP ${responseStatus}`);
    }

    return { status: responseStatus };
  } finally {
    clearTimeout(timeout);
  }
}
