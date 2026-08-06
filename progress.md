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

## 2026-07-24 - Task: replace text composer with voice waveform
### What was done
- Removed the customer-facing quick prompts, textarea, send button, keyboard hint, and their local submission and error state.
- Added a display-only, accessible voice status region with distinct ready, listening, and processing copy and waveform animation driven by the existing robot events.
- Preserved upstream transcript updates, command priority, streaming response rendering, and the existing digital avatar while sizing the new lower status area for desktop and mobile layouts.
- Added a reduced-motion fallback without requesting microphone permission or adding recording interactions.

### Testing
- `npm run build` passed, including the production compile, lint, type validity, and static page generation steps.
- `git diff --check` passed.
- IDE diagnostics reported no errors for `src/app-home/robot-console-page.js`.
- Browser visual checks were not run; desktop and narrow-mobile appearance and avatar clearance remain a manual visual-verification gap.

### Notes
- `src/app-home/robot-console-page.js`: removed the text interaction flow and added event-driven voice status state, semantic waveform markup, responsive styling, and reduced-motion handling.
- `progress.md`: recorded the implementation, verification evidence, visual-check gap, and rollback point.
- Rollback: before making additional edits, run `git restore --source=HEAD -- src/app-home/robot-console-page.js progress.md` to restore both files to their pre-task state.

## 2026-07-24 - Task: verify voice waveform presentation
### What was done
- Completed browser verification of the voice-first page at desktop and 390px mobile widths.
- Confirmed the page now presents only the event-driven voice waveform in the lower interaction area, with no text input controls.
- Confirmed the waveform and digital avatar remain visually separated across both tested viewport sizes.

### Testing
- Browser DOM check confirmed no textarea, composer, send button, or quick-prompt controls remain.
- Browser event check confirmed `voice status="1"` shows `正在聆听`, `voice status="0"` shows `正在思考`, and a robot error returns `随时为您服务`.
- Desktop viewport check passed at 1440px; mobile viewport check passed at 390px.
- `npm run build` passed.
- `git diff --check` passed.
- IDE diagnostics reported no errors for `src/app-home/robot-console-page.js`.

### Notes
- `src/app-home/robot-console-page.js`: browser-verified the event-driven waveform, responsive layout, and avatar clearance.
- `.trellis/tasks/07-24-voice-assistant-waveform/prd.md`: marked the acceptance criteria complete.
- `progress.md`: appended final visual verification evidence.
- Rollback: restore the pre-task page and remove the waveform task entries from `progress.md`; no backend rollback is required.

## 2026-07-24 - Task: replace digital avatar with interactive voice control
### What was done
- Replaced the digital avatar with a compact microphone-style voice assistant control.
- Added breathing halo, listening/processing color states, sound-wave motion, and click feedback that briefly shows `语音助手已唤醒`.
- Kept the control display-only: it does not request microphone permission or start recording.

### Testing
- `npm run build` passed.
- IDE diagnostics reported no errors for `src/app-home/robot-console-page.js`.
- `git diff --check` passed.
- Existing upstream voice-state waveform behavior remains unchanged.
- Browser checks passed at 1440px desktop and 390px mobile widths; the control does not overlap the waveform area.
- Click verification showed `语音助手已唤醒`, restarted the interaction animation, and dismissed the feedback after about 2.4 seconds.
- Browser DOM verification confirmed the digital avatar is no longer rendered and no runtime error overlay is present.

### Notes
- `src/app-home/robot-console-page.js`: removed the digital-avatar mount and added the interactive microphone control.
- `src/app-home/digital-avatar.js`: removed because the customer-facing page no longer uses the digital avatar.
- `progress.md`: recorded the replacement scope and current verification state.
- `.trellis/tasks/07-24-voice-assistant-waveform/prd.md`: added the selected visual-only interaction requirement.
- Rollback: restore `src/app-home/digital-avatar.js`, restore its import/render in `robot-console-page.js`, and remove the microphone-control styles and state from that page.

## 2026-07-24 - Task: correct floating voice control placement and wake state
### What was done
- Moved the desktop floating control closer to the chat card, leaving an approximately 15px button-to-card gap at a 1440px viewport while preserving the existing mobile overrides.
- Replaced temporary timer-based feedback with a page-lifetime awake state that keeps `语音助手已唤醒` and `已唤醒` visible after the first click.
- Kept the local awake state independent from upstream ready, listening, and processing states, and added a separately keyed click pulse so the persistent breathing halo remains visible.
- Preserved the semantic button and live status feedback, with reduced-motion coverage for the click pulse.

