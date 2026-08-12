# 智能服务中转项目

这是一个面向语音终端的智能服务中转项目。仓库内同时包含：

1. 运行在 `4000` 端口的 Next.js 页面和中转服务；
2. 用于安卓终端安装的 Capacitor APK 壳工程。

语音服务和控制服务不在本仓库中，它们分别由其他服务运行在 `9000` 和 `4001` 端口。DeepSeek 也是外部服务，由中转服务根据配置调用。

## 项目结构

```text
.
├── app/                                      # Next.js 页面入口和 HTTP 接口
│   ├── page.js                               # 首页入口，加载面客语音页面
│   ├── layout.js                             # 页面标题、描述和全局布局
│   ├── api/voice-session/control/route.js    # 页面开始/结束整段语音会话
│   └── robot/                                # 语音服务回调和页面实时事件接口
│       ├── events/route.js                   # 页面接收实时消息的 SSE 接口
│       ├── voiceMonitor/route.js             # 接收语音状态回调
│       ├── listenQwen/route.js               # 接收识别、命令和普通回复请求
│       ├── listenQwen/stream/route.js        # 接收并返回流式回复
│       └── model/                            # 接收语音服务侧模型的流式回调
│           ├── response_monitor/route.js     # 模型回复开始/结束
│           └── Response/stream/route.js      # 模型回复增量文本
│
├── src/                                      # 中转服务的主要业务代码
│   ├── app-home/                             # 面客页面和浏览器通信逻辑
│   │   ├── robot-console-page.js             # 页面布局、消息、语音状态和滚动
│   │   └── chat-api.js                       # 页面请求和 SSE 订阅
│   ├── features/robot/                       # 语音会话和回调业务
│   │   ├── application/                      # 会话、ASR、命令、模型流和事件处理
│   │   └── domain/constants.js               # 固定命令等领域常量
│   ├── integrations/                         # 外部服务访问层
│   │   ├── robot-client/                     # 调用语音服务，名称为兼容旧协议保留
│   │   ├── control-service/                  # 调用终端行为控制服务
│   │   └── deepseek/                         # 调用 DeepSeek 模型
│   └── shared/                               # 日志、HTTP、SSE 和通用字符串工具
│
├── android-app/                              # 安卓 APK 壳工程
│   ├── capacitor.config.json                 # 应用名称、包名和页面地址
│   ├── package.json                          # APK 同步、打开和构建命令
│   ├── www/index.html                        # Capacitor 必需的本地占位页
│   └── android/                              # Capacitor 生成的 Android 原生工程
│       └── app/src/main/
│           ├── AndroidManifest.xml           # 权限、横屏和 Activity 配置
│           ├── java/.../MainActivity.java    # 沉浸式全屏处理
│           └── res/                          # 图标、启动图和 Android 资源
│
├── docs/                                     # 详细开发、部署和接口说明
│   ├── DEVELOPMENT.md                        # 本地开发说明
│   ├── DOCKER_DEPLOYMENT.md                  # Docker 部署说明
│   ├── ROBOT_VOICE_SESSION.md                # 语音会话与回调协议
│   └── ANDROID_APK.md                        # APK 构建和安装说明
│
├── public/
│   └── yingwang-backend.jpg                  # 页面使用的横屏背景图片
│
├── .env.example                              # 环境变量示例
├── package.json                              # 中转服务依赖和运行命令
├── next.config.js                            # Next.js 构建目录配置
├── Dockerfile                                # 中转服务镜像构建文件
├── docker-compose.yml                        # 中转服务容器部署配置
└── progress.md                               # 项目改动和验证记录
```

## 整体运行关系

```text
浏览器 ───────────────┐                          ┌──> 语音服务 :9000
                     ├──> 中转服务 :4000 ──────┼──> 控制服务 :4001
Android APK 全屏页面 ─┘                          └──> DeepSeek

语音服务回调 ───> 中转服务 :4000 ───SSE──> 页面或 Android APK
```

### 每一部分负责什么

