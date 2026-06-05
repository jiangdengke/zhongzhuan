"use client";

import { useState } from "react";
import { sendChatMessageStream } from "./chat-api.js";
import { quickPrompts } from "./examples.js";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是机器人对话助手。你输入的话会按机器人协议发给 DeepSeek。",
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

export function RobotConsolePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastExchange, setLastExchange] = useState(null);

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
          width: min(1240px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 32px 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
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
          padding: 22px;
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