### Testing
- `npm run build` passed, including production compilation, linting, type validation, and static page generation.
- `git diff --check` passed.
- IDE diagnostics reported no errors for `src/app-home/robot-console-page.js`.
- Browser visual verification was intentionally left for the parent agent.

### Notes
- `src/app-home/robot-console-page.js`: corrected desktop placement and implemented persistent awake feedback with a separate replayable pulse.
- `progress.md`: appended this correction and its verification evidence.
- Rollback point: reverse only this correction to the state documented by the immediately preceding `replace digital avatar with interactive voice control` entry; keep the active task's waveform implementation and intentional `digital-avatar.js` deletion unchanged.

## 2026-07-24 - Task: verify persistent voice-control wake state
### What was done
- Completed desktop and mobile browser verification after correcting the floating control placement and wake behavior.
- Confirmed the voice control remains visibly awake after the click animation finishes and can replay its pulse on later clicks.

### Testing
- At 1440px, the button starts 15px beyond the chat card edge and does not overlap the lower waveform area.
- At 390px, the button remains above the lower waveform area with no overlap.
- After waiting more than three seconds, the control still displays `语音助手已唤醒` and `已唤醒`.
- Browser DOM checks reported no runtime error overlay.
- `npm run build` passed.
- `git diff --check` passed.
- IDE diagnostics reported no errors for `src/app-home/robot-console-page.js`.

### Notes
- `src/app-home/robot-console-page.js`: browser-verified the corrected placement, persistent awake state, and replayable pulse behavior.
- `progress.md`: appended final browser verification evidence for the correction.
- Rollback: restore the placement and temporary-feedback behavior documented before the correction; no backend rollback is required.

## 2026-07-29 - Task: isolate Next.js development build artifacts
### What was done
- Traced `TypeError: a[d] is not a function` to a five-day-old development server whose in-memory Webpack module table no longer matched files rewritten in `.next` by a production build.
- Added phase-aware Next.js configuration so `next dev` writes to `.next-dev` while `next build` and `next start` continue using `.next`.
- Ignored the development artifact directory and documented clean startup, production verification, symptoms, and recovery steps.

### Testing
- A clean development server returned HTTP 200 and created `.next-dev`.
- `npm run build` passed while that development server remained active.
- The same development server still returned HTTP 200 after the production build completed.
- A concurrent production server started from `.next` and returned HTTP 200 on port 4100.
- IDE diagnostics reported no errors for `next.config.js`.
- `git diff --check` passed.

### Notes
- `next.config.js`: selects a separate development artifact directory using Next.js's development-server phase constant.
- `.gitignore`: excludes `.next-dev` from version control.
- `docs/DEVELOPMENT.md`: records the artifact-isolation rationale and generated-chunk recovery procedure.
- `progress.md`: records the root cause, structural fix, and concurrent verification evidence.
- Rollback: stop all Next.js processes, remove the phase-aware `distDir` configuration and `.next-dev` ignore entry, then restart development from the default `.next` directory. Do not run `next build` concurrently after rollback.

## 2026-08-04 - Task: integrate whole voice sessions and Qwen streaming callbacks
### What was done
- Turned the page microphone into a two-click whole-session control. The backend generates one session ID, forwards start and stop to the configured robot client, and preserves rendered messages after stop.
- Added strict Qwen model start, incremental fragment, and completion callbacks without invoking DeepSeek.
- Serialized per-robot controls, retained pending IDs across ambiguous failures, bound callbacks to the current whole session, and ignored duplicate, out-of-order, unknown, ended, and late callbacks.
- Added bounded active-response snapshots so opening or reconnecting the page during a long stream restores all accumulated text even when more than 100 events were missed.
- Added JSON media-type, request-size, content-size, same-origin browser-control, robot-ID, robot-client URL, and timeout validation.

### Testing
- `npm run build` passed with all three new routes present.
- `git diff --check` passed.
- A delayed mock robot client confirmed two concurrent starts forwarded the same session ID and stop reused it.
- Focused integration checks passed for strict start/delta/done order, duplicate start, pre-start and post-done deltas, unknown and ended sessions, JSON media type, cross-origin control, and content limits.
- A 120-fragment test recovered the complete active response through an SSE snapshot despite exceeding the 100-event replay buffer.
- Stale stop requests return idempotent success while a later session remains active, and that later session can still stop normally.
- A focused lost-completion check confirmed immediate duplicate starts reuse one response ID, while a new start after content replaces the orphaned response instead of merging output.
- Independent final review reported no actionable findings in the hardened protocol and snapshot paths.

