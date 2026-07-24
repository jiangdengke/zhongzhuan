"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRobotEvents } from "./chat-api.js";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是智能服务助手。你可以咨询问题、获取信息，也可以了解相关服务。",
  },
];

const voiceAssistantStatusCopy = {
  ready: {
    title: "随时为您服务",
    description: "请直接说出您的需求",
  },
  listening: {
    title: "正在聆听",
    description: "请继续说，我会为您识别",
  },
  processing: {
    title: "正在思考",
    description: "正在整理您的需求并生成回复",
  },
};

const voiceWaveformBarIndexes = Array.from({ length: 13 }, (_, barIndex) => barIndex);

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

function updateMessageContent(messages, messageId, updater) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return {
      ...message,
      content: updater(message.content),
    };
  });
}

function getUpstreamConversationKey(event, data) {
  return data.traceId || data.sessionId || event?.id || `upstream-${Date.now()}`;
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(value) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return {};
  }

  return {};
}

function parseCommandParam(data) {
  const param = parseJsonObject(data.functionParam);

  if (data.functionName !== "WEATHER") {
    return param;
  }

  if (typeof param.msg === "string") {
    return parseJsonObject(param.msg);
  }

  if (typeof param.msg === "object" && param.msg !== null && !Array.isArray(param.msg)) {
    return param.msg;
  }

  return param;
}

function createCommandInputContent(data) {
  const param = parseCommandParam(data);

  if (data.functionName === "FLIGHT") {
    const flightNo = readText(param.flightNo).toUpperCase();
    return flightNo ? `查询 ${flightNo} 航班` : "查询航班";
  }

  if (data.functionName === "BOARDING_GATE") {
    const gateNo = readText(param.gateNo);
    return gateNo ? `查询 ${gateNo} 登机口` : "查询登机口";
  }

  if (data.functionName === "FINDING_PLACES") {
    const placeName = readText(param.placeName);
    return placeName ? `带我去${placeName}` : "引领到指定地点";
  }

  if (data.functionName === "INTRODUCING_PLACES") {
    const placeName = readText(param.placeName);
    return placeName ? `介绍${placeName}` : "介绍场所";
  }

  if (data.functionName === "WEATHER") {
    const city = readText(param.city) || readText(param.cityName) || readText(param.name);
    return city ? `查询${city}天气` : "查询天气";
  }

  if (data.functionName === "ACCESS") {
    return "扫码通行";
  }

  return data.functionName ? `执行${data.functionName}命令` : "上游命令已收到";
}

function createUpstreamInputContent(data, chat) {
  if (data.event === "CMD") {
    return chat?.latestAsrContent || createCommandInputContent(data);
  }

  return data.content || chat?.latestAsrContent || "上游输入已收到";
}

function createAsrPartialContent(data) {
  return data.content ? `正在识别：${data.content}` : "正在识别...";
}

function isWebConsoleSession(data) {
  return typeof data.sessionId === "string" && data.sessionId.startsWith("web-chat-");
}

function getVoiceAssistantState(eventName, data) {
  if (eventName === "voice") {
    if (data.status === "1") {
      return "listening";
    }

    if (data.status === "0") {
      return "processing";
    }
  }

  if (eventName === "asr_partial") {
    return "listening";
  }

  if (eventName === "final_input" || eventName === "deepseek_delta") {
    return "processing";
  }

  if (eventName === "tts_done" || eventName === "robot_error") {
    return "ready";
  }

  return null;
}

