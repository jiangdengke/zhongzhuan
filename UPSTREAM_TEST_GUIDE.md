# 上游联调测试说明

本文档给机器人语音交互客户端联调用。客户端需要测试以下正式接口:

- `POST /robot/voiceMonitor`
- `POST /robot/listenQwen`
- `POST /robot/listenQwen/stream`（可选，大模型流式返回）

> 普通 TTS 播放继续使用 `/robot/listenQwen`；如果上游需要边生成边接收大模型文本，使用 `/robot/listenQwen/stream`。

---

## 1. 测试地址

本地直接启动当前服务时:

```bash
npm run dev -- --hostname 0.0.0.0
```

默认地址:

```text
http://127.0.0.1:4000
```

如果是部署环境,请换成实际地址,例如:

```text
http://192.168.112.194:8070
```

下面示例统一使用变量:

```bash
BASE_URL="http://127.0.0.1:4000"
```

---

## 2. 完整语音流程测试

### 2.1 用户开始说话

`status="1"` 表示用户开始说话 / 机器人开始监听。

```bash
curl -i -X POST "$BASE_URL/robot/voiceMonitor" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"robotId":"4","status":"1"}'
```

期望:

```http
HTTP/1.1 200
```

响应体示例:

```json
{"ok":true}
```

客户端只需要判断 HTTP 200,不用解析响应体。

---

### 2.2 ASR 中间结果上报

`event="ASR_PARTIAL"` 表示用户说话过程中的未定稿识别文本。

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"ASR_PARTIAL",
    "language":"CN",
    "content":"查国航",
    "sessionId":"test-session-001",
    "function":{
      "name":"",
      "param":""
    }
  }'
```

期望:

```http
HTTP/1.1 200
```

响应体示例:

```json
{"ok":true}
```

说明:

- 不触发 DeepSeek
- 不返回 TTS 文案
- 客户端不用解析响应体

---

### 2.3 用户说话结束

`status="0"` 表示用户说话结束 / 机器人开始处理。

```bash
curl -i -X POST "$BASE_URL/robot/voiceMonitor" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"robotId":"4","status":"0"}'
```

期望:

```http
HTTP/1.1 200
```

响应体示例:

```json
{"ok":true}
```

---

### 2.4 普通对话最终文本上送

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"SPEECH_CONTEXT",
    "language":"CN",
    "content":"你好，你是谁",
    "sessionId":"test-session-001",
    "function":{
      "name":"",
      "param":""
    }
  }'
```

期望:

```http
HTTP/1.1 200
```

响应体结构:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "<TTS文本>"
}
```

说明:

- 如果服务配置了 `DEEPSEEK_API_KEY`,会返回模型回复。
- 如果没有配置 `DEEPSEEK_API_KEY`,会返回兜底文案。

---

## 3. CMD 命令测试

所有 CMD 请求都走:

```text
POST /robot/listenQwen
```

响应统一是:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "<TTS文本>"
}
```

---

### 3.1 引领地点: `FINDING_PLACES`

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-002",
    "function":{
      "name":"FINDING_PLACES",
      "param":"{\"placeName\":\"羽厅\"}"
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "好的，请跟我来，我带您去羽厅。"
}
```

---

### 3.2 介绍地点: `INTRODUCING_PLACES`

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-003",
    "function":{
      "name":"INTRODUCING_PLACES",
      "param":"{\"placeName\":\"礼飨\"}"
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "礼飨是自助餐区。"
}
```

---

### 3.3 航班查询: `FLIGHT`

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-004",
    "function":{
      "name":"FLIGHT",
      "param":"{\"flightNo\":\"CA123\"}"
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "正在为您查询CA123航班动态，请稍等。"
}
```

---

### 3.4 登机口查询: `BOARDING_GATE`

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-boarding-gate-001",
    "function":{
      "name":"BOARDING_GATE",
      "param":"{\"gateNo\":\"401\"}"
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "正在为您查询401登机口，请稍等。"
}
```