### Notes
- The whole-session ID is generated by this backend and remains separate from each ASR utterance ID.
- `POST /robot/model/Response/stream` intentionally retains the uppercase `R` required by the latest integration document.
- Robot callbacks are intended for the documented internal network and remain unauthenticated; browser control is same-origin only.
- Rollback: remove the new control/model callback routes, robot-client integration and response snapshot events, then restore the page microphone to visual-only state. Legacy ASR and DeepSeek routes remain independent.

## 2026-08-04 - Task: align same-server robot deployment configuration
### What was done
- Added the robot client address, timeout, and robot ID to the active local environment configuration.
- Changed the robot client address and application fallback to `http://localhost:9000` for the confirmed same-host deployment.
- Made both development and production start commands explicitly listen on `0.0.0.0:4000` so the robot client can call the transit service through a reachable server address.
- Documented the separate listener requirements: the transit service listens on all interfaces, while the robot client must accept connections through the local loopback address for `localhost:9000` to work.

### Testing
- `npm run build` passed, including production compilation, linting, type validation, and static page generation.
- `npm run start` reported `Network: http://0.0.0.0:4000`.
- `lsof -nP -iTCP:4000 -sTCP:LISTEN` confirmed `TCP *:4000 (LISTEN)`.
- `curl http://127.0.0.1:4000/` returned HTTP 200.
- `git diff --check` passed, IDE diagnostics reported no errors, and `git status --ignored` confirmed `.env` remains ignored.

### Notes
- `.env`: added the local robot-client runtime settings without changing existing model credentials.
- `.env.example`: changed the documented robot-client address to `http://localhost:9000`.
- `package.json`: explicitly bound `next dev` and `next start` to `0.0.0.0:4000`.
- `src/integrations/robot-client/config.js`: aligned the fallback robot-client URL with the same-server deployment.
- `docs/DEVELOPMENT.md`: documented the all-interface transit-service listener.
- `docs/ROBOT_VOICE_SESSION.md`: documented loopback and container-network requirements for the robot client.
- `.trellis/tasks/08-04-robot-voice-session-integration/task.json`: expanded the active task scope to include runtime and deployment configuration.
- `progress.md`: recorded the deployment change and verification evidence.
- Rollback point: restore the values immediately before this entry—remove the three added `ROBOT_*` lines from `.env`, change the example and fallback URL back to `http://192.168.50.85:9000`, and remove `--hostname 0.0.0.0` from both package scripts; then remove the two deployment paragraphs added to the documentation.

## 2026-08-04 - Task: add standalone Docker Compose deployment
### What was done
- Added a multi-stage, non-root production image and a Compose service that publishes the transit application on host port `4000`.
- Kept the separately managed robot client outside Compose and routed container requests to the host's port `9000` through `host.docker.internal` with the Linux `host-gateway` mapping.
- Added a health check, restart policy, persistent named log volume, and build-context exclusions that prevent `.env`, local artifacts, and development tooling from entering the image.
- Upgraded Next.js from `15.5.18` to patched version `15.5.21` after the image build exposed framework security advisories.
- Documented start, stop, health, host-network requirements, connectivity diagnostics, and the remaining production dependency audit risk.

### Testing
- `docker compose config` passed.
- `docker compose build` produced the `zhongzhauan:latest` image and completed the Next.js production build inside the image.
- `docker compose up -d` reached `healthy` with `0.0.0.0:4000->4000/tcp` published.
- The container returned HTTP 200 and forwarded both start and stop controls to a host mock on `0.0.0.0:9000` through `host.docker.internal`, preserving the same whole-session ID.
- The runtime used Next.js `15.5.21`, ran as non-root user `nextjs`, and could write to the named log volume.
- `git diff --check` passed and IDE diagnostics reported no Docker-file diagnostics.
- `npm audit --omit=dev` still reports three high-severity advisories in Next.js transitive `postcss` and `sharp` dependencies; npm's available remediation requires the breaking Next.js `16.3.0` upgrade and was intentionally not applied.

### Notes
- `.dockerignore`: excludes secrets, dependency trees, generated builds, logs, local tooling, and repository metadata from the build context.
- `Dockerfile`: builds the application in stages and runs the production server as an unprivileged user.
- `docker-compose.yml`: publishes port `4000`, injects the host robot-client address, persists logs, and defines health/restart behavior.
- `package.json`: raises the minimum Next.js version to patched `15.5.21` while retaining the existing major version.
- `package-lock.json`: locks the patched Next.js dependency graph used by local and container builds.
- `docs/DOCKER_DEPLOYMENT.md`: documents the supported host-service topology, commands, diagnostics, and dependency security status.
- `.trellis/tasks/08-04-robot-voice-session-integration/task.json`: expands task scope to include Docker deployment assets and documentation.
- `progress.md`: records the container implementation, verification evidence, residual audit risk, and rollback point.
- Rollback: run `docker compose down`, remove `.dockerignore`, `Dockerfile`, `docker-compose.yml`, and `docs/DOCKER_DEPLOYMENT.md`, then restore `package.json` and `package-lock.json` to the versions before this entry. The native `npm run dev` and `npm run start` deployment remains available.

