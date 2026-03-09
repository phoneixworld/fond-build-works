import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - JSZip available via CDN
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AndroidConfig {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  iconUrl: string;
  splashUrl: string;
  splashBgColor: string;
  permissions: Record<string, boolean>;
  orientation: string;
  statusBarColor: string;
  enableDeepLinks: boolean;
}

function generateAndroidManifest(config: AndroidConfig, publishedUrl: string): string {
  const permLines: string[] = [];
  if (config.permissions.camera) permLines.push('    <uses-permission android:name="android.permission.CAMERA" />');
  if (config.permissions.location) {
    permLines.push('    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />');
    permLines.push('    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />');
  }
  if (config.permissions.storage) {
    permLines.push('    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />');
    permLines.push('    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />');
  }
  if (config.permissions.notifications) permLines.push('    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
  if (config.permissions.microphone) permLines.push('    <uses-permission android:name="android.permission.RECORD_AUDIO" />');

  permLines.push('    <uses-permission android:name="android.permission.INTERNET" />');
  permLines.push('    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />');

  const orientation = config.orientation === "any" ? "unspecified" : config.orientation;

  const deepLinkIntent = config.enableDeepLinks ? `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${new URL(publishedUrl).hostname}" />
            </intent-filter>` : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${config.packageId}">

${permLines.join("\n")}

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${config.appName}"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:networkSecurityConfig="@xml/network_security_config">
        <activity
            android:name=".MainActivity"
            android:screenOrientation="${orientation}"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>${deepLinkIntent}
        </activity>
    </application>
</manifest>`;
}

function generateMainActivity(config: AndroidConfig, publishedUrl: string): string {
  const pkgPath = config.packageId;
  return `package ${pkgPath};

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.graphics.Color;

public class MainActivity extends Activity {

    private static final String APP_URL = "${publishedUrl}";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private ValueCallback<Uri[]> fileUploadCallback;
    private WebView webView;
    private View splashView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        // Status bar color
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("${config.statusBarColor}"));
        }

        // Create layout
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("${config.splashBgColor}"));

        // WebView
        webView = new WebView(this);
        setupWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " PhoneixApp/${config.versionName}");

        // Enable cookies
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(APP_URL) || url.startsWith("https://")) {
                    return false; // Load in WebView
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                fileUploadCallback = callback;
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && fileUploadCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
        }
    }
}
`;
}

function generateBuildGradle(config: AndroidConfig): string {
  return `plugins {
    id 'com.android.application'
}

