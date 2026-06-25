"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessageStream, subscribeRobotEvents } from "./chat-api.js";
import { quickPrompts } from "./examples.js";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是机器人对话助手。你输入的话会按机器人协议发给 DeepSeek；上游机器人请求也会在这里实时显示。",
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

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatTime(value) {
  if (!value) {
    return "--:--:--";
  }

  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventLabel(type) {
  const labels = {
    ready: "监听已连接",
    voice: "语音状态",
    asr_partial: "ASR 中间结果",
    final_input: "最终输入",
    deepseek_delta: "DeepSeek 流式输出",
    tts_done: "最终 TTS",
    robot_error: "接口异常",
  };

  return labels[type] || type;
}

function summarizeMonitorEvent(type, event) {
  const data = event?.data || event || {};

  if (type === "voice") {
    return data.status === "1" ? "用户开始说话 / 机器人开始监听" : "用户说话结束 / 开始处理";
  }

  if (type === "asr_partial") {
    return data.content || "空 ASR 中间结果";
  }

  if (type === "final_input") {
    if (data.event === "CMD") {
      return `${data.functionName || "CMD"} ${typeof data.functionParam === "string" ? data.functionParam : ""}`.trim();
    }

    return data.content || data.event || "最终输入已收到";
  }

  if (type === "deepseek_delta") {
    return data.content || "";
  }

  if (type === "tts_done") {
    return data.content || "TTS 文案已生成";
  }

  if (type === "robot_error") {
    return data.message || data.reason || "接口异常";
  }

  return data.ok ? "SSE 已连接" : "等待事件";
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

function createUpstreamInputContent(event, data, chat) {
  if (data.event === "CMD") {
    return chat?.latestAsrContent || createCommandInputContent(data) || summarizeMonitorEvent("final_input", event);
  }

  return data.content || chat?.latestAsrContent || "上游输入已收到";
}

function createAsrPartialContent(data) {
  return data.content ? `正在识别：${data.content}` : "正在识别...";
}

function isWebConsoleSession(data) {
  return typeof data.sessionId === "string" && data.sessionId.startsWith("web-chat-");
}

const initialMonitorState = {
  traceId: "",
  voiceStatus: "",
  phase: "",
  latestAsr: "",
  finalInput: "",
  functionName: "",
  streamReply: "",
  finalTts: "",
  error: "",
};

export function RobotConsolePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastExchange, setLastExchange] = useState(null);
  const [monitorConnected, setMonitorConnected] = useState(false);
  const [monitorState, setMonitorState] = useState(initialMonitorState);
  const [monitorEvents, setMonitorEvents] = useState([]);
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
        upsertUpstreamUserMessage(chat, createUpstreamInputContent(event, data, chat));
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
      onOpen: () => {
        setMonitorConnected(true);
      },
      onError: () => {
        setMonitorConnected(false);
      },
      onEvent: (eventName, event) => {
        const data = event?.data || event || {};
        applyUpstreamChatEvent(eventName, event, data);

        const displayEvent = {
          id: event?.id || `${eventName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: eventName,
          at: event?.at || data.at || new Date().toISOString(),
          traceId: data.traceId || event?.traceId || "",
          summary: summarizeMonitorEvent(eventName, event),
        };

        setMonitorEvents((current) => [displayEvent, ...current].slice(0, 40));
        setMonitorState((current) => {
          if (eventName === "ready") {
            return {
              ...current,
              error: "",
            };
          }

          if (eventName === "voice") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              voiceStatus: data.status || "",
              phase: data.phase || "",
              error: "",
            };
          }

          if (eventName === "asr_partial") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              latestAsr: data.content || "",
              error: "",
            };
          }

          if (eventName === "final_input") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              finalInput: data.event === "CMD" ? summarizeMonitorEvent(eventName, event) : data.content || "",
              functionName: data.functionName || "",
              streamReply: "",
              finalTts: "",
              error: "",
            };
          }

          if (eventName === "deepseek_delta") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              streamReply: `${current.streamReply}${data.content || ""}`,
              error: "",
            };
          }

          if (eventName === "tts_done") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              finalTts: data.content || "",
              streamReply: current.streamReply || data.content || "",
              error: "",
            };
          }

          if (eventName === "robot_error") {
            return {
              ...current,
              traceId: data.traceId || current.traceId,
              error: data.message || data.reason || "接口异常",
            };
          }

          return current;
        });
      },
    });
  }, []);

  function clearMonitor() {
    setMonitorState(initialMonitorState);
    setMonitorEvents([]);
  }

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
      const result = await sendChatMessageStream(content, {
        onStart: (exchange) => {
          setLastExchange(exchange);
        },
        onMeta: (meta) => {
          setLastExchange((current) => ({
            ...current,
            traceId: meta.traceId,
            data: {
              robotId: meta.robotId,
              event: meta.event,
              content: "",
            },
          }));
        },
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

      setLastExchange(result);
    } catch (requestError) {
      setError(`请求失败：${requestError.message}`);
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
          <div>
            <p className="eyebrow">Transit Server Chat</p>
            <h1>机器人对话</h1>
          </div>
          <div className="status-pill">
            <span />
            /robot/listenQwen/stream
          </div>
        </header>

        <section className="messages" aria-label="对话消息">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="avatar">{message.role === "assistant" ? "AI" : "我"}</div>
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
            </article>
          ))}
        </section>

        {error ? <div className="error">{error}</div> : null}

        <div className="quick-prompts">
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
            placeholder="输入一句话，回车发送"
            rows={1}
            aria-label="聊天输入"
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? "发送中" : "发送"}
          </button>
        </form>
      </section>

      <aside className="inspector">
        <section className="inspector-section">
          <p className="eyebrow">Robot Payload</p>
          <h2>本次请求</h2>
          <dl>
            <div>
              <dt>HTTP</dt>
              <dd>{lastExchange ? lastExchange.status : "暂无"}</dd>
            </div>
            <div>
              <dt>Trace ID</dt>
              <dd>{lastExchange?.traceId || "暂无"}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{lastExchange?.payload?.event || "SPEECH_CONTEXT"}</dd>
            </div>
          </dl>
          <pre>{lastExchange ? formatJson(lastExchange.payload) : "发送消息后展示机器人请求体"}</pre>
        </section>

        <section className="inspector-section monitor-panel">
          <div className="monitor-heading">
            <div>
              <p className="eyebrow">Upstream Monitor</p>
              <h2>上游实时监听</h2>
            </div>
            <span className={`monitor-status ${monitorConnected ? "connected" : "disconnected"}`}>
              {monitorConnected ? "已连接" : "未连接"}
            </span>
          </div>

          <dl className="monitor-fields">
            <div>
              <dt>Trace</dt>
              <dd>{monitorState.traceId || "暂无"}</dd>
            </div>
            <div>
              <dt>Voice</dt>
              <dd>{monitorState.voiceStatus ? `${monitorState.voiceStatus} / ${monitorState.phase}` : "暂无"}</dd>
            </div>
            <div>
              <dt>ASR</dt>
              <dd>{monitorState.latestAsr || "暂无"}</dd>
            </div>
            <div>
              <dt>Final</dt>
              <dd>{monitorState.finalInput || "暂无"}</dd>
            </div>
            <div>
              <dt>Reply</dt>
              <dd>{monitorState.streamReply || "暂无"}</dd>
            </div>
            <div>
              <dt>TTS</dt>
              <dd>{monitorState.finalTts || "暂无"}</dd>
            </div>
            {monitorState.error ? (
              <div>
                <dt>Error</dt>
                <dd>{monitorState.error}</dd>
              </div>
            ) : null}
          </dl>

          <div className="monitor-actions">
            <button type="button" onClick={clearMonitor}>清空监听</button>
            <span>GET /robot/events</span>
          </div>

          <div className="event-feed" aria-label="上游事件流">
            {monitorEvents.length === 0 ? (
              <p className="empty-feed">等待上游请求...</p>
            ) : monitorEvents.map((event) => (
              <article className={`event-item ${event.type}`} key={event.id}>
                <div className="event-meta">
                  <span>{formatTime(event.at)}</span>
                  <strong>{getEventLabel(event.type)}</strong>
                </div>
                <p>{event.summary}</p>
                {event.traceId ? <small>{event.traceId}</small> : null}
              </article>
            ))}
          </div>
        </section>
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

        .chat-card,
        .inspector {
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

        .inspector {
          align-self: start;
          position: sticky;
          top: 32px;
          border-radius: 30px;
          padding: 18px;
          display: grid;
          gap: 18px;
          max-height: calc(100vh - 64px);
          overflow: auto;
        }

        .inspector-section {
          min-width: 0;
        }

        .inspector-section + .inspector-section {
          border-top: 1px solid rgba(36, 26, 18, 0.1);
          padding-top: 18px;
        }

        .monitor-heading {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .monitor-status {
          flex: 0 0 auto;
          border: 1px solid rgba(36, 26, 18, 0.14);
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 12px;
          font-weight: 800;
        }

        .monitor-status.connected {
          color: #23543a;
          background: rgba(66, 121, 90, 0.14);
        }

        .monitor-status.disconnected {
          color: #6f2d20;
          background: rgba(111, 45, 32, 0.12);
        }

        .monitor-fields {
          margin: 16px 0;
        }

        .monitor-actions {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
        }

        .monitor-actions button {
          padding: 8px 12px;
          font-size: 13px;
        }

        .monitor-actions span {
          color: #77624d;
          font-family: "SFMono-Regular", "Menlo", monospace;
          font-size: 11px;
        }

        .event-feed {
          display: grid;
          gap: 10px;
          max-height: 360px;
          overflow: auto;
        }

        .empty-feed {
          margin: 0;
          border: 1px dashed rgba(36, 26, 18, 0.18);
          border-radius: 16px;
          padding: 14px;
          color: #77624d;
          font-size: 13px;
        }

        .event-item {
          border: 1px solid rgba(36, 26, 18, 0.11);
          border-radius: 16px;
          padding: 10px 11px;
          background: rgba(255, 255, 255, 0.56);
        }

        .event-item.deepseek_delta {
          background: rgba(66, 121, 90, 0.11);
        }

        .event-item.robot_error {
          background: rgba(111, 45, 32, 0.11);
        }

        .event-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: #77624d;
          font-family: "SFMono-Regular", "Menlo", monospace;
          font-size: 11px;
        }

        .event-meta strong {
          color: #5e4a37;
        }

        .event-item p {
          margin: 7px 0 0;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .event-item small {
          display: block;
          margin-top: 6px;
          color: #8b735c;
          font-family: "SFMono-Regular", "Menlo", monospace;
          overflow-wrap: anywhere;
        }

        dl {
          display: grid;
          gap: 10px;
          margin: 22px 0;
        }

        dl div {
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 10px;
          align-items: start;
        }

        dt {
          color: #77624d;
          font-size: 13px;
        }

        dd {
          min-width: 0;
          margin: 0;
          overflow-wrap: anywhere;
          color: #2d2118;
          font-family: "SFMono-Regular", "Menlo", monospace;
          font-size: 13px;
        }

        pre {
          min-height: 260px;
          margin: 0;
          border: 1px solid rgba(36, 26, 18, 0.12);
          border-radius: 20px;
          padding: 16px;
          overflow: auto;
          background: #211a14;
          color: #ffe9bd;
          font-family: "SFMono-Regular", "Menlo", monospace;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        @media (max-width: 960px) {
          .chat-shell {
            grid-template-columns: 1fr;
          }

          .chat-card {
            min-height: 78vh;
          }

          .inspector {
            position: static;
          }
        }

        @media (max-width: 640px) {
          .chat-shell {
            width: min(100vw - 20px, 640px);
            padding: 10px 0;
          }

          .chat-card,
          .inspector {
            border-radius: 24px;
          }

          .chat-header,
          .messages {
            padding-left: 18px;
            padding-right: 18px;
          }

          .chat-header {
            flex-direction: column;
          }

          .message,
          .message.user {
            grid-template-columns: 34px minmax(0, 1fr);
            align-self: stretch;
          }

          .message.user .avatar {
            grid-column: 1;
          }

          .message.user .bubble {
            grid-column: 2;
          }

          .avatar {
            width: 34px;
            height: 34px;
            border-radius: 12px;
            font-size: 12px;
          }

          .bubble {
            max-width: 100%;
          }

          .quick-prompts {
            padding-left: 18px;
            padding-right: 18px;
          }

          .composer {
            grid-template-columns: 1fr;
          }

          .composer button {
            min-height: 48px;
          }
        }
      `}</style>
    </main>
  );
}