## 2026-08-04 - Task: bound Docker logs and document host firewall access
### What was done
- Replaced duplicate application file logging and the persistent log volume with Docker stdout logging capped at five 10 MB files.
- Added Linux firewall guidance that permits only the Compose bridge subnet to reach the separately managed host robot client on TCP port `9000`.

### Testing
- `docker compose config` passed with `LOG_FILE_ENABLED=false` and bounded `json-file` logging.
- The recreated service reached `healthy` and retained the `0.0.0.0:4000` port publication.
- Container inspection confirmed `max-size=10m`, `max-file=5`, and disabled application file logging.
- Start and stop controls still reached the host mock through `host.docker.internal:9000` with one shared session ID.
- `git diff --check` passed.

### Notes
- `docker-compose.yml`: disables duplicate file logs and configures bounded Docker log retention.
- `docs/DOCKER_DEPLOYMENT.md`: replaces named-volume instructions with stdout logging behavior and adds source-scoped firewall guidance for host port `9000`.
- `progress.md`: records the Docker operations hardening and supersedes the earlier named-log-volume description.
- Rollback: restore the named `transit-logs:/app/logs` volume, remove the Compose `logging` block and `LOG_FILE_ENABLED=false`, then remove the firewall and bounded-logging paragraphs added to the Docker deployment guide.

## 2026-08-04 - Task: retain bounded application logs across container recreation
### What was done
- Restored the named application log volume and added automatic deletion of managed log files older than the configured retention period.
- Configured the container for daily 5 MB application logs with two backups and seven-day retention, while retaining the separate bounded Docker stdout logs.
- Updated the deployment guide to distinguish container-log retention from persistent application-log retention.

### Testing
- `npm run build` passed with Next.js `15.5.21`.
- The rebuilt Compose service reached `healthy` and continued publishing `0.0.0.0:4000`.
- An artificially expired log file was deleted on the next application log write, while the current daily log remained.
- The current application log survived a forced container recreation through the named volume.
- Final start and stop controls reached the host mock through `host.docker.internal:9000` with a shared session ID.
- `docker compose config --quiet`, `git diff --check`, IDE diagnostics, and final read-only deployment review all passed.

### Notes
- `src/shared/logging/logger.js`: adds once-daily retention pruning for managed `.log` files and rotated backups.
- `.env.example`: documents `LOG_FILE_RETENTION_DAYS` with a seven-day default.
- `docker-compose.yml`: persists bounded application logs while retaining bounded Docker stdout logs.
- `docs/DOCKER_DEPLOYMENT.md`: documents both log destinations, retention limits, and volume cleanup behavior.
- `.trellis/tasks/08-04-robot-voice-session-integration/task.json`: expands task scope to include the shared logger retention implementation.
- `progress.md`: records the persistent-log correction and supersedes the preceding stdout-only log lifecycle.
- Rollback: remove `LOG_FILE_RETENTION_DAYS` and retention pruning, remove the named log volume and file-log environment overrides from Compose, and restore the stdout-only logging description from the immediately preceding entry.

## 2026-08-04 - Task: fix voice control behind request-rewriting proxies
### What was done
- Removed the redundant Origin and Fetch Metadata rejection that treated legitimate microphone clicks as cross-origin when an IDE or reverse proxy rewrote backend request metadata.
- Retained browser cross-origin protection through the endpoint's required JSON media type and absent CORS authorization, while continuing to reject simple form submissions before voice-session handling.
- Documented the supported reverse-proxy behavior and the requirement not to add permissive CORS headers to the browser control endpoint.

### Testing
- Reproduced the original 403 response for a legitimate request whose public Origin differed from the backend request URL.
- Verified proxied start and stop controls both returned HTTP 200, reached a temporary robot-client mock on port `9000`, and preserved one whole-session ID.
- Verified cross-origin OPTIONS returned no `Access-Control-Allow-Origin` header and a form-encoded POST returned HTTP 415.
- `npm run build`, `git diff --check`, IDE diagnostics, and focused read-only security review all passed.