| 部分 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| 页面 | 展示对话、语音状态、流式回复和会话按钮 | 不直接访问语音服务、控制服务或 DeepSeek |
| 中转服务 | 管理整段会话、协调语音和终端行为控制、处理回调、调用 DeepSeek、推送 SSE | 不采集底层音频 |
| 语音服务 | 语音采集、识别、语音状态和语音服务侧模型处理 | 不在本仓库中部署 |
| 控制服务 | 根据整段会话开始/结束状态暂停或恢复迎宾、巡航和导航行为 | 不接收浏览器或 Android APK 的直接请求 |
| DeepSeek | 在中转服务需要模型回答时生成文本 | 不直接与页面通信 |
| Android APK | 用全屏 WebView 打开中转页面 | 不包含中转服务、语音服务或控制服务 |

> `ROBOT_CLIENT_BASE_URL`、`ROBOT_ID`、`robotId` 和 `/robot/*` 是现有协议兼容名称。业务上对应的是“语音服务”和“终端”，不是另一个机器人服务。

## 三条主要业务链路

### 1. 开始和结束整段语音会话

```text
页面点击麦克风
  -> POST /api/voice-session/control
  -> 中转服务生成并保存整段 sessionId
  -> 同时 HEAD 探测语音服务 :9000 和控制服务 :4001
  -> 先 POST 控制服务 :4001 /robot/voiceSession/control
  -> 控制启动成功后 POST 语音服务 :9000 /robot/voiceSession/control
```

第一次点击发送 `status: "1"`，第二次点击复用同一个整段 `sessionId` 并发送 `status: "0"`。开始前的 `HEAD` 只检查进程可达性，不发送状态；任一探测失败时两个服务都不会收到启动 POST。语音服务继续接收 `{robotId, sessionId, status}`，控制服务只接收 `{status}`。启动按“控制服务 -> 语音服务”串行执行，失败时尝试发送 `status: "0"` 补偿；停止仍并发尝试两个服务。只有两个服务都成功后，整段会话状态才会推进。用户一轮说话结束后会进入 60 秒无输入计时，期间没有新的输入才会自动结束整段会话。

### 2. 识别、固定命令和 DeepSeek 回复

```text
语音服务
  -> POST /robot/listenQwen 或 /robot/listenQwen/stream
  -> 中转服务判断固定命令
  -> 命中命令：返回固定回复
  -> 未命中命令：调用 DeepSeek
```

### 3. 语音服务侧模型流式回复

```text
POST /robot/model/response_monitor  status="1"
  -> POST /robot/model/Response/stream  增量文本，可多次
  -> POST /robot/model/response_monitor  status="0"
  -> GET /robot/events 通过 SSE 推送到页面
```

每次 `/robot/model/Response/stream` 应只发送本次新增的文本。中转服务不会把一次完整回复伪造成字符级流式回复。

## 常见需求应该改哪里

| 想做的事情 | 主要修改位置 |
| --- | --- |
| 修改首页布局、文案、消息样式 | `src/app-home/robot-console-page.js` |
| 修改页面如何调用接口或接收 SSE | `src/app-home/chat-api.js` |
| 新增或修改固定命令 | `src/features/robot/domain/constants.js`、`src/features/robot/application/command-replies.js` |
| 修改整段语音会话行为 | `src/features/robot/application/voice-session.js` |
| 修改 ASR 或模型回调处理 | `src/features/robot/application/listen-qwen.js`、`src/features/robot/application/model-response.js` |
| 修改中转到语音服务的请求 | `src/integrations/robot-client/` |
| 修改中转到控制服务的请求 | `src/integrations/control-service/` |
| 修改 DeepSeek 参数或请求行为 | `.env`、`src/integrations/deepseek/` |
| 修改日志显示格式 | `src/shared/logging/logger.js` |
| 修改页面背景图片 | `public/yingwang-backend.jpg` |
| 修改 Android 打开的页面地址 | `android-app/capacitor.config.json`，然后执行 Android 同步 |
| 修改 Android 横屏或权限 | `android-app/android/app/src/main/AndroidManifest.xml` |
| 修改 Android 全屏行为 | `android-app/android/app/src/main/java/com/zhongzhauan/voiceassistant/MainActivity.java` |
| 修改 Android 图标或启动图 | `android-app/android/app/src/main/res/` |
| 修改容器端口或宿主机语音、控制服务地址 | `docker-compose.yml` |

