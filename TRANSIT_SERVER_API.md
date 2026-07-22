# 中转服务接口规范

> 文档面向:中转服务开发人员
> 客户端:机器人语音交互系统(Python)
> 协议:HTTP POST,Content-Type: `application/json`,字符集 UTF-8

---

## 1. 概述

机器人客户端通过 HTTP 调用中转服务,中转服务承担两类职责:

1. **对话/命令转发** — 把用户语音文本(或意图命令)转给业务后端,返回 TTS 文本
2. **接收语音状态上报** — 接收机器人当前的语音状态,用于业务侧感知

客户端**所有请求都使用 POST + JSON**。每个 HTTP 请求超时为 **15 秒**(可配置)。

### 1.1 服务端两个端点总览

| 端点 | 用途 | 方向 |
|------|------|------|
| `POST /robot/listenQwen` | 对话和命令分发的核心接口 | 客户端 → 中转服务 → 业务后端 → 客户端 |
| `POST /robot/listenQwen/stream` | 大模型流式返回接口（可选） | 客户端 → 中转服务 → DeepSeek → 客户端 |
| `POST /robot/voiceMonitor` | 客户端上报语音状态 | 客户端 → 中转服务(通常无需返回内容) |

### 1.2 客户端基础信息

```
Base URL: http://192.168.112.194:8070   # 可配置
Robot ID: "4"                           # 字符串类型,可配置
```

---

## 2. 接口 1:`/robot/listenQwen`

### 2.1 请求方法
```
POST {base_url}/robot/listenQwen
Content-Type: application/json; charset=utf-8
```

### 2.2 请求体公共字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `robotId` | string | 是 | 机器人 ID,固定字符串(如 `"4"`) |
| `event` | string | 是 | 事件类型,见下表 |
| `language` | string | 是 | 语言代码,固定 `"CN"` |
| `content` | string | 是 | 用户语音识别后的文本(对话事件时有值,命令事件时为空字符串 `""`) |
| `sessionId` | string | 是 | **会话令牌**(uuid 格式)。同一轮交互的请求共享同一个 sessionId,用户重新说话时会更换 |
| `function` | object | 是 | 函数调用信息,见下表(对话事件时为空对象结构) |

### 2.3 `event` 取值

| event 值 | 含义 | 触发场景 |
|---------|------|---------|
| `SPEECH_CONTEXT` | 用户语音对话 | 用户随意聊天,LLM 没识别到具体意图 |
| `CMD` | 命令调用 | LLM 把用户语音识别为具体功能(如查航班、查天气、引领等) |
| `ASR_PARTIAL` | ASR 识别中间结果 | 用户说话过程中,ASR 流式输出的未定稿文本(见 [2.10](#210-asr_partial-中间结果上报)) |
| `RESPONSE_CONTEXT` | (保留,目前未使用) | — |

### 2.4 `function` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 命令名称,见下方"功能枚举"。`SPEECH_CONTEXT` 事件时传空字符串 `""` |
| `param` | string \| null | 命令参数,**JSON 字符串**(嵌套 JSON,不是对象)。`SPEECH_CONTEXT` 时为空字符串 `""`,`ACCESS` 命令时为 `null` |

### 2.5 功能枚举(`function.name` 取值)

| name | 含义 | param 内容 |
|------|------|-----------|
| `INTRODUCING_PLACES` | 介绍场所 | JSON 字符串,含 `placeName`(标准化后的中文地名) |
| `FINDING_PLACES` | 引领到指定地点 | 同上,且地名集合多含洗手间、母婴室 |
| `FLIGHT` | 查询航班动态 | JSON 字符串,含 `flightNo`(标准化后的 IATA 码,如 `CA123`) |
| `BOARDING_GATE` | 查询登机口 | JSON 字符串,含 `gateNo`(如 `401`) |
| `ACCESS` | 扫码 / 通行 | `null`(无参数) |
| `WEATHER` | 天气查询 | JSON 字符串,见 [天气接口](#28-weather-参数详细说明) |

### 2.6 请求体示例

#### (1) 普通对话(`SPEECH_CONTEXT`)

```json
{
  "robotId": "4",
  "event": "SPEECH_CONTEXT",
  "language": "CN",
  "content": "你好,你是谁",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "",
    "param": ""
  }
}
```

#### (2) 引领命令(`CMD` + `FINDING_PLACES`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "FINDING_PLACES",
    "param": "{\"placeName\": \"羽厅\"}"
  }
}
```

#### (3) 介绍命令(`CMD` + `INTRODUCING_PLACES`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "INTRODUCING_PLACES",
    "param": "{\"placeName\": \"礼飨\"}"
  }
}
```

#### (4) 航班查询(`CMD` + `FLIGHT`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "FLIGHT",
    "param": "{\"flightNo\": \"CA123\"}"
  }
}
```

#### (5) 登机口查询(`CMD` + `BOARDING_GATE`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "BOARDING_GATE",
    "param": "{\"gateNo\":\"401\"}"
  }
}
```

