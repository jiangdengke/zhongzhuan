## 2026-06-24 - Task: formalize upstream streaming response interface
### What was done
- Formalized `POST /robot/listenQwen/stream` as an optional upstream SSE interface with `start`, `delta`, `done`, and `error` events.
- Reused command-priority behavior in the stream path so CMD and obvious flight queries do not request DeepSeek.
- Kept `/robot/listenQwen` as the compatible JSON response interface while documenting the stream interface for clients that need incremental model output.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for the touched application files.

### Notes
- `src/features/robot/application/command-session.js`: added shared in-memory command session and flight-detection helpers.
- `src/features/robot/application/listen-qwen.js`: switched to the shared command-priority helpers used by the normal JSON interface.
- `src/features/robot/application/listen-qwen-stream.js`: changed the stream protocol to `start -> delta -> done/error` and aligned CMD/flight behavior with the normal interface.
- `src/app-home/chat-api.js`: made the web console stream parser accept the formal `start` event while retaining backward compatibility with `meta`.
- `TRANSIT_SERVER_API.md`: documented `/robot/listenQwen/stream` as the optional upstream SSE interface.
- `UPSTREAM_TEST_GUIDE.md`: added curl and Python examples for the streaming interface.
- `ROBOT_INTERACTION_FLOW.md`: updated the end-to-end flow to include the optional streaming branch.
- Rollback: revert the commit that contains these files, or restore the previous `/robot/listenQwen/stream` behavior by changing the first SSE event back to `meta` and removing the stream-interface documentation sections.
