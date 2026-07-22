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

## 2026-06-25 - Task: show upstream stream responses in the web console
### What was done
- Mirrored `/robot/listenQwen/stream` processing into the browser event channel so upstream stream calls appear in the left chat area as live incremental output.
- Kept web-console-originated `web-chat-*` sessions from being duplicated by the upstream mirror while preserving the monitor feed.
- Documented that opening the web console while calling the stream endpoint shows `delta` output live in the chat area.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for the touched application files.

### Notes
- `src/features/robot/application/listen-qwen-stream.js`: publishes stream lifecycle events to the page event bus while returning SSE to the upstream caller.
- `src/app-home/robot-console-page.js`: ignores mirrored `web-chat-*` sessions in the left chat to avoid duplicate local debug messages.
- `UPSTREAM_TEST_GUIDE.md`: notes that `/robot/listenQwen/stream` can be watched live in the web console.
- `progress.md`: appended this implementation and verification note.
- Rollback: revert this entry's file changes, or remove the stream-path `publishRobotEvent` calls and the `web-chat-*` duplicate filter.

## 2026-07-22 - Task: make the home page customer-facing
### What was done
- Reduced the home page to a single customer-facing chat surface and removed the visible request inspector, JSON payload, trace fields, and upstream event feed.
- Refreshed the visual hierarchy with a service-oriented header, online status, accessible message labels, calmer colors, responsive spacing, and customer-facing copy.
- Preserved the existing local SSE chat flow and upstream event subscription so both local and upstream stream responses continue appearing in the left chat area.
- Updated the browser metadata to describe the customer-facing airport service assistant.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for the touched application files.

### Notes
- `src/app-home/robot-console-page.js`: removed customer-visible debug UI and related state, then added the single-column customer chat presentation.
- `app/layout.js`: updated the page title and description for the customer-facing assistant.
- `progress.md`: appended this implementation and verification note.
- `.trellis/tasks/07-22-customer-facing-chat-ui/prd.md`: recorded scope and acceptance criteria for this task.
- Rollback: restore the previous `robot-console-page.js` and `app/layout.js` versions; backend streaming and `/robot/events` behavior are unchanged.