固定返回:

```text
正在为您查询401登机口，请稍等。
```

#### (6) 扫码(`CMD` + `ACCESS`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "ACCESS",
    "param": null
  }
}
```

#### (7) 天气查询(`CMD` + `WEATHER`)

```json
{
  "robotId": "4",
  "event": "CMD",
  "language": "CN",
  "content": "",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "WEATHER",
    "param": "{\"msg\": \"{\\\"city\\\":\\\"杭州\\\",\\\"temperature\\\":\\\"22°C\\\",...}\"}"
  }
}
```

> 注:`WEATHER` 的 `param` 是**双层 JSON 字符串**(`msg` 内部又是 JSON 字符串),原始天气数据由客户端先调用本地天气服务获取,然后封装传给中转服务。

### 2.7 响应体规范

#### 成功响应(HTTP 200)

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "您好,我是机场服务机器人..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `robotId` | string | 是 | 机器人 ID,与请求中的 `robotId` 一致 |
| `event` | string | 是 | 固定为 `"RESPONSE_CONTEXT"`,表示这是一条响应 |
| `content` | string | 是 | **TTS 播报文本**,客户端会直接送给 TTS 播放 |

> 注:无论请求的 `event` 是 `SPEECH_CONTEXT` 还是 `CMD`,响应的 `event` 统一为 `RESPONSE_CONTEXT`。

#### 失败响应

- 客户端依赖 `response.raise_for_status()`,**HTTP 状态码非 2xx 视为失败**
- 客户端会捕获异常并跳过本轮 TTS,**不会**再次重试
- 服务端建议在异常时也返回 200 + 兜底文案,避免哑火

#### 兜底响应建议

如果业务后端处理失败但希望机器人有反馈,推荐:
```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "抱歉,系统暂时无法处理这个请求,请稍后再试"
}
```

如果 `content` 字段缺失,客户端会用默认兜底:`"模型返回无效，您可以尝试重新对我说"`。

### 2.8 流式响应接口: `/robot/listenQwen/stream`

当客户端需要边生成边接收大模型文本时，可以调用流式接口:

```http
POST {base_url}/robot/listenQwen/stream
Content-Type: application/json; charset=utf-8
Accept: text/event-stream
```

请求体与 `/robot/listenQwen` 完全相同。服务端响应为 SSE:

```http
Content-Type: text/event-stream; charset=utf-8
```

#### 事件顺序

```text
start -> delta -> delta -> ... -> done
```

异常时可能出现:

```text
start -> error -> done
```

#### `start` 开始事件

```text
event: start
data: {"traceId":"...","robotId":"4","event":"RESPONSE_CONTEXT","sourceEvent":"SPEECH_CONTEXT","sessionId":"..."}
```

表示本轮流式响应开始。

#### `delta` 分片事件

```text
event: delta
data: {"content":"您好","chunkIndex":1,"sourceEvent":"SPEECH_CONTEXT"}
```

`content` 是本次新增文本，客户端需要自行累加。

#### `done` 结束事件

```text
event: done
data: {"robotId":"4","event":"RESPONSE_CONTEXT","content":"完整TTS文本","traceId":"...","sourceEvent":"SPEECH_CONTEXT","chunkCount":12}
```

`content` 是完整文本，可用于最终校准。

#### `error` 错误事件

```text
event: error
data: {"robotId":"4","event":"RESPONSE_CONTEXT","content":"抱歉，系统暂时无法处理这个请求，请稍后再试。"}
```

客户端收到 `error` 后仍应继续读取到 `done` 或连接结束。

#### 处理规则

| 请求类型 | 流式接口行为 |
|---|---|
| `SPEECH_CONTEXT` 普通对话 | 请求 DeepSeek，按 `delta` 流式返回 |
| `CMD` 命令 | 不请求 DeepSeek，返回一条命令文案 `delta` 后 `done` |
| `ASR_PARTIAL` | 不请求 DeepSeek，直接 `done` |
| 明显航班查询的 `SPEECH_CONTEXT` | 自动按 `FLIGHT` 命令处理，不请求 DeepSeek |

### 2.9 WEATHER 参数详细说明

天气查询比较特殊。**客户端先调本地天气服务**,把结果再传给中转服务做 TTS 文案生成:

```
用户说"今天天气怎么样"
       │
       ▼
