# Angular → Android APK Guide — Diagnocare UI

## Overview

This guide converts the existing Angular 20 web app into an Android APK using **Capacitor** — the recommended bridge for Angular/web apps on mobile. Capacitor wraps the built Angular app inside a native Android WebView and gives access to native device APIs.

```
Angular build (dist/)  →  Capacitor sync  →  Android Studio  →  APK
```

---

## Prerequisites — Install These First

| Tool | Download | Why |
|------|----------|-----|
| **Node.js 20+** | https://nodejs.org | Already have it (Angular 20 requires it) |
| **Android Studio** | https://developer.android.com/studio | Builds the APK; includes the Android SDK |
| **JDK 17** | Bundled with Android Studio | Android build system |
| **Android SDK** | Via Android Studio SDK Manager | Platform tools, build tools |

### Verify your environment after installs

```powershell
node --version       # v20+
npm --version        # 9+
java -version        # 17+
```

---

## Step 1 — Add Capacitor to the Angular Project

Open a terminal in `Diagnocare_UI\Diagnocare_UI\` (where `package.json` lives).

```powershell
# Install Capacitor core and CLI
npm install @capacitor/core
npm install --save-dev @capacitor/cli

# Install Android platform
npm install @capacitor/android
```

### Initialize Capacitor

```powershell
npx cap init
```

When prompted:
- **App name:** `Diagnocare`
- **App ID (Bundle ID):** `com.diagnocare.app` *(reverse domain format)*
- **Web asset directory:** `dist/temp-app/browser` *(Angular 20 output path)*

This creates `capacitor.config.ts` in the project root.

### Verify `capacitor.config.ts`

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diagnocare.app',
  appName: 'Diagnocare',
  webDir: 'dist/temp-app/browser',   // Angular 20 build output
  server: {
    androidScheme: 'https'
  }
};

export default config;
```

> **Check your actual build output folder**: run `ng build` once and confirm what folder is created inside `dist/`. Set `webDir` to match exactly.

---

## Step 2 — Build the Angular App

```powershell
# Production build (required — Capacitor packages the dist folder)
ng build --configuration production
```

Output will be at `dist/temp-app/browser/` (or similar). This is what gets bundled into the APK.

> **API URL**: Make sure your `environment.prod.ts` points to your deployed API URL (not `localhost`), since the mobile app runs on a real device.

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://your-deployed-api.com/api'   // not localhost!
};
```

---

## Step 3 — Add the Android Platform

```powershell
npx cap add android
```

This creates an `android/` folder — a full native Android Studio project.

---

## Step 4 — Sync Angular Build into Android

Every time you change the Angular code, rebuild and sync:

```powershell
ng build --configuration production
npx cap sync android
```

`cap sync` copies the `dist/` output into `android/app/src/main/assets/public/` and updates any native plugins.

---

## Step 5 — Open in Android Studio

```powershell
npx cap open android
```

Android Studio opens the `android/` project. Wait for Gradle sync to finish (first time takes 3–5 minutes downloading dependencies).

---

## Step 6 — Build the APK

### Debug APK (for testing — no signing required)

In Android Studio:

1. **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Wait for the build to complete
3. Click **locate** in the notification that appears

APK location:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Release APK (for distribution — requires signing)

#### 6a — Create a Keystore (one time only)

```powershell
keytool -genkey -v -keystore diagnocare-release.jks -alias diagnocare -keyalg RSA -keysize 2048 -validity 10000
```

You'll be asked for a password and organization info. **Save the `.jks` file and password somewhere safe — you cannot regenerate it.**

#### 6b — Configure signing in `android/app/build.gradle`

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file('../diagnocare-release.jks')
            storePassword 'YOUR_STORE_PASSWORD'
            keyAlias 'diagnocare'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

#### 6c — Build release APK

In Android Studio:

1. **Build** → **Generate Signed Bundle / APK**
2. Select **APK** → Next
3. Choose your keystore file → fill in passwords → Next
4. Select **release** build variant → Finish

Release APK location:
```
android\app\build\outputs\apk\release\app-release.apk
```

---

## Step 7 — Install on a Mobile Device

### Option A — USB (Fastest for testing)

1. On your Android phone: **Settings → Developer Options → USB Debugging** (enable it)
   - To enable Developer Options: **Settings → About Phone** → tap **Build Number** 7 times
2. Connect phone via USB cable
3. In Android Studio: select your device from the device dropdown → click ▶ **Run**

The APK installs and launches automatically.

### Option B — ADB Command Line

```powershell
# Check device is detected
adb devices

# Install the debug APK
adb install android\app\build\outputs\apk\debug\app-debug.apk

# Install release APK
adb install android\app\build\outputs\apk\release\app-release.apk
```

### Option C — Share the APK File (sideloading)

1. Copy `app-debug.apk` to your phone (WhatsApp, email, Google Drive, USB file transfer)
2. On the phone: open the APK file
3. Go to **Settings → Install Unknown Apps** → allow your file manager / browser to install
4. Tap **Install**

> Sideloading works for internal distribution (staff, testers). For public distribution, publish to Google Play Store.

---

## Common Development Workflow

After setup is done, the day-to-day cycle is:

```powershell
# 1. Make changes to Angular code
# 2. Build
ng build --configuration production

# 3. Sync to Android
npx cap sync android

# 4. Either run directly on device via Android Studio,
#    or rebuild APK (Build → Build APK)
```

For **live reload** during development (instant changes without rebuilding):

```powershell
npx cap run android --livereload --external
```

This serves the Angular dev server and loads it in the WebView — changes appear immediately on the device.

---

## App Configuration Checklist

Before distributing:

- [ ] `environment.prod.ts` — API URL points to production server (not `localhost`)
- [ ] `capacitor.config.ts` — `webDir` matches actual `ng build` output path
- [ ] App icon — place in `android/app/src/main/res/` (Android Studio → Resource Manager)
- [ ] App name — set in `android/app/src/main/res/values/strings.xml` → `app_name`
- [ ] Min SDK version — set in `android/app/build.gradle` → `minSdkVersion` (21 = Android 5.0+)
- [ ] Permissions — add to `android/app/src/main/AndroidManifest.xml` if using camera, GPS, etc.

---

## Troubleshooting

**`webDir` not found error during sync**
→ Run `ng build` first. Confirm the `dist/` folder exists and update `webDir` in `capacitor.config.ts`.

**Gradle sync fails in Android Studio**
→ File → Invalidate Caches → Invalidate and Restart. Also ensure JDK 17 is selected in Android Studio settings.

**`adb: command not found`**
→ Add Android SDK platform-tools to PATH:
```powershell
$env:PATH += ";C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools"
```

**API calls fail on device (CORS / network error)**
→ The device calls your real API over the network. Ensure:
- API is deployed (not running only on localhost)
- CORS allows your app's origin or `capacitor://localhost`
- API uses HTTPS (Android 9+ blocks plain HTTP by default)

**White screen on launch**
→ Check `webDir` in `capacitor.config.ts` matches your Angular output folder exactly. Run `ng build` and verify the path.

---

## Folder Structure After Setup

```
Diagnocare_UI/
└── Diagnocare_UI/
    ├── android/                  ← Native Android project (open in Android Studio)
    │   └── app/
    │       ├── build.gradle
    │       └── src/main/
    │           ├── assets/public/  ← Angular dist files are copied here by cap sync
    │           └── AndroidManifest.xml
    ├── dist/                     ← Angular build output
    ├── src/                      ← Angular source
    ├── capacitor.config.ts       ← Capacitor config
    └── package.json
```