说明:

- 不调用 DeepSeek
- `function.param` 必须是 JSON 字符串
- 参数缺失或 JSON 无效时返回命令参数错误文案

---

### 3.5 扫码通行: `ACCESS`

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-005",
    "function":{
      "name":"ACCESS",
      "param":null
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "请出示通行二维码，我来协助您扫码通行。"
}
```

---

### 3.6 天气查询: `WEATHER`

`WEATHER` 的 `function.param` 是 JSON 字符串,其中 `msg` 也是 JSON 字符串。

```bash
curl -i -X POST "$BASE_URL/robot/listenQwen" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-session-006",
    "function":{
      "name":"WEATHER",
      "param":"{\"msg\":\"{\\\"city\\\":\\\"杭州\\\",\\\"weather\\\":\\\"晴\\\",\\\"temperature\\\":\\\"22°C\\\",\\\"humidity\\\":\\\"60%\\\"}\"}"
    }
  }'
```

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "杭州当前晴，气温22°C，湿度60%。"
}
```

---

## 4. 大模型流式接口测试（可选）

当上游需要边生成边接收大模型文本时，调用:

```text
POST /robot/listenQwen/stream
```

请求体与 `/robot/listenQwen` 相同。响应类型为:

```http
Content-Type: text/event-stream; charset=utf-8
```

### 4.1 SSE 事件格式

#### 开始事件: `start`

```text
event: start
data: {"traceId":"...","robotId":"4","event":"RESPONSE_CONTEXT","sourceEvent":"SPEECH_CONTEXT","sessionId":"..."}
```

表示服务端已经开始处理本轮流式响应。

#### 分片事件: `delta`

```text
event: delta
data: {"content":"您好","chunkIndex":1,"sourceEvent":"SPEECH_CONTEXT"}
```

`delta.data.content` 是本次新增文本。客户端需要自行累加。

#### 结束事件: `done`

```text
event: done
data: {"robotId":"4","event":"RESPONSE_CONTEXT","content":"完整TTS文本","traceId":"...","sourceEvent":"SPEECH_CONTEXT","chunkCount":12}
```

`done.data.content` 是完整文本，可作为最终校准结果。

#### 错误事件: `error`

```text
event: error
data: {"robotId":"4","event":"RESPONSE_CONTEXT","content":"抱歉，系统暂时无法处理这个请求，请稍后再试。"}
```

收到 `error` 后仍可能收到 `done`，客户端可以用 `done.data.content` 做最终兜底。

### 4.2 curl 测试普通对话流

> `-N` 表示关闭 curl 输出缓冲，便于实时看到 `delta`。
> 如果同时打开 `http://127.0.0.1:4000`，上游调用 `/robot/listenQwen/stream` 的内容也会在左侧聊天区按 `delta` 流式追加显示。

```bash
curl -N -X POST "$BASE_URL/robot/listenQwen/stream" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Accept: text/event-stream" \
  -d '{
    "robotId":"4",
    "event":"SPEECH_CONTEXT",
    "language":"CN",
    "content":"帮我介绍一下贵宾厅，可以详细一点",
    "sessionId":"test-stream-001",
    "function":{
      "name":"",
      "param":""
    }
  }'
```

期望能看到:

```text
event: start
data: {...}

event: delta
data: {"content":"...","chunkIndex":1,...}

event: delta
data: {"content":"...","chunkIndex":2,...}

event: done
data: {"robotId":"4","event":"RESPONSE_CONTEXT","content":"..."}
```

### 4.3 curl 测试命令流

CMD 命令不会请求 DeepSeek，流式接口会返回一条 `delta` 和一条 `done`。

```bash
curl -N -X POST "$BASE_URL/robot/listenQwen/stream" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Accept: text/event-stream" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-stream-flight-001",
    "function":{
      "name":"FLIGHT",
      "param":"{\"flightNo\":\"CA1725\"}"
    }
  }'
```

