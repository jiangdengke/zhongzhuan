export const DEFAULT_ROBOT_ID = "4";

export const ROBOT_EVENTS = {
  speechContext: "SPEECH_CONTEXT",
  command: "CMD",
  asrPartial: "ASR_PARTIAL",
  responseContext: "RESPONSE_CONTEXT",
};

export const ROBOT_FUNCTIONS = {
  introducingPlaces: "INTRODUCING_PLACES",
  findingPlaces: "FINDING_PLACES",
  flight: "FLIGHT",
  boardingGate: "BOARDING_GATE",
  access: "ACCESS",
  weather: "WEATHER",
};

export const VOICE_STATUS = {
  recordingStarted: "1",
  recordingEnded: "0",
};

export const VOICE_PHASE = {
  [VOICE_STATUS.recordingStarted]: "start-recording",
  [VOICE_STATUS.recordingEnded]: "end-recording",
};

export const ROBOT_REPLIES = {
  invalidJson: "抱歉，系统暂时无法处理这个请求，请稍后再试。",
  invalidCommandParam: "抱歉，命令参数有误，请重新说一遍。",
  commandAccepted: "好的，我已经收到请求，请稍等。",
  unknownEvent: "我已经收到请求，请稍等。",
};