### Notes
- `app/api/voice-session/control/route.js`: removes the proxy-sensitive duplicate same-origin check while retaining strict bounded JSON parsing and payload validation.
- `docs/ROBOT_VOICE_SESSION.md`: explains the JSON and CORS boundary for browser voice control.
- `docs/DOCKER_DEPLOYMENT.md`: documents reverse-proxy compatibility and warns against permissive CORS configuration.
- `progress.md`: records the root cause, security rationale, verification evidence, and rollback point.
- Rollback: restore `isSameOriginBrowserRequest` and its early 403 response in the browser control route, then remove the new proxy/CORS documentation; this also restores the original false rejection behind request-rewriting proxies.

## 2026-08-04 - Task: standardize the Compose container name
### What was done
- Fixed the Compose container name and local image name to `zhongzhuan` instead of relying on the generated project-service suffix or the previous misspelled image name.
- Documented the names operators should see after rebuilding the service.

### Testing
- `docker compose config --quiet` passed.
- Parsed Compose output confirmed container `zhongzhuan`, image `zhongzhuan:latest`, and host port `4000` mapped to container port `4000`.
- Repository search confirmed the obsolete cross-origin error text is no longer present.
- `git diff --check` passed.

### Notes
- `docker-compose.yml`: sets the fixed container and image names to `zhongzhuan`.
- `docs/DOCKER_DEPLOYMENT.md`: documents the expected Compose container and image names.
- `progress.md`: records the naming change, verification evidence, and rollback point.
- Rollback: remove `container_name`, restore the previous image name, and remove the container-name sentence from the deployment guide.

## 2026-08-04 - Task: make application logs readable with status emojis
### What was done
- Changed pretty application logs to use Chinese module names, Chinese field labels, pipe-separated fields, and one status emoji per line.
- Added readable mappings for voice-session, voice-monitor, upstream voice, DeepSeek, and model-callback events while preserving the internal event keys.
- Shortened session identifiers for logs only; IDs sent to the robot client remain unchanged.
- Added robot-client request timing, target URL, HTTP status, timeout classification, and low-level network code/address details to failure logs.

### Testing
- Previewed successful, outgoing, and connection-refused log lines with `LOG_FILE_ENABLED=false`; output matched the approved one-line Chinese format.
- `npm run build` passed with Next.js `15.5.21`.
- `git diff --check` passed.

### Notes
- `src/shared/logging/logger.js`: adds readable scope/message/field mappings, emoji status labels, Chinese boolean/mode values, shortened IDs, and network-error formatting.
- `src/integrations/robot-client/client.js`: measures control-request duration, exposes the control target for logging, and enriches fetch failures with underlying network properties.
- `src/features/robot/application/voice-session.js`: logs robot control start, success, and failure details for both whole-session start and stop operations.
- `docs/DOCKER_DEPLOYMENT.md`: documents the readable format and `docker logs --tail 100 -f zhongzhuan` command.
- Rollback: restore the three source files and remove the readable-log section from the Docker deployment guide and this progress entry.

## 2026-08-04 - Task: close robot control responses without resetting connections
### What was done
- Changed robot control response handling from actively cancelling the response body to consuming it normally before completing the request.
- Preserved existing HTTP status validation and enriched network-error diagnostics.
- Documented the connection-close compatibility behavior for the separately managed Python robot service.

### Testing
- `npm run build` passed after the response handling change.
- `git diff --check` passed.
- A local refused-connection check continued to expose `ECONNREFUSED`, target address, port, elapsed time, and timeout configuration.
- The robot client now reads successful response bodies with `response.text()` instead of calling `response.body.cancel()`.

### Notes
- `src/integrations/robot-client/client.js`: consumes the robot control response body before status handling completes.
- `docs/DOCKER_DEPLOYMENT.md`: documents why normal response consumption is required for the Python control service connection lifecycle.
- `progress.md`: records the connection-reset fix and verification evidence.
- Rollback: restore `response.body?.cancel()` in the robot control client and remove the related deployment note; this would reintroduce the previous connection-reset risk.

## 2026-08-04 - Task: trace the voice-service model callback chain
### What was done
- Added directional, business-readable logs across page control, transit processing, voice-service callbacks, model-response accumulation, and browser SSE delivery.
- Distinguished whole-session IDs from per-utterance ASR IDs and made ignored model callbacks report whether the session was wrong, the start callback was missing, the content was empty, the response was duplicated, or the response was cleaned up.
- Sampled high-frequency model increments while preserving every SSE fragment, and added connection, replay, snapshot, disconnect, and listener-failure visibility for the page event stream.
- Removed the persistent `正在识别：` prefix from ASR transcript messages and prevented ASR partial events alone from forcing the page into the listening state.
- Updated operator and integration documentation to describe the separately managed dependency as the voice service while retaining existing protocol paths and compatibility environment names.