客户端调本地 http://127.0.0.1:8009/weather?city=杭州
       │
       ▼ 拿到 {"city":"杭州","temperature":"22°C", ...}
       │
       ▼ 封装为 param: "{\"msg\":\"<上面的 JSON 字符串>\"}"
       │
       ▼
POST /robot/listenQwen (event=CMD, function.name=WEATHER, function.param=...)
       │
       ▼ 中转服务/业务后端:解析 msg,生成自然语言播报文案
       │
       ▼ 返回 {"robotId":"4","event":"RESPONSE_CONTEXT","content":"杭州今天 22 度,晴..."}
       │
       ▼
客户端 TTS 播报
```

**中转服务侧的处理:** 解析 `function.param` 里的 `msg` 字段(双层 JSON 字符串),根据天气数据生成播报文本。

### 2.10 `ASR_PARTIAL` 中间结果上报

用户说话过程中,ASR 会**流式**输出尚未定稿的识别文本。客户端把这些**中间结果**通过 `event=ASR_PARTIAL` 实时发给后端,用于业务侧感知"用户正在说什么"。

**与 `SPEECH_CONTEXT` 的区别:**

| | `SPEECH_CONTEXT` | `ASR_PARTIAL` |
|---|---|---|
| 时机 | 用户**说完一整句** | 用户**说话过程中** |
| 文本 | 最终定稿文本 | 未定稿的中间文本,会变动 |
| 频率 | 一轮一条 | 一轮多条 |
| 后端是否返回 TTS | **是**,返回 `RESPONSE_CONTEXT` | **否**,只回 HTTP 200 |
| 是否触发 LLM | 是 | 否 |

字段复用接口 1 的公共字段,`content` 装中间文本,`function` 传空结构。

```json
{
  "robotId": "4",
  "event": "ASR_PARTIAL",
  "language": "CN",
  "content": "查国航",
  "sessionId": "8f3e2a4b-...",
  "function": {
    "name": "",
    "param": ""
  }
}
```

响应规范:

- 后端**只需返回 HTTP 200**,客户端**不解析响应体**
- 即使返回了 `content`,客户端也会忽略,**不会**送 TTS
- 失败时客户端只记录日志,**不重试,不影响主流程**

---

## 3. 接口 2:`/robot/voiceMonitor`

### 3.1 用途
机器人客户端**主动**上报当前语音状态。中转服务通常只需返回 200 即可,不需要返回业务数据。

### 3.2 触发时机

| 触发点 | 上报值 | 含义 |
|--------|--------|------|
| 用户开始说话(语音输入端点检测到 speech_started) | `"1"` | 机器人开始监听 |
| 用户说话结束(speech_ended) | `"0"` | 机器人开始处理(进入 LLM 等待) |

### 3.3 请求方法
```
POST {base_url}/robot/voiceMonitor
Content-Type: application/json
```

### 3.4 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `robotId` | string | 是 | 机器人 ID(如 `"4"`) |
| `status` | string | 是 | 状态值,`"1"` = 开始说话,`"0"` = 说话结束 |

#### 示例

```json
{ "robotId": "4", "status": "1" }
```

```json
{ "robotId": "4", "status": "0" }
```

### 3.5 调用时序

一次普通语音交互通常是:

1. 客户端上报 `/robot/voiceMonitor`, `status="1"`: 开始说话/开始监听
2. 用户说话过程中,客户端可多次上报 `/robot/listenQwen`, `event="ASR_PARTIAL"`
3. 客户端上报 `/robot/voiceMonitor`, `status="0"`: 说话结束/开始处理
4. 客户端完成 ASR/意图识别后,发送 `/robot/listenQwen`
   - `event="SPEECH_CONTEXT"` 时,`content` 带识别出的文本
   - `event="CMD"` 时,`function.name` / `function.param` 带命令信息

### 3.6 响应规范
- 客户端只关心 HTTP 状态码,**不解析响应体**
- 200 视为成功,其他视为失败
- 失败时客户端只记录日志,**不重试,不影响主流程**

---

## 4. sessionId 机制说明(重要)

### 4.1 生成规则
- 客户端每次检测到用户开始说话(`speech_started` 事件),会生成一个新的 `sessionId`(uuid v4 格式)
- 同一轮交互里,后续的 `/robot/listenQwen` 请求会沿用同一个 sessionId,直到本轮结束

### 4.2 中转服务侧用途
- 可用作**请求追踪 ID**(日志关联、链路追踪)
- 可用作**业务后端的 session 标识**(如多轮对话上下文)

### 4.3 客户端侧的去重逻辑(供参考)
- 客户端有一个**令牌机制**:用户说新话时,旧的 sessionId 自动作废
- 即使中转服务用旧 sessionId 返回了响应,客户端也会丢弃,不会播放
- **中转服务无需感知这一点**,正常返回即可

---

## 5. 字段命名约定

为保持代码一致性,**已确认的拼写问题不要改**:

| 字段名 | 备注 |
|--------|------|
| `robotId` | 注意是 `robotId` 不是 `robot_id` |
| `sessionId` | 注意是 `sessionId` 不是 `session_id` |
| `INTRODUCING_PLACES` | 客户端枚举名为 `NTRODUCING_PLACES`(少了 `I`),但**实际传输的字符串值是 `INTRODUCING_PLACES`** |
| `placeName` | 驼峰命名,客户端规范化后传入 |
| `flightNo` | 同上 |

---

## 6. 标准化后的参数取值范围(参考)

### 6.1 地名(`placeName`)

客户端会做**别名归一化**,中转服务收到的都是标准名:

| 标准名 | 含义 | 客户端会处理的别名 |
|--------|------|-------------------|
| 境安 | 休息区 | "休息区"、"开放休息区" |
| 羽厅 | 前台 | "前台"、"接待区" |
| 凤庭 | 文化长廊 | "国航文化长廊" |
| 云舍 | 便捷休息区 | "便捷休息区" |
| 书间 | 商务阅读区 | "商务阅读区" |
| 栖木 | 安静休息区 | "安静休息区" |
| 礼飨 | 自助餐区 | "明档"、"明道"、"自助餐台"、"餐台"、"取餐区"、"自助餐区"、"餐区"、"明荡"等 |
| 桐轩 | 茶室水吧 | "茶室水吧"、"水吧"、"吧台" |
| 洗手间 | 洗手间 | "厕所"(仅 `FINDING_PLACES` 场景) |
| 母婴室 | 母婴室 | (仅 `FINDING_PLACES` 场景) |

### 6.2 航班号(`flightNo`)

客户端会把中文航司、同音字、错码等**规范化为 IATA 二字代码 + 3-4 位数字**,例如:

| 用户原始说法 | 客户端规范化结果 | 服务端收到 |
|-------------|------------------|-----------|
| "国航123" | `CA123` | `{"flightNo": "CA123"}` |
| "CAA123"(ASR 误识) | `CA123`(去重) | `{"flightNo": "CA123"}` |
| "3U800" | `3U800` | `{"flightNo": "3U800"}` |
| "妹优123"(同音字) | `MU123` | `{"flightNo": "MU123"}` |

合法航司前缀范围:`CA、MU、CZ、HU、ZH、SC、MF、3U、HO、GS、EU、G5`。

> 注:中转服务**不需要**再做规范化,直接按 `flightNo` 字段查业务即可。

---

## 7. 测试参考

### 7.1 用 curl 模拟客户端请求

```bash
# 1. 开始录音
curl -X POST http://192.168.112.194:8070/robot/voiceMonitor \
  -H "Content-Type: application/json" \
  -d '{"robotId": "4", "status": "1"}'