android {
    namespace '${config.packageId}'
    compileSdk 34

    defaultConfig {
        applicationId "${config.packageId}"
        minSdk 24
        targetSdk 34
        versionCode ${config.versionCode}
        versionName "${config.versionName}"
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        debug {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.webkit:webkit:1.8.0'
}
`;
}

function generateGitHubActions(config: AndroidConfig): string {
  return `name: Build Android APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - name: Setup Android SDK
      uses: android-actions/setup-android@v3

    - name: Grant execute permission for gradlew
      run: chmod +x gradlew

    - name: Build Debug APK
      run: ./gradlew assembleDebug

    - name: Build Release APK
      if: \${{ github.event_name == 'workflow_dispatch' }}
      env:
        KEYSTORE_FILE: \${{ secrets.KEYSTORE_FILE }}
        KEYSTORE_PASSWORD: \${{ secrets.KEYSTORE_PASSWORD }}
        KEY_ALIAS: \${{ secrets.KEY_ALIAS }}
        KEY_PASSWORD: \${{ secrets.KEY_PASSWORD }}
      run: ./gradlew assembleRelease

    - name: Upload Debug APK
      uses: actions/upload-artifact@v4
      with:
        name: ${config.appName.replace(/\s+/g, "-")}-debug
        path: app/build/outputs/apk/debug/*.apk

    - name: Upload Release APK
      if: \${{ github.event_name == 'workflow_dispatch' }}
      uses: actions/upload-artifact@v4
      with:
        name: ${config.appName.replace(/\s+/g, "-")}-release
        path: app/build/outputs/apk/release/*.apk
`;
}

function generateNetworkSecurityConfig(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;
}

function generateStyles(config: AndroidConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.Light.NoActionBar">
        <item name="android:windowBackground">${config.splashBgColor}</item>
        <item name="android:statusBarColor">${config.statusBarColor}</item>
        <item name="android:navigationBarColor">${config.splashBgColor}</item>
    </style>
</resources>`;
}

function generateStrings(config: AndroidConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${config.appName}</string>
</resources>`;
}

function generateSettingsGradle(config: AndroidConfig): string {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${config.appName}"
include ':app'
`;
}

function generateProjectBuildGradle(): string {
  return `buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.0'
    }
}
`;
}

function generateGradleWrapper(): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

function generateProguardRules(): string {
  return `# WebView
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
    public void *(android.webkit.WebView, java.lang.String);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(android.webkit.WebView, java.lang.String);
}
`;
}

function generateReadme(config: AndroidConfig, publishedUrl: string): string {
  return `# ${config.appName} — Android App

This is an auto-generated Android WebView wrapper for your Phoenix web app.

## App Details
- **Package ID:** ${config.packageId}
- **Version:** ${config.versionName} (${config.versionCode})
- **Web App URL:** ${publishedUrl}

## Quick Start

### Automatic Build (GitHub Actions)
1. Push this project to a GitHub repository
2. GitHub Actions will automatically build a debug APK
3. Download the APK from the Actions → Artifacts tab

### Manual Build
1. Install [Android Studio](https://developer.android.com/studio)
2. Open this project in Android Studio
3. Click **Run** or **Build > Build APK**

### Signed Release Build
To create a signed release APK:
1. Generate a keystore: \`keytool -genkey -v -keystore release.keystore -alias myapp -keyalg RSA -keysize 2048 -validity 10000\`
2. Add these GitHub repository secrets:
   - \`KEYSTORE_FILE\` — path to keystore
   - \`KEYSTORE_PASSWORD\` — keystore password
   - \`KEY_ALIAS\` — key alias
   - \`KEY_PASSWORD\` — key password
3. Trigger the workflow manually from GitHub Actions

## Customization
- **App Icon:** Replace files in \`app/src/main/res/mipmap-*/\`
- **Splash Color:** Edit \`splashBgColor\` in \`res/values/styles.xml\`
- **Permissions:** Edit \`AndroidManifest.xml\`

## Architecture
This app uses a WebView to load your published web app. It supports:
- ✅ JavaScript execution
- ✅ Local storage & cookies
- ✅ File uploads
- ✅ Geolocation (if enabled)
- ✅ Back button navigation
- ✅ Custom user agent
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { config, publishedUrl, projectName } = await req.json() as {
      config: AndroidConfig;
      publishedUrl: string;
      projectName: string;
    };

    if (!config || !publishedUrl) {
      return new Response(JSON.stringify({ error: "Missing config or publishedUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = new JSZip();
    const pkgPath = config.packageId.replace(/\./g, "/");

    // Root files
    zip.file("README.md", generateReadme(config, publishedUrl));
    zip.file("settings.gradle", generateSettingsGradle(config));
    zip.file("build.gradle", generateProjectBuildGradle());
    zip.file("gradle/wrapper/gradle-wrapper.properties", generateGradleWrapper());
    zip.file(".gitignore", `*.iml\n.gradle\n/local.properties\n/.idea\n/build\n/captures\n.externalNativeBuild\n.cxx\nlocal.properties\n`);

    // GitHub Actions
    zip.file(".github/workflows/build.yml", generateGitHubActions(config));

    // App module
    zip.file("app/build.gradle", generateBuildGradle(config));
    zip.file("app/proguard-rules.pro", generateProguardRules());

    // Source
    zip.file(`app/src/main/java/${pkgPath}/MainActivity.java`, generateMainActivity(config, publishedUrl));

    // Manifest
    zip.file("app/src/main/AndroidManifest.xml", generateAndroidManifest(config, publishedUrl));

    // Resources
    zip.file("app/src/main/res/values/strings.xml", generateStrings(config));
    zip.file("app/src/main/res/values/styles.xml", generateStyles(config));
    zip.file("app/src/main/res/xml/network_security_config.xml", generateNetworkSecurityConfig());

    // Gradlew script (minimal)
    zip.file("gradlew", `#!/bin/bash\nexec gradle "$@"\n`);
    zip.file("gradlew.bat", `@echo off\ngradle %*\n`);

    // Generate zip
    const zipContent = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${config.appName.replace(/\s+/g, "-").toLowerCase()}-android.zip"`,
      },
    });
  } catch (error: unknown) {
    console.error("Android export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
