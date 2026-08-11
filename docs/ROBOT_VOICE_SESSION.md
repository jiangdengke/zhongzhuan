# Voice Session Integration

## Configuration

Set the voice service HTTP base URL on the transit server:

```env
ROBOT_CLIENT_BASE_URL=http://localhost:9000
ROBOT_CLIENT_TIMEOUT_MS=5000
ROBOT_ID=4
```

The `ROBOT_CLIENT_*` and `ROBOT_ID` names are retained for compatibility with the existing protocol. They identify the separately managed voice service and terminal; they do not mean that the voice service is the robot runtime.

If `ROBOT_CLIENT_BASE_URL` is omitted, the project defaults to `http://localhost:9000` for the current same-server deployment.

The voice service must therefore listen on `localhost:9000`, `127.0.0.1:9000`, or `0.0.0.0:9000`. Binding the voice service only to a specific LAN address does not guarantee that `localhost:9000` will be reachable. If the two services later run in separate containers, replace `localhost` with the voice service container name or another reachable address.

The browser never calls the voice service directly. The transit server forwards the control request so the service address stays out of browser code and cross-origin restrictions do not apply.

The internal browser control endpoint accepts only `application/json` and does not grant cross-origin browser access. This keeps cross-site requests behind the browser's CORS preflight while allowing deployments where a reverse proxy rewrites the backend host or request metadata.

## Whole-session control

The page calls the internal endpoint:

```http
POST /api/voice-session/control
```

On the first microphone click:

```json
{
  "status": "1"
}
```

The transit server generates a whole-session ID and forwards this request to the voice service:

```http
POST http://<voice-service>:9000/robot/voiceSession/control
```

```json
{
  "robotId": "4",
  "sessionId": "session-<uuid>",
  "status": "1"
}
```

The returned `sessionId` stays unchanged until the second click. Silence and `POST /robot/voiceMonitor` do not end this whole session.

The customer page uses the centered bottom microphone and the waveform beside the page heading as whole-session indicators. Both are blue before the session starts, change to green immediately after a successful start, and remain green until the user ends the whole session. Listening and processing callbacks can still change the waveform animation and status copy without overriding the active-session green color. The conversation and bottom microphone areas remain transparent so the page background stays visible, while their reserved layout areas prevent the microphone from covering conversation messages.

The microphone remains touch-responsive while a start or stop request is pending. A repeated tap during that interval shows an immediate `请求处理中，请稍候` acknowledgment and interaction pulse, but a synchronous request lock prevents it from sending another control request. Android touch handling uses the normal click path with `touch-action: manipulation`; no parallel touch handler is registered, so one physical tap cannot produce duplicate start or stop calls.

On the second microphone click, the page sends the stored ID:

```json
{
  "sessionId": "session-<uuid>",
  "status": "0"
}
```

The transit server injects the configured `ROBOT_ID` when forwarding both commands. After a successful stop, it marks that voice session closed and clears its active model-response accumulator and snapshot. Existing messages remain visible in the page.

## Voice-service model callbacks

The voice service reports its model response to the transit server with three phases.

The required order is:

```text
response_monitor status="1"
  -> zero or more Response/stream increments
  -> response_monitor status="0"
```

The callback `robotId` must identify the terminal that owns the response. The transit server uses this terminal ID to bind every callback to that terminal's current whole voice session. A callback therefore does not need to return the whole-session ID previously sent to the voice service.

The callback `sessionId` is optional. If the voice service still sends its own per-utterance or model-turn ID, the transit server records it as `话轮` for diagnostics but does not compare it with the whole-session ID. Immediate duplicate starts and callbacks received before start, after response completion, or while the terminal has no active whole session return HTTP 200 with `ignored: true` and are not shown. If a previous response already produced content but its completion callback was lost, a later start closes that interrupted response and opens a new one instead of merging their text.

Start:

```http
POST /robot/model/response_monitor
```

```json
{
  "robotId": "4",
  "status": "1"
}
```

Each incremental fragment:

```http
POST /robot/model/Response/stream
```

```json
{
  "robotId": "4",
  "event": "RESPONSE_PARTIAL",
  "language": "CN",
  "content": "今天"
}
```

`content` is an incremental fragment, not the accumulated response. The transit server publishes each fragment to `GET /robot/events`, and the page appends it to the current assistant message. The server also maintains one bounded cumulative snapshot for each active model response. Opening or reconnecting the page during generation replaces the displayed content with this authoritative snapshot before later live fragments continue; completed or manually stopped responses do not retain an active snapshot.

The browser can only render the fragments it receives. For example, three requests containing `"您好"`, `"，我可以"`, and `"帮您。"` produce visible incremental updates. One request containing the complete sentence produces one page update and is not a real stream. The transit server does not split a complete response into artificial character-by-character updates.

Completion:

```http
POST /robot/model/response_monitor
```

```json
{
  "robotId": "4",
  "status": "0"
}
```

The start, incremental, and completion callbacks are associated through the current terminal and the active model-response state. They must still arrive in order while that terminal's whole voice session is active.

Sending only `POST /robot/model/Response/stream` is not sufficient. The voice service must first send `POST /robot/model/response_monitor` with `status: "1"`. The stream callback is deliberately ignored when the start callback is missing or the terminal has no active whole voice session.

Readable logs distinguish these cases explicitly:

```text
09:03:13.145 WARN  ⚠️ 回调忽略 | 终端=4 | 话轮=9c1ae54c | 原因=当前终端没有活动的整段会话
09:03:13.146 WARN  ⚠️ 回调忽略 | 终端=4 | 会话=b492d50e | 原因=未收到模型开始回调
```

Pretty logs print the exact `content` of every accepted HTTP increment as one `💬 回复+` line, followed by a compact fragment, character, and duration summary. The logger does not split one HTTP callback into artificial fragments. Set `LOG_FORMAT=json` to retain complete structured metadata such as full identifiers, direction, route, HTTP status, and trace ID.

ASR partial results continue to replace the current user transcript, but the page displays only the recognized text and no longer adds a persistent `正在识别：` prefix.

## Testing

Start the transit server with the voice service URL configured, then use the page microphone button to create an active whole session. Model callbacks do not need to copy that session ID:

```bash
curl -X POST http://localhost:4000/robot/model/response_monitor \
  -H "Content-Type: application/json" \
  -d '{"robotId":"4","status":"1"}'

curl -X POST http://localhost:4000/robot/model/Response/stream \
  -H "Content-Type: application/json" \
  -d '{"robotId":"4","event":"RESPONSE_PARTIAL","language":"CN","content":"您好，"}'

curl -X POST http://localhost:4000/robot/model/response_monitor \
  -H "Content-Type: application/json" \
  -d '{"robotId":"4","status":"0"}'
```

Open the page before sending callbacks so `GET /robot/events` can render the start, incremental text, and completion in real time.
