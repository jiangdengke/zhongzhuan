# 机器人语音交互完整流程

本文档说明机器人客户端与中转服务之间的一整轮语音交互流程。

正式联调只涉及两个接口:

- `POST /robot/voiceMonitor`
- `POST /robot/listenQwen`
- `POST /robot/listenQwen/stream`（可选，大模型流式返回）

> 普通 TTS 播放继续使用 `/robot/listenQwen`；如果上游需要边生成边接收大模型文本，使用 `/robot/listenQwen/stream`。

---

## 1. 总体流程

一轮完整语音交互可以概括为:

```text
用户开始说话
  -> 客户端生成 sessionId
  -> 上报开始说话状态
  -> ASR 中间结果多次上报
  -> 用户说话结束
  -> 上报结束状态
  -> 客户端得到最终文本或命令
  -> 调用 /robot/listenQwen 或 /robot/listenQwen/stream
  -> 中转服务返回完整 TTS 文案，或通过 SSE 流式返回 start/delta/done
  -> 客户端播放 TTS
```

---

## 2. 一整轮时序

```text
用户开始说话
   │
   ▼
客户端生成新的 sessionId
   │
   ▼
POST /robot/voiceMonitor
status="1"
   │
   ▼
中转服务返回 HTTP 200
   │
   ▼
用户说话过程中
   │
   ├─ POST /robot/listenQwen event="ASR_PARTIAL" content="查"
   ├─ POST /robot/listenQwen event="ASR_PARTIAL" content="查国"
   └─ POST /robot/listenQwen event="ASR_PARTIAL" content="查国航"
   │
   ▼
用户说话结束
   │
   ▼
POST /robot/voiceMonitor
status="0"
   │
   ▼
客户端得到最终文本或命令
   │
   ├─ 普通对话:
   │    POST /robot/listenQwen event="SPEECH_CONTEXT"
   │       -> 中转服务调用 DeepSeek
   │       -> 返回 RESPONSE_CONTEXT
   │
   │    或 POST /robot/listenQwen/stream event="SPEECH_CONTEXT"
   │       -> 中转服务调用 DeepSeek
   │       -> SSE 返回 start -> delta -> done
   │
   └─ 命令调用:
        POST /robot/listenQwen event="CMD"
           -> 中转服务按 function.name 处理
           -> 返回 RESPONSE_CONTEXT
   │
   ▼
客户端读取 response.content
   │
   ▼
TTS 播放
```

---

## 3. 第一步: 用户开始说话

机器人检测到 `speech_started` 后,客户端生成一个新的 `sessionId`,然后上报语音状态。

请求:

```http
POST /robot/voiceMonitor
Content-Type: application/json; charset=utf-8
```

请求体:

```json
{
  "robotId": "4",
  "status": "1"
}
```

字段说明:

| 字段 | 含义 |
|---|---|
| `robotId` | 机器人 ID |
| `status` | `"1"` 表示用户开始说话 / 机器人开始监听 |

期望响应:

```http
HTTP/1.1 200
```

响应体当前示例:

```json
{"ok":true}
```

客户端只需要判断 HTTP 200,不需要解析响应体。

---

## 4. 第二步: ASR 中间结果上报

用户说话过程中,ASR 会不断产生未定稿的中间文本。客户端可以多次上报这些中间文本。

例如用户正在说“查国航123”,ASR 过程中可能依次产生:

```text
查
查国
查国航
查国航一二三
```

每次中间结果都调用:

```http
POST /robot/listenQwen
Content-Type: application/json; charset=utf-8
```

请求体示例:

```json
{
  "robotId": "4",
  "event": "ASR_PARTIAL",
  "language": "CN",
  "content": "查国航",
  "sessionId": "test-session-001",
  "function": {
    "name": "",
    "param": ""
  }
}
```

处理规则:

- 不调用 DeepSeek
- 不生成 TTS
- 不返回 `RESPONSE_CONTEXT`
- 只做轻量处理,例如日志记录或业务侧感知
- 客户端只需要判断 HTTP 200

期望响应:

```json
{"ok":true}
```

> 这里的“输入流式”不是一个 HTTP 连接里的真正流式输入,而是多次 `POST` 上报 ASR 中间文本。

---

## 5. 第三步: 用户说话结束

机器人检测到 `speech_ended` 后,客户端上报结束状态。

请求:

```http
POST /robot/voiceMonitor
Content-Type: application/json; charset=utf-8
```

请求体:

```json
{
  "robotId": "4",
  "status": "0"
}
```

字段说明:

| 字段 | 含义 |
|---|---|
| `robotId` | 机器人 ID |
| `status` | `"0"` 表示用户说话结束 / 机器人开始处理 |

期望响应:

```http
HTTP/1.1 200
```

---

## 6. 第四步: 最终结果上送

用户说完后,客户端会得到最终识别文本或最终意图命令。

这里分两种情况:

- 普通对话: `event="SPEECH_CONTEXT"`
- 命令调用: `event="CMD"`

---

## 7. 情况 A: 普通对话 `SPEECH_CONTEXT`

如果用户只是普通聊天,或没有识别成具体业务命令,客户端发送 `SPEECH_CONTEXT`。

