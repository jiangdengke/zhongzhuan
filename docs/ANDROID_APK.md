# Android APK Shell

## Purpose

The `android-app/` project packages the customer-facing page as an internal Android application without browser chrome. It is a Capacitor Android shell that loads the deployed transit-service page at:

```text
http://192.168.11.205:4000
```

The Android app does not contain or replace the transit service. Runtime traffic remains:

```text
Android app -> transit service :4000 -> voice service :9000
```

## Fixed application settings

```text
App name:       智能服务
Application ID: com.zhongzhauan.voiceassistant
Orientation:    landscape
Display mode:   immersive full screen
```

The source configuration is in `android-app/capacitor.config.json`. The Android activity settings are in `android-app/android/app/src/main/AndroidManifest.xml`, and immersive mode is implemented in `MainActivity.java`.

## Deployment boundary

Capacitor documents `server.url` as a live-reload setting that is not intended for production application-store distribution. This repository uses it deliberately for an internal, fixed-terminal APK so web updates can be deployed on the transit server without rebuilding every Android device.

Do not publish this remote-URL shell to an application store as-is. A public or externally distributed version should bundle the web frontend, use HTTPS, and complete the applicable store review and security work.

## Prerequisites

- Node.js and npm.
- Java 21.
- Android SDK Platform 36.
- Android SDK Build-Tools 35 or a compatible installed version.
- Android Platform Tools for `adb` installation.
- Network access from the Android device to `192.168.11.205:4000`.

The transit service must listen on `0.0.0.0:4000`, and the host firewall must allow the Android device to reach port `4000`. The APK cannot use `localhost` because that address would refer to the Android device itself.

## Install dependencies

From the repository root:

```bash
npm --prefix android-app install
```

## Synchronize Android assets and configuration

Run this after changing `capacitor.config.json`, the fallback `www/` content, or Capacitor dependencies:

```bash
npm --prefix android-app run sync:android
```

## Build a debug APK

Verify Java first:

```bash
java -version
```

The version must be Java 21. On macOS with Homebrew, Java 21 can be installed and selected for one build without changing the global Java configuration:

```bash
brew install openjdk@21
JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home" \
  npm --prefix android-app run build:debug
```

When Java 21 is already the active JDK, use:

```bash
npm --prefix android-app run build:debug
```

The generated APK is:

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## Install on a connected Android device

Enable USB debugging, connect the device, and verify it is visible:

```bash
adb devices
```

Install or upgrade the debug APK:

```bash
adb install -r android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## Open the native project

To inspect, run, or create a signed release in Android Studio:

```bash
npm --prefix android-app run open:android
```

Signing keys must remain outside version control. The Android project ignores `*.jks` and `*.keystore` files.

## Updating the deployment

Normal page and transit-service changes only require redeploying the server at `192.168.11.205:4000`; installed APKs load the updated page on their next launch or refresh.

Rebuild and reinstall the APK when changing:

- the application ID or application name;
- the transit-service URL;
- landscape or full-screen behavior;
- Android permissions, icons, signing, or native dependencies.

## HTTP security boundary

The selected endpoint uses cleartext HTTP, so the Android manifest and Capacitor configuration explicitly allow cleartext traffic. This is acceptable only on the trusted internal network selected for this deployment. Move the service to HTTPS before using the app across untrusted networks.