### Testing
- `npm run build` passed with all application routes compiled, linted, and type-checked by Next.js.
- A local voice-service mock received matching start and stop controls with one transit-generated whole-session ID.
- A live callback test verified `response_monitor status=1 -> Response/stream delta* -> response_monitor status=0`, received `model_response_start`, two `model_response_delta`, and `model_response_done` SSE events, and preserved both text fragments.
- Negative callback tests returned HTTP 200 with `ignored: true` and logged explicit reasons for a per-utterance ID used as the whole-session ID and for a stream fragment received before the start callback.
- A live `ASR_PARTIAL` callback returned HTTP 200 and logged one concise line with `话轮`, recognized content, and duration; repository search confirmed the `正在识别：` prefix is no longer present in source code.
- `git diff --check` and IDE diagnostics passed after the final changes.

### Notes
- `app/api/voice-session/control/route.js`: records the page request and the final transit response with direction, action, whole-session ID, HTTP status, result, and duration.
- `app/robot/events/route.js`: records SSE connections, replay counts, active snapshots, and disconnect duration.
- `app/robot/model/Response/stream/route.js`: records invalid or rejected stream responses without duplicating every successful model fragment log.
- `app/robot/model/response_monitor/route.js`: records model start/end callback receipt and the result returned to the voice service.
- `app/robot/voiceMonitor/route.js`: records the result returned for voice status callbacks.
- `docs/DOCKER_DEPLOYMENT.md`: documents the voice-service role, directional log examples, and callback diagnostics.
- `docs/ROBOT_VOICE_SESSION.md`: documents the mandatory three-phase model callback order, whole-session requirement, ignore reasons, log sampling, and ASR display behavior.
- `src/app-home/robot-console-page.js`: displays only recognized ASR text and no longer changes assistant state solely because an ASR partial arrived.
- `src/features/robot/application/listen-qwen.js`: labels ASR IDs as per-utterance turns and removes duplicate request logging for each partial result.
- `src/features/robot/application/model-response.js`: logs accepted, ignored, interrupted, expired, and completed model callback states with whole-session and response summaries.
- `src/features/robot/application/robot-events.js`: records sampled event publication and listener failures while exposing current listener status to the SSE route.
- `src/features/robot/application/voice-monitor.js`: records incoming voice-service status callbacks with the correct service role.
- `src/features/robot/application/voice-session.js`: records session creation/reuse, outbound voice control, voice-service acceptance, internal state transitions, conflicts, and repeated controls.
- `src/integrations/robot-client/client.js`: changes the non-success HTTP error wording from robot client to voice service without changing the compatibility module API.
- `src/shared/logging/logger.js`: adds directional scope formatting, Chinese business field names, warning support, duration formatting, and model/SSE event labels.
- `progress.md`: records the implementation, runtime evidence, file scope, and rollback point for this task.
- Rollback: preserve later edits, then run `git restore --source=853baf3 -- app/api/voice-session/control/route.js app/robot/events/route.js app/robot/model/Response/stream/route.js app/robot/model/response_monitor/route.js app/robot/voiceMonitor/route.js docs/DOCKER_DEPLOYMENT.md docs/ROBOT_VOICE_SESSION.md src/app-home/robot-console-page.js src/features/robot/application/listen-qwen.js src/features/robot/application/model-response.js src/features/robot/application/robot-events.js src/features/robot/application/voice-monitor.js src/features/robot/application/voice-session.js src/integrations/robot-client/client.js src/shared/logging/logger.js progress.md`.

## 2026-08-04 - Task: associate model callbacks without a returned whole-session ID
### What was done
- Made `sessionId` optional on both voice-service model callback endpoints and stopped comparing a voice-service callback ID with the transit-generated whole-session ID.
- Associated model start, incremental, and completion callbacks with the terminal's current whole session through `robotId`; an optional voice-service `sessionId` is retained only as the model turn ID for diagnostics.
- Preserved real incremental page delivery without fabricating character-by-character output when the voice service sends one complete response in a single stream request.
- Updated integration and deployment documentation with the new callback contract and a clear explanation of why one HTTP fragment produces one page update.

### Testing
- `npm run build` passed with the updated optional-session callback validation and association logic.
- A live callback sequence with no `sessionId` completed successfully and delivered two distinct `model_response_delta` events through SSE.
- A second callback sequence carrying a voice-service-local ID completed successfully; responses contained the active whole-session ID and retained the supplied local ID as `turnId`.
- The two live sequences produced three model delta events, two completion events, and all expected text fragments in the SSE stream.
- A callback sent after ending the whole voice session returned HTTP 200 with `ignored: true` and logged `当前终端没有活动的整段会话`.
- `git diff --check` and IDE diagnostics passed for the callback implementation and routes.