# 2. 结束录音
curl -X POST http://192.168.112.194:8070/robot/voiceMonitor \
  -H "Content-Type: application/json" \
  -d '{"robotId": "4", "status": "0"}'

# ASR 中间结果上报
curl -X POST http://192.168.112.194:8070/robot/listenQwen \
  -H "Content-Type: application/json" \
  -d '{
    "robotId": "4",
    "event": "ASR_PARTIAL",
    "language": "CN",
    "content": "查国航",
    "sessionId": "test-uuid-001",
    "function": {"name": "", "param": ""}
  }'

# 3. 普通对话文本上送
curl -X POST http://192.168.112.194:8070/robot/listenQwen \
  -H "Content-Type: application/json" \
  -d '{
    "robotId": "4",
    "event": "SPEECH_CONTEXT",
    "language": "CN",
    "content": "你好",
    "sessionId": "test-uuid-001",
    "function": {"name": "", "param": ""}
  }'

# 命令请求同样是在结束录音后发送
curl -X POST http://192.168.112.194:8070/robot/listenQwen \
  -H "Content-Type: application/json" \
  -d '{
    "robotId": "4",
    "event": "CMD",
    "language": "CN",
    "content": "",
    "sessionId": "test-uuid-002",
    "function": {"name": "FINDING_PLACES", "param": "{\"placeName\":\"羽厅\"}"}
  }'
