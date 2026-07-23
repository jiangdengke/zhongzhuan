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

## 2026-07-22 - Task: add BOARDING_GATE command
### What was done
- Added the `BOARDING_GATE` command and parsed its JSON-string parameter `gateNo`.
- Returned the fixed TTS text `正在为您查询{gateNo}登机口，请稍等。` for valid commands, with existing invalid-parameter handling for malformed input.
- Reused the existing command path for both JSON and SSE endpoints, so the command does not request DeepSeek.
- Updated the protocol, upstream test, and request example documents with JSON and streaming examples.

### Testing
- JSON endpoint returned `正在为您查询401登机口，请稍等。` for `BOARDING_GATE + {"gateNo":"401"}`.
- JSON endpoint returned the existing parameter error for a missing `gateNo`.
- SSE endpoint returned `start -> delta -> done`; both stream assertions and the fixed reply passed.
- Server logs confirmed the command fixed-reply path without a DeepSeek request.
- `npm run build` passed.
- IDE diagnostics reported no errors for the touched application files.

### Notes
- `src/features/robot/domain/constants.js`: added the `BOARDING_GATE` function constant.
- `src/features/robot/application/command-replies.js`: added gate parameter parsing and fixed reply generation.
- `src/app-home/robot-console-page.js`: rendered upstream boarding-gate commands as natural-language input.
- `TRANSIT_SERVER_API.md`: documented the function and payload example.
- `UPSTREAM_TEST_GUIDE.md`: added JSON and SSE test commands and acceptance coverage.
- `REQUEST_EXAMPLES.md`: added a JSON endpoint request example.
- `progress.md`: appended this implementation and verification note.
- Rollback: revert the changes in the listed source and documentation files; existing commands and stream protocol remain unchanged.

## 2026-07-22 - Task: add an interactive digital avatar
### What was done
- Added a lightweight 2D airport service avatar to the customer-facing chat page without introducing model or animation dependencies.
- Gave the avatar idle floating, breathing, blinking, and shadow animations, plus a click-triggered wave, hop, and temporary greeting bubble.
- Added responsive placement so the avatar moves above the composer on narrower screens and does not cover the input controls.
- Added accessible button labeling, keyboard focus feedback, timer cleanup, and reduced-motion support.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for the avatar and chat page files.
- `git diff --check` passed.
- Browser checks passed at 500px and 390px widths; the avatar does not overlap the quick prompts or composer.
- Click interaction showed the greeting bubble and interaction state, then dismissed the bubble after about 2.8 seconds.
- The 390px greeting bubble remained fully inside the viewport, and the page showed no runtime error overlay.

### Notes
- `src/app-home/digital-avatar.js`: added the SVG service avatar, interaction state, greeting timer, responsive placement, and animations.
- `src/app-home/robot-console-page.js`: mounted the digital avatar without changing chat or streaming behavior.
- `progress.md`: appended this implementation and verification note.
- `.trellis/tasks/07-22-interactive-digital-avatar/prd.md`: recorded the selected lightweight 2D design and acceptance criteria.
- Rollback: remove the `DigitalAvatar` import and render call, then delete `src/app-home/digital-avatar.js`.

## 2026-07-23 - Task: generalize intelligent service branding
### What was done
- Removed airport-specific wording from the customer-facing page, metadata, quick prompts, digital-avatar label, and representative protocol examples.
- Kept existing flight, weather, location, boarding-gate, and streaming protocol behavior unchanged.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for the edited UI files.
- `git diff --check` passed.
- Repository search confirmed that remaining airport-specific wording exists only in historical progress notes.

### Notes
- `app/layout.js`: changed the page title and description to generic intelligent-service wording.
- `src/app-home/robot-console-page.js`: changed the welcome, header, and service description copy.
- `src/app-home/digital-avatar.js`: changed the accessible SVG title to a generic service attendant label.
- `src/app-home/examples.js`: replaced the location-specific quick prompt with a generic service-flow prompt.
- `TRANSIT_SERVER_API.md`: changed the representative response to generic intelligent-service wording.
- `ROBOT_INTERACTION_FLOW.md`: changed the representative response to generic intelligent-service wording.
- `.trellis/tasks/07-22-interactive-digital-avatar/prd.md`: aligned the task description with the generic service positioning.
- `progress.md`: recorded this branding update and verification.
- Rollback: restore the previous copy in the listed files; protocol implementation and command handling do not need rollback.