### Notes
- `app/robot/model/Response/stream/route.js`: distinguishes the internally resolved whole-session ID from an optional voice-service turn ID in error logs.
- `app/robot/model/response_monitor/route.js`: labels an incoming optional `sessionId` as the voice-service turn and logs the internally resolved whole session separately.
- `docs/DOCKER_DEPLOYMENT.md`: documents terminal-based callback association and the optional diagnostic turn ID.
- `docs/ROBOT_VOICE_SESSION.md`: removes callback whole-session requirements, updates request examples, and explains real versus artificial streaming.
- `src/features/robot/application/model-response.js`: resolves the active whole session by `robotId`, accepts missing or local callback IDs, and propagates the optional turn ID through model events and snapshots.
- `progress.md`: records the revised protocol behavior, runtime evidence, file scope, and rollback point.
- Rollback: run `git restore --source=49b4076 -- app/robot/model/Response/stream/route.js app/robot/model/response_monitor/route.js docs/DOCKER_DEPLOYMENT.md docs/ROBOT_VOICE_SESSION.md src/features/robot/application/model-response.js progress.md`; this restores strict whole-session matching and makes callback `sessionId` mandatory again.

## 2026-08-04 - Task: simplify voice-chain operational logs
### What was done
- Replaced verbose pretty-mode success records with compact business events for voice-session start/end, ASR text, each real model fragment, and reply completion summaries.
- Preserved exact ASR and model-fragment content; both voice-service model callbacks and transit-side DeepSeek streams now use the same `识别`, `回复+`, and `回复完成` vocabulary.
- Kept warning and error diagnostics concise but actionable, with eight-character identifiers and relevant terminal, turn, HTTP, timing, network, and trace fields.
- Suppressed repeated pretty-mode transport and page-push success records while leaving JSON mode structurally complete for detailed diagnosis.
- Updated integration and deployment documentation with the new output format and the one-upstream-fragment-to-one-log-line rule.

### Testing
- `npm run build` passed with all application routes compiled, linted, and type-checked.
- `git diff --check` passed.
- IDE diagnostics reported no issues in the changed JavaScript files.
- A direct pretty-mode preview produced the expected compact session, ASR, two model-fragment, completion, warning, and voice-service failure lines.
- A JSON-mode preview retained full direction, route, trace ID, whole-session ID, turn ID, terminal ID, and model content values.

### Notes
- `src/shared/logging/logger.js`: owns compact pretty formatting, duplicate success suppression, diagnostic field selection, and eight-character display IDs; JSON records remain unabridged.
- `src/features/robot/application/listen-qwen.js`: includes the complete ASR text in its structured recognition record.
- `src/features/robot/application/model-response.js`: logs every accepted voice-service HTTP model fragment with its exact content instead of sampling progress.
- `src/features/robot/application/voice-session.js`: records whole-session duration for the compact stop summary.
- `src/integrations/deepseek/client.js`: emits the same compact fragment stream for transit-side DeepSeek replies and promotes missing credentials to a warning.
- `docs/DOCKER_DEPLOYMENT.md` and `docs/ROBOT_VOICE_SESSION.md`: document compact logs, full JSON mode, and real streaming semantics.
- Rollback: restore the changed source and documentation files listed above together with this progress entry; doing so restores verbose pretty logs and sampled model-fragment logging.

## 2026-08-05 - Task: package the customer page as an Android APK shell
### What was done
- Added an isolated Capacitor 8 Android project under `android-app/` with application ID `com.zhongzhauan.voiceassistant` and application name `智能服务`.
- Configured the Android WebView shell to load `http://192.168.11.205:4000` and explicitly permitted cleartext traffic for this trusted internal-network deployment.
- Locked the main activity to landscape orientation and implemented immersive full-screen behavior that is restored whenever the activity regains focus.
- Added repeatable dependency, synchronization, build, Android Studio, and device installation commands in `docs/ANDROID_APK.md`.
- Installed Homebrew Java 21 without changing the system's default Java and generated a signed debug APK.

