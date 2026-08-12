# Docker Compose Deployment

## Deployment topology

This Compose configuration deploys only the transit service:

```text
External client -> host:4000 -> transit-server container
transit-server container -> host.docker.internal:9000 -> voice service on host
transit-server container -> host.docker.internal:4001 -> control service on host
```

The voice service and control service are managed separately and are not part of this Compose project. The existing `ROBOT_CLIENT_*` environment names and `robotId` protocol field are compatibility names; operational logs describe this dependency as the voice service and the configured device as the terminal.

## Prerequisites

1. Install Docker Engine with the Compose plugin.
2. Create `.env` from `.env.example` and provide the required model credentials.
3. Run the voice service and control service on the same host at ports `9000` and `4001`.
4. On Linux, make both dependencies listen on `0.0.0.0` or another address reachable through the Docker host gateway. A process listening only on `127.0.0.1` is generally not reachable from a Linux container through `host.docker.internal`.
5. On Linux, allow TCP ports `9000` and `4001` from the Compose bridge subnet through the host firewall. Scope these rules to the Docker subnet instead of exposing either dependency to untrusted networks.
6. Allow inbound TCP port `4000` through the host firewall when other machines need to call the transit service.

The Compose file injects these container-specific defaults without changing the native runtime defaults:

```env
ROBOT_CLIENT_BASE_URL=http://host.docker.internal:9000
CONTROL_SERVICE_BASE_URL=http://host.docker.internal:4001
```

Keep `CONTROL_SERVICE_BASE_URL` blank in `.env` to use `localhost:4001` for native runs and the host-gateway address above for Compose. Set it to a non-empty HTTP(S) URL when both native and Compose runs should use another reachable control-service address.

It also maps `host.docker.internal` to Docker's host gateway for Linux compatibility.

## Start

Build and start the service:

```bash
docker compose up -d --build
```

The Compose service creates the container as `zhongzhuan` from the local image `zhongzhuan:latest`.

Check its status and logs:

```bash
docker compose ps
docker compose logs -f transit-server
```

The container keeps two bounded log destinations:

- Docker stdout logging retains five files of up to 10 MB each.
- The `transit-logs` named volume retains application logs for seven days. Daily files rotate at 5 MB with two backups.

The named volume survives application container recreation, while the retention settings prevent historical files from accumulating indefinitely.

Application logs use the default `LOG_FORMAT=pretty` format so they can be read directly from Docker without a JSON viewer. Successful requests are collapsed into a small set of business events while recognized text and every real model fragment remain visible:

```text
09:03:01.120 INFO  🎙️ 会话开始
09:03:12.916 INFO  🎤 识别 | "你好，你能帮我做什么？"
09:03:13.014 INFO  💬 回复+ | "您好，"
09:03:13.036 INFO  💬 回复+ | "我可以帮您"
09:03:13.145 INFO  ✅ 回复完成 | 8片 48字 244ms
09:03:26.182 INFO  🛑 会话结束 | 25.1s
```

One `回复+` line represents one fragment actually received from DeepSeek or `/robot/model/Response/stream`; the transit service does not invent character-level fragments. Warnings and errors expand only the fields needed for diagnosis, and displayed identifiers are shortened to eight characters:

```text
09:03:13.145 WARN  ⚠️ 回调忽略 | 终端=4 | 话轮=9c1ae54c | 原因=未收到模型开始回调
09:03:13.146 ERROR ❌ 会话控制请求失败 | 终端=4 | 会话=b492d50e | 状态=1 | 服务=控制服务 | 接口="POST /robot/voiceSession/control" | 耗时=5002ms | 超时=5000ms | 原因=连接超时 代码=ETIMEDOUT | 地址=http://host.docker.internal:4001/robot/voiceSession/control | 追踪=a4623f8d
```

Set `LOG_FORMAT=json` when complete structured records are required. JSON mode retains directions, routes, services, full identifiers, HTTP metadata, timing fields, and content. Model callbacks are associated with the current whole session by `robotId`; an optional voice-service `sessionId` is retained as `话轮` and is not compared with the whole-session ID. View the readable output with:

```bash
docker logs --tail 100 -f zhongzhuan
```

Verify the published endpoint:

```bash
curl http://127.0.0.1:4000/
```

The container runs Next.js on `0.0.0.0:4000`, and Compose publishes it as host port `4000`.

The runtime image also includes the repository `public/` directory. This is required for the customer page background at `/yingwang-backend.jpg`; copying only the `.next` build directory would leave that asset unavailable in the running container.

## Reverse proxy

A reverse proxy may expose the application through a domain or HTTPS endpoint and forward traffic to host port `4000`. The browser control endpoint does not require the proxy's internal host to match the public browser origin.

Keep the page and `/api/voice-session/control` under the same public origin. Do not add permissive CORS response headers for this endpoint; its strict `application/json` request format relies on the browser rejecting unauthorized cross-origin preflight requests.

## Dependency security status

The image uses Next.js `15.5.21`, which resolves the Next.js advisories affecting the previous `15.5.18` version. The current production dependency audit still reports high-severity advisories in the transitive `postcss` and `sharp` packages. npm's available automated remediation upgrades Next.js to `16.3.0`, which is a breaking major-version change and has not been applied as part of this deployment work.

Before exposing this service directly to an untrusted public network, plan and verify the Next.js 16 upgrade or place the service behind network access controls and a reverse proxy while the remaining dependency risk is assessed.

## Stop

Stop and remove the container while preserving the application log volume:

```bash
docker compose down
```

To remove the retained application logs as well:

```bash
docker compose down --volumes
```

## Troubleshooting dependency access

Test both dependency routes from the running container with the same side-effect-free `HEAD` probe used before session startup:

```bash
docker compose exec transit-server \
  node -e "Promise.allSettled(['http://host.docker.internal:9000/robot/voiceSession/control', 'http://host.docker.internal:4001/robot/voiceSession/control'].map(async (target) => { const response = await fetch(target, { method: 'HEAD', headers: { 'Cache-Control': 'no-store', Connection: 'close' }, cache: 'no-store', redirect: 'manual' }); console.log(target, response.status); if (response.status >= 500 && response.status <= 599 && response.status !== 501) throw new Error(target + ' returned HTTP ' + response.status); })).then((results) => { if (results.some((result) => result.status === 'rejected')) { for (const result of results) if (result.status === 'rejected') console.error(result.reason); process.exit(1); } })"
```

This command does not send a session status or start capture. Any received response normally proves process reachability, including `404`, `405`, or `501` when the dependency does not implement `HEAD`. The transit service treats other `500`-`599` responses as unavailable, and the later startup POST remains the authoritative protocol check.

The transit service sends probes and control requests with `Connection: close` and `Cache-Control: no-store`, and consumes response bodies where applicable before completing the request. This gives the separately managed services an explicit, orderly connection lifecycle and avoids resetting a reused connection after a successful response.

If either request cannot connect on Linux, verify both listeners on the host:

```bash
ss -lntp | grep -E ':(9000|4001)'
```

The listeners should not be limited to `127.0.0.1` for this topology.

Find the Compose network subnet:

```bash
docker network inspect zhongzhuan_default \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Then inspect the host firewall and allow that subnet to reach TCP ports `9000` and `4001`. For example, with UFW:

```bash
sudo ufw status
sudo ufw allow from <compose-subnet> to any port 9000 proto tcp
sudo ufw allow from <compose-subnet> to any port 4001 proto tcp
```

For firewalld, inspect the active zones and add equivalent source-scoped rules. Do not add unrestricted public rules for ports `9000` or `4001` unless the dependencies have separate authentication and network protections.
