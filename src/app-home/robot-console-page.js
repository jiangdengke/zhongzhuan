"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessageStream, subscribeRobotEvents } from "./chat-api.js";
import { DigitalAvatar } from "./digital-avatar.js";
import { quickPrompts } from "./examples.js";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是智能服务助手。你可以咨询问题、获取信息，也可以了解相关服务。",
  },
];

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

export function RobotConsolePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
        applyUpstreamChatEvent(eventName, event, data);
      },
    });
  }, []);

  async function submitMessage(event) {
    event.preventDefault();

    const content = input.trim();
    if (!content || loading) {
      return;
    }

    setInput("");
    setError("");
    setLoading(true);

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "");
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      await sendChatMessageStream(content, {
        onDelta: (delta) => {
          setMessages((current) => updateMessageContent(
            current,
            assistantMessage.id,
            (previousContent) => `${previousContent}${delta}`,
          ));
        },
        onError: (data) => {
          setError(data?.message || "请求失败，请稍后再试。");
          setMessages((current) => updateMessageContent(
            current,
            assistantMessage.id,
            (previousContent) => previousContent || data?.content || "请求失败，请稍后再试。",
          ));
        },
        onDone: (data) => {
          setMessages((current) => updateMessageContent(
            current,
            assistantMessage.id,
            (previousContent) => previousContent || data?.content || "模型返回无效，您可以尝试重新对我说",
          ));
        },
      });

    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "未知错误";
      setError(`请求失败：${message}`);
      setMessages((current) => updateMessageContent(
        current,
        assistantMessage.id,
        () => "请求失败，请稍后再试。",
      ));
    } finally {
      setLoading(false);
    }
  }

  function applyPrompt(prompt) {
    if (loading) {
      return;
    }

    setInput(prompt);
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

        {error ? <div className="error">{error}</div> : null}

        <div className="quick-prompts" aria-label="快捷提问">
          <span className="quick-prompts-label">您可以这样问</span>
          {quickPrompts.map((prompt) => (
            <button type="button" key={prompt} onClick={() => applyPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <form className="composer" onSubmit={submitMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                submitMessage(event);
              }
            }}
            placeholder="请输入您想了解的内容"
            rows={1}
            aria-label="聊天输入"
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? "回复中" : "发送"}
          </button>
        </form>
        <p className="composer-hint">按 Enter 发送，Shift + Enter 换行</p>
      </section>

      <DigitalAvatar />

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

        .error {
          margin: 0 28px 14px;
          border-radius: 18px;
          padding: 12px 14px;
          background: #6f2d20;
          color: #fff4e6;
        }

        .quick-prompts {
          display: flex;
          gap: 8px;
          padding: 0 28px 14px;
          overflow-x: auto;
        }

        button {
          appearance: none;
          border: 1px solid rgba(36, 26, 18, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          color: #2d2118;
          cursor: pointer;
          font: inherit;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #fff9ec;
          box-shadow: 0 10px 24px rgba(52, 37, 22, 0.12);
        }

        button:disabled {
          cursor: wait;
          opacity: 0.55;
        }

        .quick-prompts button {
          flex: 0 0 auto;
          padding: 9px 13px;
          font-size: 14px;
        }

        .composer {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          padding: 18px;
          border-top: 1px solid rgba(36, 26, 18, 0.1);
          background: rgba(255, 250, 238, 0.58);
        }

        textarea {
          width: 100%;
          max-height: 180px;
          border: 1px solid rgba(36, 26, 18, 0.14);
          border-radius: 22px;
          padding: 15px 16px;
          resize: vertical;
          outline: none;
          background: rgba(255, 255, 255, 0.82);
          color: #241a12;
          font: inherit;
          line-height: 1.6;
        }

        textarea:focus {
          border-color: rgba(123, 76, 31, 0.72);
          box-shadow: 0 0 0 4px rgba(186, 127, 53, 0.18);
        }

        .composer button {
          align-self: stretch;
          min-width: 96px;
          padding: 0 20px;
          background: #263b2f;
          color: #fff5df;
          font-weight: 800;
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

        .error {
          margin: 0 40px 14px;
          border: 1px solid #f2d3d3;
          background: #fff6f6;
          color: #b24a4a;
          font-size: 13px;
        }

        .quick-prompts {
          flex-wrap: wrap;
          align-items: center;
          padding: 0 40px 18px;
          background: #f7f9fc;
        }

        .quick-prompts-label {
          flex: 0 0 100%;
          margin-bottom: 2px;
          color: #8b98a6;
          font-size: 12px;
        }

        button {
          border-color: #dbe5ed;
          background: #ffffff;
          color: #416176;
          font-family: inherit;
          transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
        }

        button:hover:not(:disabled) {
          border-color: #9bc8ca;
          background: #eff9f8;
          color: #247b80;
          box-shadow: none;
        }

        .composer {
          gap: 12px;
          padding: 18px 40px 10px;
          border-top: 1px solid #e7edf2;
          background: #ffffff;
        }

        textarea {
          min-height: 50px;
          border-color: #dce5ec;
          border-radius: 16px;
          padding: 13px 15px;
          background: #f8fafc;
          color: #1d2b39;
          font-family: inherit;
          font-size: 15px;
        }

        textarea:focus {
          border-color: #4aa0a2;
          box-shadow: 0 0 0 4px rgba(74, 160, 162, 0.12);
          background: #ffffff;
        }

        .composer button {
          min-width: 84px;
          padding: 0 18px;
          border: 0;
          border-radius: 14px;
          background: #2c668f;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
        }

        .composer button:hover:not(:disabled) {
          background: #24577c;
          color: #ffffff;
          transform: translateY(-1px);
        }

        .composer button:disabled {
          background: #b8c8d4;
          color: #ffffff;
        }

        .composer-hint {
          margin: 0;
          padding: 0 40px 20px;
          background: #ffffff;
          color: #a0aab5;
          font-size: 11px;
          text-align: right;
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

          .quick-prompts {
            padding-left: 18px;
            padding-right: 18px;
            overflow-x: visible;
          }

          .quick-prompts button {
            flex: 0 1 auto;
            white-space: normal;
          }

          .composer {
            grid-template-columns: minmax(0, 1fr) auto;
            padding-left: 18px;
            padding-right: 18px;
          }

          textarea {
            min-width: 0;
          }

          .composer button {
            min-width: 72px;
            padding: 0 14px;
          }

          .composer-hint {
            padding-left: 18px;
            padding-right: 18px;
          }
        }
      `}</style>
    </main>
  );
}