export function RobotConsolePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [voiceAssistantState, setVoiceAssistantState] = useState("ready");
  const [interactionNumber, setInteractionNumber] = useState(0);
  const [isVoiceControlAwake, setIsVoiceControlAwake] = useState(false);
  const upstreamChatsRef = useRef({});
  const processedRobotEventIdsRef = useRef(new Set());

  useEffect(() => {
    function hasProcessedRobotEvent(event) {
      if (!event?.id) {
        return false;
      }

      const processedIds = processedRobotEventIdsRef.current;

      if (processedIds.has(event.id)) {
        return true;
      }

      processedIds.add(event.id);

      if (processedIds.size > 500) {
        processedIds.clear();
      }

      return false;
    }

    function getUpstreamChat(key) {
      if (!upstreamChatsRef.current[key]) {
        upstreamChatsRef.current[key] = {
          userMessageId: "",
          assistantMessageId: "",
          latestAsrContent: "",
          finalEvent: "",
        };
      }

      return upstreamChatsRef.current[key];
    }

    function upsertUpstreamUserMessage(chat, content) {
      if (chat.userMessageId) {
        setMessages((current) => updateMessageContent(
          current,
          chat.userMessageId,
          () => content,
        ));
        return;
      }

      const message = createMessage("user", content);
      chat.userMessageId = message.id;
      setMessages((current) => [...current, message]);
    }

    function ensureUpstreamAssistantMessage(chat) {
      if (chat.assistantMessageId) {
        return chat.assistantMessageId;
      }

      const message = createMessage("assistant", "");
      chat.assistantMessageId = message.id;
      setMessages((current) => [...current, message]);
      return message.id;
    }

    function applyUpstreamChatEvent(eventName, event, data) {
      if (event?.replayed || hasProcessedRobotEvent(event)) {
        return;
      }

      if (!["asr_partial", "final_input", "deepseek_delta", "tts_done", "robot_error"].includes(eventName)) {
        return;
      }

      if (isWebConsoleSession(data)) {
        return;
      }

      const key = getUpstreamConversationKey(event, data);
      const chat = getUpstreamChat(key);

      if (chat.finalEvent === "CMD" && data.sourceEvent === "SPEECH_CONTEXT") {
        return;
      }

      if (eventName === "asr_partial") {
        chat.latestAsrContent = readText(data.content) || chat.latestAsrContent;
        upsertUpstreamUserMessage(chat, createAsrPartialContent(data));
        return;
      }

      if (eventName === "final_input") {
        if (chat.finalEvent === "CMD" && data.event === "SPEECH_CONTEXT") {
          return;
        }

        chat.finalEvent = data.event || chat.finalEvent;
        upsertUpstreamUserMessage(chat, createUpstreamInputContent(data, chat));
        ensureUpstreamAssistantMessage(chat);
        return;
      }

      if (eventName === "deepseek_delta") {
        if (!data.content) {
          return;
        }

        const assistantMessageId = ensureUpstreamAssistantMessage(chat);
        setMessages((current) => updateMessageContent(
          current,
          assistantMessageId,
          (previousContent) => `${previousContent}${data.content}`,
        ));
        return;
      }

      if (eventName === "tts_done") {
        if (!data.content) {
          return;
        }

        const assistantMessageId = ensureUpstreamAssistantMessage(chat);
        setMessages((current) => updateMessageContent(
          current,
          assistantMessageId,
          () => data.content,
        ));
        return;
      }

      if (eventName === "robot_error") {
        const message = data.message || data.reason || "接口异常";
        const assistantMessageId = ensureUpstreamAssistantMessage(chat);
        setMessages((current) => updateMessageContent(
          current,
          assistantMessageId,
          (previousContent) => previousContent || message,
        ));
      }
    }

    return subscribeRobotEvents({
      onEvent: (eventName, event) => {
        const data = event?.data || event || {};
        const nextVoiceAssistantState = getVoiceAssistantState(eventName, data);

        if (nextVoiceAssistantState) {
          setVoiceAssistantState(nextVoiceAssistantState);
        }

        applyUpstreamChatEvent(eventName, event, data);
      },
    });
  }, []);

  const voiceAssistantCopy = voiceAssistantStatusCopy[voiceAssistantState];

  function handleVoiceAssistantInteraction() {
    setIsVoiceControlAwake(true);
    setInteractionNumber((currentNumber) => currentNumber + 1);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">智</div>
            <div>
              <p className="eyebrow">智能服务</p>
              <h1>您好，有什么可以帮您？</h1>
              <p className="brand-description">信息咨询、服务指引，随时为您提供帮助</p>
            </div>
          </div>
          <div className="status-pill">
            <span />
            服务在线
          </div>
        </header>

        <section className="messages" aria-label="对话消息">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="avatar" aria-hidden="true">{message.role === "assistant" ? "智" : "我"}</div>
              <div className="message-body">
                <span className="message-label">{message.role === "assistant" ? "智能服务助手" : "您"}</span>
                <div className={`bubble ${message.content ? "" : "typing"}`}>
                  {message.content ? (
                    <p>{message.content}</p>
                  ) : (
                    <>
                      <span />
                      <span />
                      <span />
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section
          className={`voice-assistant voice-assistant--${voiceAssistantState}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="voice-assistant__visual" aria-hidden="true">
            <div className="voice-assistant__waveform">
              {voiceWaveformBarIndexes.map((barIndex) => (
                <span key={barIndex} />
              ))}
            </div>
          </div>
          <div className="voice-assistant__copy">
            <strong>{voiceAssistantCopy.title}</strong>
            <p>{voiceAssistantCopy.description}</p>
          </div>
        </section>
      </section>

      <aside
        className={`voice-assistant-control voice-assistant-control--${voiceAssistantState} ${isVoiceControlAwake ? "voice-assistant-control--awake" : ""}`}
        aria-label="语音助手"
      >
        {isVoiceControlAwake ? (
          <div
            className="voice-assistant-control__feedback"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            语音助手已唤醒
          </div>
        ) : null}
        <button
          type="button"
          className="voice-assistant-control__button"
          onClick={handleVoiceAssistantInteraction}
          aria-label={isVoiceControlAwake ? "语音助手已唤醒" : "唤醒语音助手"}
        >
          <span className="voice-assistant-control__halo" aria-hidden="true" />
          {interactionNumber > 0 ? (
            <span
              className="voice-assistant-control__interaction-pulse"
              key={interactionNumber}
              aria-hidden="true"
            />
          ) : null}
          <svg className="voice-assistant-control__icon" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="24" y="9" width="16" height="31" rx="8" fill="currentColor" />
            <path d="M17 29a15 15 0 0 0 30 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M32 44v10M24 55h16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path className="voice-assistant-control__sound-wave" d="M51 23c3 4 3 10 0 14M56 18c5 7 5 17 0 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="voice-assistant-control__hint">
            {isVoiceControlAwake ? "已唤醒" : "点我唤醒"}
          </span>
        </button>
      </aside>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(body) {
          margin: 0;
          min-height: 100vh;
          background:
            radial-gradient(circle at 18% 18%, rgba(252, 209, 120, 0.34), transparent 30%),
            radial-gradient(circle at 82% 8%, rgba(67, 120, 92, 0.24), transparent 32%),
            linear-gradient(135deg, #f4ead8 0%, #e5d4b6 48%, #cfdcc5 100%);
          color: #241a12;
          font-family: "Songti SC", "Noto Serif CJK SC", "SimSun", serif;
        }

        .chat-shell {
          min-height: 100vh;
          width: min(1440px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 32px 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 420px;
          gap: 20px;
        }

        .chat-card {
          border: 1px solid rgba(36, 26, 18, 0.13);
          background: rgba(255, 252, 244, 0.76);
          box-shadow: 0 26px 80px rgba(72, 51, 29, 0.16);
          backdrop-filter: blur(18px);
        }

        .chat-card {
          min-height: calc(100vh - 64px);
          border-radius: 34px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 26px 28px 18px;
          border-bottom: 1px solid rgba(36, 26, 18, 0.1);
        }

        .eyebrow {
          margin: 0;
          color: #83531f;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 6px 0 0;
          letter-spacing: -0.05em;
        }

        h1 {
          font-size: clamp(34px, 5vw, 62px);
          line-height: 0.95;
        }

        h2 {
          font-size: 28px;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(36, 26, 18, 0.12);
          border-radius: 999px;
          padding: 9px 12px;
          background: rgba(255, 255, 255, 0.62);
          color: #5e4a37;
          font-size: 13px;
          font-family: "SFMono-Regular", "Menlo", monospace;
        }

        .status-pill span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #42795a;
          box-shadow: 0 0 0 5px rgba(66, 121, 90, 0.14);
        }

        .messages {
          flex: 1;
          padding: 28px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .message {
          display: grid;
          grid-template-columns: 42px minmax(0, max-content);
          gap: 12px;
          max-width: min(760px, 100%);
          align-items: start;
        }

        .message.user {
          align-self: flex-end;
          grid-template-columns: minmax(0, max-content) 42px;
        }

        .message.user .avatar {
          grid-column: 2;
          grid-row: 1;
          background: #2a4032;
          color: #fff3dc;
        }

        .message.user .bubble {
          grid-column: 1;
          background: #2a4032;
          color: #fff3dc;
          border-bottom-right-radius: 8px;
        }

        .avatar {
          width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: #f3d39a;
          color: #422a12;
          font-size: 13px;
          font-weight: 900;
          box-shadow: 0 10px 24px rgba(54, 38, 22, 0.12);
        }

        .bubble {
          max-width: 680px;
          border: 1px solid rgba(36, 26, 18, 0.1);
          border-radius: 22px;
          border-bottom-left-radius: 8px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.72);
          color: #2c2118;
          box-shadow: 0 12px 28px rgba(60, 42, 24, 0.08);
        }

        .bubble p {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.75;
          font-size: 16px;
        }

        .typing {
          display: flex;
          gap: 6px;
          align-items: center;
          min-width: 78px;
          min-height: 50px;
        }

        .typing span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #8b673c;
          animation: pulse 1s ease-in-out infinite;
        }

        .typing span:nth-child(2) {
          animation-delay: 140ms;
        }

        .typing span:nth-child(3) {
          animation-delay: 280ms;
        }

        @keyframes pulse {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.35;
          }

          50% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

      `}</style>

      <style jsx>{`
        :global(body) {
          background: #f3f6fa;
          color: #17212b;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          overflow-x: hidden;
        }

        .chat-shell {
          min-height: 100svh;
          width: min(100%, 1080px);
          padding: 24px 20px;
          display: flex;
          justify-content: center;
          margin: 0 auto;
        }

        .chat-card {
          width: 100%;
          min-height: calc(100svh - 48px);
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 20px 60px rgba(38, 62, 86, 0.1);
        }

        .chat-header {
          min-height: 104px;
          padding: 24px 32px;
          align-items: center;
          border-bottom: 1px solid #edf1f5;
          background: #ffffff;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        .brand-mark {
          width: 44px;
          height: 44px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: linear-gradient(145deg, #2d8d91, #2365a5);
          color: #ffffff;
          font-size: 20px;
          font-weight: 700;
          box-shadow: 0 8px 18px rgba(35, 101, 165, 0.22);
        }

        .eyebrow {
          color: #277d83;
          font-size: 11px;
          letter-spacing: 0.12em;
        }

        h1 {
          margin-top: 5px;
          color: #162433;
          font-size: clamp(22px, 3vw, 30px);
          line-height: 1.2;
          letter-spacing: -0.03em;
        }

        .brand-description {
          margin: 5px 0 0;
          color: #7a8795;
          font-size: 13px;
        }

        .status-pill {
          padding: 8px 12px;
          border: 1px solid #d7eee9;
          background: #f1fbf8;
          color: #287b68;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .status-pill span {
          background: #35a780;
          box-shadow: 0 0 0 4px rgba(53, 167, 128, 0.12);
        }

        .messages {
          min-height: 420px;
          padding: 32px 40px;
          gap: 24px;
          background: linear-gradient(180deg, #fbfcfe 0%, #f7f9fc 100%);
          scrollbar-gutter: stable;
        }

        .message {
          display: flex;
          gap: 11px;
          max-width: min(760px, 100%);
          align-items: flex-start;
        }

        .message.user {
          display: flex;
          flex-direction: row-reverse;
          align-self: flex-end;
        }

        .message-body {
          min-width: 0;
        }

        .message.user .message-body {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .message-label {
          display: block;
          margin: 0 0 6px 3px;
          color: #8b98a6;
          font-size: 11px;
        }

        .message.user .message-label {
          margin-left: 0;
          margin-right: 3px;
        }

        .avatar {
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
          border-radius: 12px;
          background: #e8f5f4;
          color: #277d83;
          font-size: 13px;
          box-shadow: none;
        }

        .message.user .avatar {
          background: #263f5d;
          color: #ffffff;
        }

        .bubble {
          max-width: 640px;
          border: 1px solid #e5ebf1;
          border-radius: 18px;
          border-bottom-left-radius: 5px;
          padding: 13px 16px;
          background: #ffffff;
          color: #293746;
          box-shadow: 0 4px 14px rgba(30, 52, 73, 0.04);
        }

        .message.user .bubble {
          border: 0;
          border-bottom-right-radius: 5px;
          background: #2c668f;
          color: #ffffff;
        }

        .bubble p {
          font-size: 15px;
          line-height: 1.75;
        }

        .typing {
          min-width: 70px;
          min-height: 46px;
          background: #f0f5f8;
          box-shadow: none;
        }

        .typing span {
          width: 6px;
          height: 6px;
          background: #4e98a0;
        }

        .voice-assistant-control {
          position: fixed;
          right: max(12px, calc((100vw - 1080px) / 2 - 92px));
          bottom: 28px;
          z-index: 31;
          width: 112px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }

        .voice-assistant-control__feedback {
          border: 1px solid #cce7e8;
          border-radius: 999px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.96);
          color: #277d83;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 8px 20px rgba(35, 101, 165, 0.12);
          animation: voice-assistant-feedback 220ms ease-out both;
        }

        .voice-assistant-control__button {
          position: relative;
          width: 82px;
          height: 82px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.88);
          border-radius: 50%;
          background: linear-gradient(145deg, #2d8d91, #2365a5);
          color: #ffffff;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 14px 30px rgba(35, 101, 165, 0.26);
          -webkit-tap-highlight-color: transparent;
        }

        .voice-assistant-control__button:focus-visible {
          outline: 3px solid rgba(45, 141, 145, 0.42);
          outline-offset: 4px;
        }

        .voice-assistant-control__halo {
          position: absolute;
          inset: -8px;
          border: 1px solid rgba(57, 161, 180, 0.28);
          border-radius: 50%;
          animation: voice-assistant-control-breathe 2.8s ease-in-out infinite;
        }

        .voice-assistant-control__interaction-pulse {
          position: absolute;
          inset: -8px;
          border: 2px solid rgba(57, 161, 180, 0.48);
          border-radius: 50%;
          animation: voice-assistant-control-ripple 620ms ease-out both;
          pointer-events: none;
        }

        .voice-assistant-control--awake .voice-assistant-control__halo {
          border-color: rgba(47, 194, 173, 0.56);
          background: rgba(47, 194, 173, 0.08);
          box-shadow: 0 0 20px rgba(47, 194, 173, 0.18);
        }

        .voice-assistant-control__icon {
          position: relative;
          z-index: 1;
          width: 38px;
          height: 38px;
        }

        .voice-assistant-control__sound-wave {
          opacity: 0.72;
          animation: voice-assistant-control-wave 1.8s ease-in-out infinite;
        }

        .voice-assistant-control__hint {
          position: absolute;
          right: -31px;
          bottom: -28px;
          width: 82px;
          color: #668091;
          font-size: 11px;
          line-height: 1.2;
          text-align: center;
          pointer-events: none;
        }

        .voice-assistant-control--listening .voice-assistant-control__button {
          background: linear-gradient(145deg, #2fc2ad, #2e8fd0);
          box-shadow: 0 14px 34px rgba(45, 165, 173, 0.34);
        }

        .voice-assistant-control--processing .voice-assistant-control__button {
          background: linear-gradient(145deg, #579fe5, #706fd8);
          box-shadow: 0 14px 34px rgba(82, 137, 214, 0.3);
        }

        .voice-assistant-control__button:hover {
          transform: translateY(-2px) scale(1.02);
        }

        @keyframes voice-assistant-control-breathe {
          0%, 100% {
            transform: scale(0.96);
            opacity: 0.55;
          }

          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        @keyframes voice-assistant-control-wave {
          0%, 100% {
            opacity: 0.45;
            transform: translateX(0);
          }

          50% {
            opacity: 1;
            transform: translateX(2px);
          }
        }

        @keyframes voice-assistant-control-ripple {
          from {
            transform: scale(0.92);
            opacity: 1;
          }

          to {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        @keyframes voice-assistant-feedback {
          from {
            opacity: 0;
            transform: translateY(6px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .voice-assistant {
          --voice-wave-start: #4cbfc1;
          --voice-wave-end: #377fc0;
          --voice-glow: rgba(67, 164, 188, 0.2);
          position: relative;
          flex: 0 0 auto;
          min-height: 176px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          overflow: hidden;
          border-top: 1px solid #e4ecf2;
          padding: 20px 40px 24px;
          background:
            radial-gradient(circle at 50% 18%, var(--voice-glow), transparent 42%),
            linear-gradient(180deg, #ffffff 0%, #f7fbfd 100%);
          text-align: center;
        }

        .voice-assistant--listening {
          --voice-wave-start: #31c9bd;
          --voice-wave-end: #2e8fd0;
          --voice-glow: rgba(49, 201, 189, 0.24);
        }

        .voice-assistant--processing {
          --voice-wave-start: #529ee8;
          --voice-wave-end: #706fd8;
          --voice-glow: rgba(82, 137, 214, 0.22);
        }

        .voice-assistant__visual {
          position: relative;
          width: min(300px, 100%);
          height: 68px;
          display: grid;
          place-items: center;
        }

        .voice-assistant__visual::before,
        .voice-assistant__visual::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .voice-assistant__visual::before {
          width: 220px;
          height: 54px;
          background: var(--voice-glow);
          filter: blur(18px);
          animation: voice-assistant-glow 2.8s ease-in-out infinite;
        }

        .voice-assistant__visual::after {
          width: 246px;
          height: 58px;
          border: 1px solid rgba(112, 166, 190, 0.17);
          background: rgba(255, 255, 255, 0.48);
          box-shadow: inset 0 0 24px rgba(70, 139, 176, 0.06);
        }

        .voice-assistant__waveform {
          position: relative;
          z-index: 1;
          width: min(210px, 78vw);
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }

        .voice-assistant__waveform span {
          width: 6px;
          height: 38%;
          flex: 0 0 auto;
          border-radius: 999px;
          background: linear-gradient(180deg, var(--voice-wave-start), var(--voice-wave-end));
          box-shadow: 0 2px 8px var(--voice-glow);
          transform-origin: center;
          animation: voice-assistant-ready 2.6s ease-in-out infinite;
        }

        .voice-assistant__waveform span:nth-child(2),
        .voice-assistant__waveform span:nth-child(12) {
          height: 50%;
          animation-delay: -180ms;
        }

        .voice-assistant__waveform span:nth-child(3),
        .voice-assistant__waveform span:nth-child(11) {
          height: 66%;
          animation-delay: -360ms;
        }

        .voice-assistant__waveform span:nth-child(4),
        .voice-assistant__waveform span:nth-child(10) {
          height: 82%;
          animation-delay: -540ms;
        }

        .voice-assistant__waveform span:nth-child(5),
        .voice-assistant__waveform span:nth-child(9) {
          height: 100%;
          animation-delay: -720ms;
        }

        .voice-assistant__waveform span:nth-child(6),
        .voice-assistant__waveform span:nth-child(8) {
          height: 76%;
          animation-delay: -900ms;
        }

        .voice-assistant__waveform span:nth-child(7) {
          height: 56%;
          animation-delay: -1080ms;
        }

        .voice-assistant--listening .voice-assistant__waveform span {
          animation-name: voice-assistant-listening;
          animation-duration: 860ms;
        }

        .voice-assistant--processing .voice-assistant__waveform span {
          animation-name: voice-assistant-processing;
          animation-duration: 1.2s;
        }

        .voice-assistant__copy strong {
          display: block;
          color: #24465d;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .voice-assistant__copy p {
          margin: 4px 0 0;
          color: #8293a1;
          font-size: 12px;
          line-height: 1.5;
        }

        @keyframes voice-assistant-ready {
          0%, 100% {
            transform: scaleY(0.7);
            opacity: 0.62;
          }

          50% {
            transform: scaleY(1);
            opacity: 0.9;
          }
        }

        @keyframes voice-assistant-listening {
          0%, 100% {
            transform: scaleY(0.4);
            opacity: 0.72;
          }

          50% {
            transform: scaleY(1.08);
            opacity: 1;
          }
        }

        @keyframes voice-assistant-processing {
          0%, 100% {
            transform: scaleY(0.5);
            opacity: 0.68;
          }

          50% {
            transform: scaleY(0.92);
            opacity: 1;
          }
        }

        @keyframes voice-assistant-glow {
          0%, 100% {
            opacity: 0.56;
            transform: translate(-50%, -50%) scale(0.92);
          }

          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        @media (max-width: 640px) {
          .chat-shell {
            width: 100%;
            padding: 0;
          }

          .chat-card {
            min-height: 100svh;
            border: 0;
            border-radius: 0;
          }

          .chat-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
            padding: 20px 18px;
          }

          .brand-lockup {
            width: 100%;
          }

          .brand-description {
            display: none;
          }

          .status-pill {
            align-self: flex-start;
          }

          .messages {
            min-height: 0;
            padding: 24px 18px;
          }

          .message,
          .message.user {
            width: 100%;
            max-width: 100%;
          }

          .message-body {
            max-width: calc(100% - 47px);
          }

          .bubble {
            max-width: 100%;
          }

          .voice-assistant {
            min-height: 168px;
            padding: 18px 18px 22px;
          }

          .voice-assistant__visual {
            height: 64px;
          }

          .voice-assistant__visual::after {
            width: min(246px, 88vw);
          }

          .voice-assistant-control {
            right: 12px;
            bottom: 190px;
            width: 88px;
          }

          .voice-assistant-control__button {
            width: 68px;
            height: 68px;
          }

          .voice-assistant-control__icon {
            width: 32px;
            height: 32px;
          }

          .voice-assistant-control__hint {
            right: -21px;
            bottom: -27px;
            width: 68px;
          }
        }

        @media (max-width: 420px) {
          .voice-assistant-control {
            bottom: 238px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .voice-assistant-control__halo,
          .voice-assistant-control__sound-wave,
          .voice-assistant-control__interaction-pulse,
          .voice-assistant-control__feedback {
            animation: none;
          }

          .voice-assistant__visual::before,
          .voice-assistant__waveform span {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
