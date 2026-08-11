# Voice Session Integration

## Configuration

Set the voice-service and control-service HTTP base URLs on the transit server:

```env
ROBOT_CLIENT_BASE_URL=http://localhost:9000
ROBOT_CLIENT_TIMEOUT_MS=5000
CONTROL_SERVICE_BASE_URL=
CONTROL_SERVICE_TIMEOUT_MS=5000
ROBOT_ID=4
```

The `ROBOT_CLIENT_*` and `ROBOT_ID` names are retained for compatibility with the existing protocol. They identify the separately managed voice service and terminal; they do not mean that the voice service is the robot runtime.

If the base URLs are omitted, the native process defaults to `http://localhost:9000` for the voice service and `http://localhost:4001` for the control service. A blank `CONTROL_SERVICE_BASE_URL` also lets Docker Compose use its `http://host.docker.internal:4001` default; setting a non-empty value overrides the control-service target in both native and Compose runs. Both timeout values default to `5000` milliseconds and must be between `1` and `30000` milliseconds.

The voice service must therefore be reachable on port `9000`, and the control service must be reachable on port `4001`. Binding either dependency only to a specific LAN address does not guarantee that its `localhost` default will be reachable. If a dependency later runs on another host or in another container, replace its base URL with a reachable address.

The browser never calls either dependency directly. The transit server forwards both control requests so service addresses stay out of browser code and cross-origin restrictions do not apply.

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

The transit server generates a whole-session ID and forwards the existing request to the voice service unchanged:

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

For the same accepted click, the transit server also calls the control service:

```http
POST http://<control-service>:4001/robot/voiceSession/control
Content-Type: application/json; charset=utf-8
```

```json
{
  "status": "1"
}
```

The control-service body contains exactly the `status` field. It does not receive `robotId` or `sessionId`.

The two outbound requests are attempted concurrently for every accepted start or stop. The whole session becomes active or ended only after both dependencies succeed. The returned `sessionId` stays unchanged until the session ends.

The successful start response includes the authoritative `robotId` and `sessionId`; the page stores both synchronously for event scoping. While a whole session is active, each live, non-replayed `voice` SSE event with `status: "0"` starts one hidden 60-second inactivity window only when the `robotId` carried by the event matches that stored terminal ID. A later live `voice` event with `status: "1"`, a non-empty `asr_partial`, or any `final_input` cancels the pending timer only when the carried `robotId` matches. Explicitly non-matching terminal events cannot schedule or cancel this page's timer. If a contract-violating successful response omits `robotId`, the page keeps the returned session available for manual stop but disables event-driven waveform changes and automatic inactivity timing for that session. Replayed historical SSE events are ignored for inactivity timing because the event envelope explicitly marks them with `replayed: true`. The page does not display a numeric countdown.

If the window expires, the page sends the authoritative current whole-session ID through the same internal `POST /api/voice-session/control` stop path used by the microphone button. It never calls either downstream service directly. The existing synchronous request lock covers manual and timed stops, so a tap racing the timeout still produces at most one stop request.

If one or both dependencies fail, the page request returns HTTP `502` with one exact business error:

- Voice service only: `语音服务暂时不可用`
- Control service only: `控制服务暂时不可用`
- Both services: `语音服务和控制服务暂时不可用`

A failed start retains the generated whole-session ID for the next start attempt but does not expose that pending session to model callbacks, and a failed stop leaves the current session active. Retrying may resend both statuses because repeated voice and control statuses are idempotent. An automatic stop is attempted only once for the current whole session: if either downstream request fails, the page keeps the microphone active, shows the same service-specific error listed above, schedules no background retry, and waits for a manual stop retry.

The customer page uses the centered bottom microphone and the waveform beside the page heading as whole-session indicators. Both are blue before the session starts, change to green immediately after a successful start, and remain green until the user ends the whole session. While the whole session is active, non-ready voice, ASR, final-input, and model-progress events for the current terminal may change the waveform animation and status copy; events from another terminal cannot. After a successful stop, already rendered chat history remains visible. Delayed non-ready events cannot move the waveform from `ready`; ready-completion and error events may still restore `ready`. The conversation and bottom microphone areas remain transparent so the page background stays visible, while their reserved layout areas prevent the microphone from covering conversation messages.

The microphone remains touch-responsive while a start or stop request is pending. A repeated tap during that interval shows an immediate `请求处理中，请稍候` acknowledgment and interaction pulse, but a synchronous request lock prevents it from sending another control request. Android touch handling uses the normal click path with `touch-action: manipulation`; no parallel touch handler is registered, so one physical tap cannot produce duplicate start or stop calls.

On the second microphone click, the page sends the stored ID:

```json
{
  "sessionId": "session-<uuid>",
  "status": "0"
}
```

The transit server sends the same whole-session ID to the voice service with `status: "0"` and sends exactly `{ "status": "0" }` to the control service. It injects the configured `ROBOT_ID` only into the voice-service request. After both stop requests succeed, it marks that voice session closed and clears its active model-response accumulator and snapshot. The page records the ended session, clears its authoritative session ID and React session state, returns the voice assistant to `ready`, and keeps existing messages visible. A timed stop additionally shows exactly `长时间未检测到输入，会话已自动结束`.

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

Start the transit server with both dependency URLs configured, then use the page microphone button to create an active whole session. Model callbacks do not need to copy that session ID:

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