## 不要直接修改的生成文件

以下目录或文件由构建工具生成，通常不应手工修改，也不应作为业务源码阅读：

```text
node_modules/                                      # 根项目 npm 依赖
.next/                                            # Next.js 生产构建结果
.next-dev/                                        # Next.js 开发构建结果
android-app/node_modules/                         # Android 壳 npm 依赖
android-app/android/.gradle/                      # Gradle 缓存
android-app/android/app/build/                    # APK 和 Android 构建结果
android-app/android/app/src/main/assets/public/   # cap sync 复制的前端占位资源
android-app/android/app/src/main/assets/capacitor.config.json
```

Android 工程中真正经常需要关注的只有：

```text
android-app/capacitor.config.json
android-app/android/app/src/main/AndroidManifest.xml
android-app/android/app/src/main/java/com/zhongzhauan/voiceassistant/MainActivity.java
android-app/android/app/src/main/res/
```

## 本地启动中转服务

### 1. 准备环境变量

```bash
cp .env.example .env
```

常用配置：

```env
DEEPSEEK_API_KEY=你的密钥
ROBOT_CLIENT_BASE_URL=http://localhost:9000
ROBOT_CLIENT_TIMEOUT_MS=5000
CONTROL_SERVICE_BASE_URL=
CONTROL_SERVICE_TIMEOUT_MS=5000
ROBOT_ID=4
LOG_FORMAT=pretty
```

`CONTROL_SERVICE_BASE_URL` 留空时，本地运行默认访问 `http://localhost:4001`，Docker Compose 默认访问 `http://host.docker.internal:4001`。需要连接其他地址时再填写完整的 HTTP(S) 地址；同一个值也会覆盖 Compose 默认地址。

### 2. 安装并启动

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:4000
```

生产构建检查：

```bash
npm run build
npm run start
```

## Docker 部署中转服务

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f transit-server
```

当前 Compose 只部署中转服务。容器通过以下地址访问宿主机上的语音服务和控制服务：

```text
http://host.docker.internal:9000
http://host.docker.internal:4001
```

详细说明见 [Docker 部署文档](docs/DOCKER_DEPLOYMENT.md)。

## Android APK

当前 APK 配置：

```text
应用名称：智能服务
应用包名：com.zhongzhauan.voiceassistant
页面地址：http://192.168.11.205:4000
屏幕方向：横屏
显示模式：沉浸式全屏
```

构建 debug APK：

```bash
npm --prefix android-app install
JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home" \
  npm --prefix android-app run build:debug
```

APK 输出位置：

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

安装到已连接的安卓设备：

```bash
adb install -r android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

APK 只负责打开 `http://192.168.11.205:4000`，因此安卓设备必须能通过网络访问该地址。详细说明见 [Android APK 文档](docs/ANDROID_APK.md)。

## 详细文档入口

| 文档 | 用途 |
| --- | --- |
| [本地开发](docs/DEVELOPMENT.md) | 安装、启动、构建目录和开发环境说明 |
| [Docker 部署](docs/DOCKER_DEPLOYMENT.md) | 容器拓扑、日志、网络和故障排查 |
| [语音会话协议](docs/ROBOT_VOICE_SESSION.md) | 整段会话、ASR、模型回调和 SSE 说明 |
| [Android APK](docs/ANDROID_APK.md) | Android 环境、构建、安装和更新边界 |

## 最小排查顺序

遇到“页面没有回复”时，按下面顺序检查：

1. 页面或 Android APK 能否访问中转服务 `:4000`；
2. 中转服务能否访问语音服务 `:9000`；
3. 中转服务能否访问控制服务 `:4001`；
4. 语音服务是否按顺序发送开始、增量、结束回调；
5. 中转服务日志是否出现 `会话开始`、`识别`、`回复+` 或明确异常；
6. Android 终端和 `192.168.11.205` 是否位于可互通网络。
