export const DEFAULT_ROBOT_ID = "4";

export const ROBOT_EVENTS = {
  speechContext: "SPEECH_CONTEXT",
  command: "CMD",
  responseContext: "RESPONSE_CONTEXT",
};

export const VOICE_STATUS = {
  recordingStarted: "0",
  recordingEnded: "1",
};

export const VOICE_PHASE = {
  [VOICE_STATUS.recordingStarted]: "start-recording",
  [VOICE_STATUS.recordingEnded]: "end-recording",
};

export const ROBOT_REPLIES = {
  invalidJson: "请求体不是有效的 JSON。",
  commandAccepted: "好的，我已经收到请求，请稍等。",
  unknownEvent: "我已经收到请求，请稍等。",
};
