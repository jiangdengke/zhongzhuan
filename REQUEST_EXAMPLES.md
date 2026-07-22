# 请求测试说明

本文档用于测试当前 Next.js 中转服务的两个接口:

- `POST /robot/voiceMonitor`: 接收录音状态
- `POST /robot/listenQwen`: 接收转写后的文字或命令,并返回 TTS 文案

## 1. 启动服务

```bash
npm run dev -- --hostname 0.0.0.0
```

默认测试地址:

```text
http://127.0.0.1:4000
```

## 2. DeepSeek 配置

如需测试 `SPEECH_CONTEXT` 调用 DeepSeek,需要配置环境变量:

```bash
export DEEPSEEK_API_KEY="你的 DeepSeek Key"
export DEEPSEEK_BASE_URL="https://api.deepseek.com"
export DEEPSEEK_MODEL="deepseek-chat"
```

也可以写入 `.env`:

```env
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_REPLY_CHARS=30
DEEPSEEK_SYSTEM_PROMPT=你是语音播报助手。请用中文回答,不超过30个字,只输出可直接播报的内容,不要表情,不要 Markdown。
```

如果没有配置 `DEEPSEEK_API_KEY`,服务会返回兜底文案。
`DEEPSEEK_SYSTEM_PROMPT` 用于约束 DeepSeek 回复长度和播报格式。
`DEEPSEEK_MAX_REPLY_CHARS` 是服务端兜底保护,默认是 30,避免模型偶尔超长。

## 3. 正确调用流程

一次完整语音交互的顺序是:

1. 用户开始说话: 请求 `/robot/voiceMonitor`, `status="1"`
2. 用户说话过程中: 可多次请求 `/robot/listenQwen`, `event="ASR_PARTIAL"`
3. 用户说话结束: 请求 `/robot/voiceMonitor`, `status="0"`
4. 客户端完成语音转文字/意图识别后,请求 `/robot/listenQwen`

注意: 本服务不接收音频,只接收客户端已经转写好的文字或命令。

## 4. 测试普通对话

普通对话会走 DeepSeek。

### 4.1 开始录音

```bash
curl -X POST http://127.0.0.1:4000/robot/voiceMonitor \
  -H "Content-Type: application/json" \
  -d '{"robotId":"4","status":"1"}'
```

期望响应:

```json
{"ok":true}
```

### 4.2 结束录音

```bash
curl -X POST http://127.0.0.1:4000/robot/voiceMonitor \
  -H "Content-Type: application/json" \
  -d '{"robotId":"4","status":"0"}'
```

期望响应:

```json
{"ok":true}
```

### 4.3 发送转写文本

```bash
curl -X POST http://127.0.0.1:4000/robot/listenQwen \
  -H "Content-Type: application/json" \
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

期望响应:

```json
{
  "robotId": "4",
  "event": "RESPONSE_CONTEXT",
  "content": "<DeepSeek 返回的文本>"
}
```

### 4.4 上报 ASR 中间结果

ASR 中间结果不会触发 DeepSeek,客户端只看 HTTP 200。

```bash
curl -X POST http://127.0.0.1:4000/robot/listenQwen \
  -H "Content-Type: application/json" \
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

期望响应:

```json
{"ok":true}
```

## 5. 测试 CMD 命令

CMD 不调用 DeepSeek,会按 `function.name` 生成对应 TTS 文案。

```bash
curl -X POST http://127.0.0.1:4000/robot/listenQwen \
  -H "Content-Type: application/json" \
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

查询登机口命令不会调用 DeepSeek:

```bash
curl -X POST http://127.0.0.1:4000/robot/listenQwen \
  -H "Content-Type: application/json" \
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

## 6. 日志查看

默认日志是便于人工阅读的格式,可以直接看启动服务的终端。

普通对话大致会看到:

```text
INFO [listenQwen] 收到请求 trace=test-session-001 event=SPEECH_CONTEXT text="你好，你是谁"
INFO [deepseek] DeepSeek 请求 trace=test-session-001 model=deepseek-chat apiKey=true
INFO [deepseek] DeepSeek 成功 trace=test-session-001 cost=xxxms answer="..."
INFO [listenQwen] 响应完成 trace=test-session-001 cost=xxxms reply="..."
```

如果想输出 JSON 日志:

```bash
LOG_FORMAT=json npm run dev -- --hostname 0.0.0.0
```