期望最终文本:

```text
正在为您查询CA1725航班动态，请稍等。
```

### 4.4 curl 测试登机口命令流

```bash
curl -N -X POST "$BASE_URL/robot/listenQwen/stream" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Accept: text/event-stream" \
  -d '{
    "robotId":"4",
    "event":"CMD",
    "language":"CN",
    "content":"",
    "sessionId":"test-stream-boarding-gate-001",
    "function":{
      "name":"BOARDING_GATE",
      "param":"{\"gateNo\":\"401\"}"
    }
  }'
```

期望 `delta.data.content` 和 `done.data.content` 都是:

```text
正在为您查询401登机口，请稍等。
```

### 4.5 Python 读取示例

```python
import json
import requests

url = "http://127.0.0.1:4000/robot/listenQwen/stream"
payload = {
    "robotId": "4",
    "event": "SPEECH_CONTEXT",
    "language": "CN",
    "content": "帮我介绍一下贵宾厅",
    "sessionId": "test-stream-python-001",
    "function": {"name": "", "param": ""},
}

with requests.post(url, json=payload, stream=True, timeout=30) as response:
    response.raise_for_status()
    current_event = "message"
    for raw_line in response.iter_lines(decode_unicode=True):
        if not raw_line:
            continue
        if raw_line.startswith("event:"):
            current_event = raw_line[6:].strip()
            continue
        if raw_line.startswith("data:"):
            data = json.loads(raw_line[5:].strip())
            if current_event == "start":
                print("start", data)
            elif current_event == "delta":
                print(data.get("content", ""), end="", flush=True)
            elif current_event == "done":
                print("\ndone", data.get("content", ""))
            elif current_event == "error":
                print("error", data)
```

## 5. 最小验收清单

| 场景 | 请求 | 期望 |
|---|---|---|
| 开始说话 | `/robot/voiceMonitor`, `status="1"` | HTTP 200 |
| ASR 中间结果 | `/robot/listenQwen`, `event="ASR_PARTIAL"` | HTTP 200 |
| 说话结束 | `/robot/voiceMonitor`, `status="0"` | HTTP 200 |
| 普通对话 | `/robot/listenQwen`, `event="SPEECH_CONTEXT"` | `RESPONSE_CONTEXT + content` |
| 引领命令 | `CMD + FINDING_PLACES` | 返回引领文案 |
| 介绍命令 | `CMD + INTRODUCING_PLACES` | 返回介绍文案 |
| 航班命令 | `CMD + FLIGHT` | 返回航班查询文案 |
| 登机口命令 | `CMD + BOARDING_GATE` | 返回登机口查询文案 |
| 扫码命令 | `CMD + ACCESS` | 返回扫码文案 |
| 天气命令 | `CMD + WEATHER` | 返回天气播报文案 |
| 流式普通对话 | `/robot/listenQwen/stream`, `SPEECH_CONTEXT` | `start -> delta -> done` |
| 流式命令 | `/robot/listenQwen/stream`, `CMD` | `start -> delta -> done` |

---

## 6. 注意事项

1. `voiceMonitor.status` 语义:
   - `"1"` = 用户开始说话
   - `"0"` = 用户说话结束

2. `ASR_PARTIAL`:
   - 只表示中间识别结果
   - 不触发 LLM
   - 不返回 TTS
   - 客户端只看 HTTP 200

3. `function.param` 必须是 JSON 字符串,不是对象。

   正确:

   ```json
   "param": "{\"placeName\":\"羽厅\"}"
   ```

   不推荐:

   ```json
   "param": {"placeName":"羽厅"}
   ```

4. `WEATHER` 是双层 JSON 字符串:
   - 外层 `function.param` 是字符串
   - 内层 `msg` 也是字符串

5. 客户端不要重试:
   - 非 2xx 可记录失败并丢弃本轮
   - 服务端会尽量返回 200 + 兜底文案,避免机器人哑火