### Testing
- `npm run build` passed for the existing Next.js transit service.
- `npm --prefix android-app run sync:android` completed successfully.
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home npm --prefix android-app run build:debug` completed successfully with 93 Gradle tasks.
- Android package inspection confirmed application ID `com.zhongzhauan.voiceassistant`, label `智能服务`, minimum SDK 24, target/compile SDK 36, Internet permission, and a required landscape screen feature.
- Android signature verification passed using the v2 APK signature scheme and the standard Android debug certificate.
- Runtime dependency audit reported zero vulnerabilities, `git diff --check` passed, and IDE diagnostics reported no changed-file issues.

### Notes
- `android-app/capacitor.config.json`: owns the application identity and fixed remote transit-page URL.
- `android-app/android/app/src/main/AndroidManifest.xml`: permits the selected HTTP deployment and locks the activity to landscape.
- `android-app/android/app/src/main/java/com/zhongzhauan/voiceassistant/MainActivity.java`: hides status and navigation bars using AndroidX window insets APIs.
- `docs/ANDROID_APK.md`: documents internal-distribution boundaries, prerequisites, build commands, installation, and when an APK rebuild is required.
- Debug APK: `android-app/android/app/build/outputs/apk/debug/app-debug.apk` (generated artifact, intentionally ignored by Git).
- APK SHA-256: `7524a67ea942ef954e00fc83aa95afff6e21dda277899b7ce76e8ce3b66d8400`.
- No Android device was connected during verification, so physical installation and on-device network reachability remain manual checks.
- Rollback: remove `android-app/`, `docs/ANDROID_APK.md`, and this progress entry; uninstalling Homebrew `openjdk@21` is optional because it is an external build-tool installation rather than a repository change.

## 2026-08-04 - Task: keep live conversation and voice status visible
### What was done
- Constrained the customer-facing chat card to the current viewport so conversation growth no longer extends the whole browser page.
- Made the conversation list the dedicated scroll area and automatically followed every ASR replacement, new message, and streamed reply fragment.
- Kept the waveform and voice status panel in its reserved bottom area while preserving existing voice controls and event behavior.

### Testing
- `npm run build` passed, including the Next.js production compile, lint, type validation, and route generation.
- `git diff --check` passed.
- IDE diagnostics reported no errors for the changed page component.
- Browser visual verification remains pending on the user's active display; the viewport and flex constraints were checked directly in the component styles.

### Notes
- `src/app-home/robot-console-page.js`: added message-container auto-scroll and constrained the desktop and mobile flex layout to the viewport.
- `progress.md`: records implementation scope, verification evidence, and rollback guidance.
- Rollback: restore `src/app-home/robot-console-page.js` to remove automatic message following and return to page-level growth, then remove this progress entry.

## 2026-08-06 - Task: document the complete repository structure
### What was done
- Added a root README that explains the two runnable parts of the repository, the separately managed voice service, and the external DeepSeek dependency.
- Added an annotated project tree matching each important directory and file to its business responsibility.
- Documented the runtime topology, three primary voice flows, common change locations, generated files that should not be edited, and the local, Docker, and Android entry points.

### Testing
- Confirmed every linked document and every key source path referenced by the README exists in the repository.
- `git diff --check` passed for the documentation changes.
- IDE diagnostics reported no issues for `README.md` or `progress.md`.

### Notes
- `README.md`: provides the repository-level project map, responsibility boundaries, operating commands, and troubleshooting order.
- `progress.md`: records the documentation scope and verification evidence.
- Rollback: remove `README.md` and this progress entry; no application behavior, interface, deployment configuration, or Android source needs to be reverted.

## 2026-08-06 - Task: enlarge and highlight the active microphone control
### What was done
- Increased the floating microphone button from 82 px to 108 px on desktop and from 68 px to 92 px on mobile, with proportionally larger icons and aligned labels.
- Reused the existing whole-session active modifier so a successfully started voice session immediately turns the microphone button, halo, focus ring, pulse, and shadow green.
- Kept the active microphone green while listening or processing callbacks update the bottom status panel, then restored the existing blue appearance when the whole session ends.
- Adjusted the mobile control position to preserve space above the fixed bottom voice-status panel.

### Testing
- `npm run build` passed, including the Next.js production compile, lint, type validation, and route generation.
- `git diff --check` passed.
- IDE diagnostics reported no issues in the changed page component.
- An independent read-only review found no actionable CSS precedence, responsive-layout, accessibility, or behavior defects.
- Browser and Android-device visual verification remains pending; exact appearance at desktop, 640 px, and narrow mobile widths is not claimed as manually verified.

### Notes
- `src/app-home/robot-console-page.js`: enlarges the desktop and mobile microphone control and gives the existing active whole-session state a dominant green visual treatment.
- `docs/ROBOT_VOICE_SESSION.md`: documents the blue inactive and green active whole-session microphone semantics.
- `progress.md`: records the UI scope, verification evidence, and remaining visual check.
- Rollback: restore the previous microphone dimensions and remove the `voice-assistant-control--awake` button, focus, halo, and pulse overrides in `src/app-home/robot-console-page.js`, then remove the related voice-session documentation paragraph and this progress entry.