请求:

```http
POST /robot/listenQwen
Content-Type: application/json; charset=utf-8
```

请求体示例:

```json
{
  "robotId": "4",
  "event": "SPEECH_CONTEXT",
  "language": "CN",
  "content": "你好，你是谁",
  "sessionId": "test-session-001",
  "function": {
    "name": "",
    "param": ""
  }
}
```

中转服务处理流程:

```text
收到 SPEECH_CONTEXT
  -> 读取 content
  -> 调用 DeepSeek
  -> 得到模型回复
  -> 包装成 RESPONSE_CONTEXT
  -> 返回给客户端
```

响应体结构:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "您好，我是智能服务机器人。"
}
```

客户端读取 `content`,送给 TTS 播放。

---

## 8. 情况 B: 命令调用 `CMD`

如果客户端把用户语音识别成明确业务命令,则发送 `CMD`。

例如用户说:

```text
带我去羽厅
```

客户端发送:

```http
POST /robot/listenQwen
Content-Type: application/json; charset=utf-8
```

请求体示例:

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "test-session-001",
  "function": {
    "name": "FINDING_PLACES",
    "param": "{\"placeName\":\"羽厅\"}"
  }
}
```

中转服务处理流程:

```text
收到 CMD
  -> 读取 function.name
  -> 解析 function.param
  -> 按命令类型生成 TTS 文案
  -> 包装成 RESPONSE_CONTEXT
  -> 返回给客户端
```

响应体示例:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "好的，请跟我来，我带您去羽厅。"
}
```

---

## 9. 当前支持的 CMD 类型

| `function.name` | 作用 | 参数示例 | 示例返回 |
|---|---|---|---|
| `FINDING_PLACES` | 引领到地点 | `{"placeName":"羽厅"}` | `好的，请跟我来，我带您去羽厅。` |
| `INTRODUCING_PLACES` | 介绍地点 | `{"placeName":"礼飨"}` | `礼飨是自助餐区。` |
| `FLIGHT` | 查询航班 | `{"flightNo":"CA123"}` | `正在为您查询CA123航班动态，请稍等。` |
| `ACCESS` | 扫码通行 | `null` | `请出示通行二维码，我来协助您扫码通行。` |
| `WEATHER` | 天气播报 | `{"msg":"{...}"}` | `杭州当前晴，气温22°C，湿度60%。` |

---

## 10. `sessionId` 机制

同一轮用户语音交互的所有请求都使用同一个 `sessionId`。

例如一轮完整请求可能是:

```text
voiceMonitor status="1"         sessionId: 无请求字段,客户端内部生成
ASR_PARTIAL content="查"        sessionId: test-session-001
ASR_PARTIAL content="查国航"    sessionId: test-session-001
voiceMonitor status="0"         sessionId: 无请求字段
SPEECH_CONTEXT / CMD             sessionId: test-session-001
```

中转服务会优先使用 `sessionId` 作为日志追踪 ID,方便把同一轮请求串起来。

如果用户开始新一轮说话,客户端会生成新的 `sessionId`。旧响应即使稍后返回,客户端也会丢弃,不会播放。

---

## 11. 哪些请求会返回 TTS

| 接口 / 事件 | 是否返回 TTS | 说明 |
|---|---|---|
| `/robot/voiceMonitor` | 否 | 只看 HTTP 200 |
| `/robot/listenQwen` + `ASR_PARTIAL` | 否 | 只上报中间识别结果 |
| `/robot/listenQwen` + `SPEECH_CONTEXT` | 是 | 调 DeepSeek,返回 TTS |
| `/robot/listenQwen` + `CMD` | 是 | 按命令生成 TTS |

---

## 12. 普通接口、流式接口和 Web 调试台的区别

Web 调试台和需要大模型流的上游客户端都可以调用:

```http
POST /robot/listenQwen/stream
```

它的特点是:

```text
输入: 一次性 JSON
输出: SSE 流式返回
```

普通上游机器人客户端调用的是:

```http
POST /robot/voiceMonitor
POST /robot/listenQwen
```

正式接口特点是:

```text
输入: 一次性 JSON 或 ASR_PARTIAL 多次 POST
输出: 一次性 JSON 或 HTTP 200
```

对比:

| 场景 | 输入 | 输出 |
|---|---|---|
| 上游正式接口 `SPEECH_CONTEXT` | 一次性 JSON | 一次性 JSON |
| 上游可选流式接口 `SPEECH_CONTEXT` | 一次性 JSON | SSE `start -> delta -> done` |
| 上游 `ASR_PARTIAL` | 多次 POST | HTTP 200 |
| Web 调试台 `/stream` | 一次性 JSON | SSE `start -> delta -> done` |
| 真正音频流 / WebSocket 双向流 | 当前没有 | 当前没有 |

---

## 13. 最简流程总结

```text
开始说话 status="1"
  -> ASR_PARTIAL 多次上报中间文本
  -> 说话结束 status="0"
  -> 最终 SPEECH_CONTEXT 或 CMD 发给 /robot/listenQwen
  -> 服务端返回 RESPONSE_CONTEXT.content
  -> 客户端 TTS 播放
```
