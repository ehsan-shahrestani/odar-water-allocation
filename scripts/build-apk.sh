#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/.jdk/temurin-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$PATH"

BUILD_TOOLS_DIR="$ANDROID_HOME/build-tools/35.0.0"
KEYSTORE_PATH="$REPO_ROOT/odar-release.keystore"
OUTPUT_DIR="$REPO_ROOT/dist/apk"
mkdir -p "$OUTPUT_DIR"

MODE="${1:-debug}"

echo "=========================================="
echo "  اُدار - ساخت فایل APK اندروید"
echo "  حالت: $MODE"
echo "  Java Home: $JAVA_HOME"
echo "  Android SDK: $ANDROID_HOME"
echo "=========================================="

cd "$REPO_ROOT"

echo "۱. بیلد کلاینت Angular..."
npm run build:client

echo "۲. همگام‌سازی Capacitor با پروژه اندروید..."
npx cap sync android

echo "۳. کامپایل با Gradle..."
cd "$REPO_ROOT/android"

if [ "$MODE" == "release" ]; then
  ./gradlew assembleRelease
  UNSIGNED_APK="$REPO_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  ALIGNED_APK="$OUTPUT_DIR/app-release-aligned.apk"
  SIGNED_APK="$OUTPUT_DIR/odar-release.apk"

  if [ -f "$KEYSTORE_PATH" ]; then
    echo "۴. بهینه‌سازی فایل (zipalign)..."
    "$BUILD_TOOLS_DIR/zipalign" -v -p -f 4 "$UNSIGNED_APK" "$ALIGNED_APK" > /dev/null

    echo "۵. امضای دیجیتال با کلید اختصاصی (apksigner)..."
    echo ">> رمز ورود Keystore را وارد کنید:"
    "$BUILD_TOOLS_DIR/apksigner" sign --ks "$KEYSTORE_PATH" --ks-key-alias odar --out "$SIGNED_APK" "$ALIGNED_APK"

    rm -f "$ALIGNED_APK"

    echo "۶. اعتبارسنجی امضا..."
    "$BUILD_TOOLS_DIR/apksigner" verify "$SIGNED_APK"

    echo ""
    echo "================================================================"
    echo "✔ فایل نسخه نهایی Release با موفقیت ساخته و امضا شد:"
    echo "  $SIGNED_APK"
    echo "================================================================"
    echo "این فایل دقیقاً همان فایلی است که باید در کافه بازار آپلود کنید."
  else
    echo "هشدار: فایل کلید odar-release.keystore یافت نشد."
    echo "فایل خام بدون امضا در مسیر زیر است:"
    echo "  $UNSIGNED_APK"
  fi
else
  ./gradlew assembleDebug
  DEBUG_APK="$REPO_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  FINAL_DEBUG_APK="$OUTPUT_DIR/odar-debug.apk"
  cp -f "$DEBUG_APK" "$FINAL_DEBUG_APK"

  echo ""
  echo "================================================================"
  echo "✔ فایل APK تست (Debug) با موفقیت ساخته شد:"
  echo "  $FINAL_DEBUG_APK"
  echo "================================================================"
  echo "می‌توانید این فایل را مستقیم روی گوشی خود نصب و تست کنید."
fi