```

### 7.2 期望响应

`/robot/listenQwen` 返回:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "<TTS 文本>"
}
```

`/robot/voiceMonitor` 只看 HTTP 200,响应体不解析。

---

## 8. 接口约束总结

| 项 | 约束 |
|----|------|
| 协议 | HTTP/1.1 POST |
| 编码 | UTF-8 |
| 请求/响应类型 | `application/json` |
| 客户端超时 | 15 秒 |
| 重试 | 客户端**不重试**,失败即丢弃本轮 |
| 中转服务端响应 | 推荐总是 200 + `content`,异常情况返回兜底文案 |
| sessionId | uuid v4 格式,可用于追踪和上下文 |
| `param` 字段 | **JSON 字符串**(不是嵌套对象),需自行 `json.loads` |

---

## 附:接口字段速查表

### `/robot/listenQwen` 请求

```
{
  "robotId":   "4",
  "event":     "SPEECH_CONTEXT" | "CMD" | "ASR_PARTIAL",
  "language":  "CN",
  "content":   "<用户语音文本>" | "<ASR中间文本>" | "",
  "sessionId": "<uuid>",
  "function": {
    "name":  "" | "INTRODUCING_PLACES" | "FINDING_PLACES" | "FLIGHT" | "ACCESS" | "WEATHER",
    "param": "" | "<JSON字符串>" | null
  }
}
```

### `/robot/listenQwen` 响应

```
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "<TTS文本>"
}
```

### `/robot/voiceMonitor` 请求

```
{
  "robotId": "4",
  "status":  "0" | "1"
}
```

其中 `"1"` 表示开始说话,`"0"` 表示说话结束。

### `/robot/voiceMonitor` 响应

```
HTTP 200(响应体不解析)
```
