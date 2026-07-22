import { readString } from "@/shared/strings.js";
import { ROBOT_FUNCTIONS, ROBOT_REPLIES } from "../domain/constants.js";

const PLACE_DESCRIPTIONS = {
  境安: "休息区",
  羽厅: "前台",
  凤庭: "文化长廊",
  云舍: "便捷休息区",
  书间: "商务阅读区",
  栖木: "安静休息区",
  礼飨: "自助餐区",
  桐轩: "茶室水吧",
  洗手间: "洗手间",
  母婴室: "母婴室",
};

function parseJsonObject(value) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, data: {} };
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return { ok: true, data: value };
  }

  if (typeof value !== "string") {
    return { ok: false, data: {} };
  }

  try {
    const data = JSON.parse(value);

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { ok: false, data: {} };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, data: {} };
  }
}

function readFirstString(data, keys) {
  for (const key of keys) {
    const value = readString(data?.[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function parseWeatherParam(functionParam) {
  const param = parseJsonObject(functionParam);

  if (!param.ok) {
    return param;
  }

  const msg = param.data.msg;

  if (typeof msg === "string" && msg) {
    return parseJsonObject(msg);
  }

  if (typeof msg === "object" && msg !== null && !Array.isArray(msg)) {
    return { ok: true, data: msg };
  }

  return param;
}

function createWeatherReply(functionParam) {
  const parsed = parseWeatherParam(functionParam);

  if (!parsed.ok) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  const city = readFirstString(parsed.data, ["city", "cityName", "name"]) || "当地";
  const weather = readFirstString(parsed.data, ["weather", "condition", "text", "wea"]);
  const temperature = readFirstString(parsed.data, ["temperature", "temp", "currentTemperature"]);
  const humidity = readFirstString(parsed.data, ["humidity", "shidu"]);
  const wind = readFirstString(parsed.data, ["wind", "windDirection", "windPower", "win"]);

  const details = [];

  if (weather) {
    details.push(weather);
  }

  if (temperature) {
    details.push(`气温${temperature}`);
  }

  if (humidity) {
    details.push(`湿度${humidity}`);
  }

  if (wind) {
    details.push(wind);
  }

  if (details.length === 0) {
    return { ok: true, reply: `${city}天气信息已收到。` };
  }

  return { ok: true, reply: `${city}当前${details.join("，")}。` };
}

function createPlaceReply(functionParam, mode) {
  const parsed = parseJsonObject(functionParam);

  if (!parsed.ok) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  const placeName = readString(parsed.data.placeName);

  if (!placeName) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  if (mode === ROBOT_FUNCTIONS.findingPlaces) {
    return { ok: true, reply: `好的，请跟我来，我带您去${placeName}。` };
  }

  const description = PLACE_DESCRIPTIONS[placeName];

  if (description) {
    return { ok: true, reply: `${placeName}是${description}。` };
  }

  return { ok: true, reply: `这里是${placeName}。` };
}

function createFlightReply(functionParam) {
  const parsed = parseJsonObject(functionParam);

  if (!parsed.ok) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  const flightNo = readString(parsed.data.flightNo);

  if (!flightNo) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  return { ok: true, reply: `正在为您查询${flightNo}航班动态，请稍等。` };
}

function createBoardingGateReply(functionParam) {
  const parsed = parseJsonObject(functionParam);

  if (!parsed.ok) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  const gateNo = readString(parsed.data.gateNo);

  if (!gateNo) {
    return { ok: false, reply: ROBOT_REPLIES.invalidCommandParam };
  }

  return { ok: true, reply: `正在为您查询${gateNo}登机口，请稍等。` };
}

export function createCommandReply(request) {
  switch (request.functionName) {
    case ROBOT_FUNCTIONS.introducingPlaces:
      return createPlaceReply(request.functionParam, ROBOT_FUNCTIONS.introducingPlaces);
    case ROBOT_FUNCTIONS.findingPlaces:
      return createPlaceReply(request.functionParam, ROBOT_FUNCTIONS.findingPlaces);
    case ROBOT_FUNCTIONS.flight:
      return createFlightReply(request.functionParam);
    case ROBOT_FUNCTIONS.boardingGate:
      return createBoardingGateReply(request.functionParam);
    case ROBOT_FUNCTIONS.access:
      return { ok: true, reply: "请出示通行二维码，我来协助您扫码通行。" };
    case ROBOT_FUNCTIONS.weather:
      return createWeatherReply(request.functionParam);
    default:
      return { ok: true, reply: ROBOT_REPLIES.commandAccepted };
  }
}
