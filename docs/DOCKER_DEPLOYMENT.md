# Docker Compose Deployment

## Deployment topology

This Compose configuration deploys only the transit service:

```text
External client -> host:4000 -> transit-server container
transit-server container -> host.docker.internal:9000 -> robot client on host
```

The robot client is managed separately and is not part of this Compose project.

## Prerequisites

1. Install Docker Engine with the Compose plugin.
2. Create `.env` from `.env.example` and provide the required model credentials.
3. Run the robot client on the same host at port `9000`.
4. On Linux, make the robot client listen on `0.0.0.0:9000` or another address reachable through the Docker host gateway. A process listening only on `127.0.0.1:9000` is generally not reachable from a Linux container through `host.docker.internal`.
5. On Linux, allow TCP port `9000` from the Compose bridge subnet through the host firewall. Scope this rule to the Docker subnet instead of exposing the robot client to untrusted networks.
6. Allow inbound TCP port `4000` through the host firewall when other machines need to call the transit service.

The Compose file injects this container-specific address without changing the native `.env` value:

```env
ROBOT_CLIENT_BASE_URL=http://host.docker.internal:9000
```

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

Application logs use the default `LOG_FORMAT=pretty` format so they can be read directly from Docker without a JSON viewer. Each line contains a Chinese module name, one status emoji, and pipe-separated fields:

```text
2026-08-04 06:20:31.245 INFO  [语音会话] 📤 正在连接机器人 | 会话=session-b506... | 机器人=4 | 状态=1 | 地址=http://host.docker.internal:9000/robot/voiceSession/control | 超时=5000ms
2026-08-04 06:20:31.248 INFO  [语音会话] ✅ 语音会话已开始 | 会话=session-b506... | 机器人=4 | 状态=1 | 地址=http://host.docker.internal:9000/robot/voiceSession/control | 耗时=3ms
2026-08-04 06:20:36.247 ERROR [语音会话] ❌ 机器人控制失败 | 会话=session-b506... | 机器人=4 | 状态=1 | 地址=http://host.docker.internal:9000/robot/voiceSession/control | 耗时=5002ms | 超时=5000ms | 原因=连接超时 代码=ETIMEDOUT
```

The application enriches robot-client failures with the target address, elapsed time, timeout classification, and low-level network code when the runtime provides them. View the same readable output with:

```bash
docker logs --tail 100 -f zhongzhuan
```

Verify the published endpoint:

```bash
curl http://127.0.0.1:4000/
```

The container runs Next.js on `0.0.0.0:4000`, and Compose publishes it as host port `4000`.

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

## Troubleshooting robot-client access

Test host resolution from the running container:

```bash
docker compose exec transit-server \
  node -e "fetch('http://host.docker.internal:9000/robot/voiceSession/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robotId: '4', sessionId: 'connectivity-test', status: '0' }) }).then(async (response) => console.log(response.status, await response.text())).catch((error) => { console.error(error); process.exit(1); })"
```

This command sends a real stop control request. Use it only when doing an explicit connectivity test with the robot client owner.

The transit service sends robot control requests with `Connection: close` and consumes the response body before completing the request. This gives the separately managed Python control service an explicit, orderly connection lifecycle and avoids resetting a reused connection after a successful `200` response.

If the request cannot connect on Linux, verify the robot process listener on the host:

```bash
ss -lntp | grep ':9000'
```

The listener should not be limited to `127.0.0.1:9000` for this topology.

Find the Compose network subnet:

```bash
docker network inspect zhongzhuan_default \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Then inspect the host firewall and allow that subnet to reach TCP port `9000`. For example, with UFW:

```bash
sudo ufw status
sudo ufw allow from <compose-subnet> to any port 9000 proto tcp
```

For firewalld, inspect the active zones and add an equivalent source-scoped rule. Do not add an unrestricted public rule for port `9000` unless the robot client has separate authentication and network protections.
