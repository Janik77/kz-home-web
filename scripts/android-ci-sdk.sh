#!/usr/bin/env bash
# Only in GitHub's disposable Linux runner.
set -euo pipefail
: "${RUNNER_TEMP:?}" "${ANDROID_HOME:?}"
tool_url=https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
curl --fail --location --silent --show-error --max-time 180 "$tool_url" -o "$RUNNER_TEMP/kz-sdk-tools.zip"
printf '%s  %s\n' 7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee "$RUNNER_TEMP/kz-sdk-tools.zip" | sha256sum -c -
mkdir -p "$ANDROID_HOME/cmdline-tools"
unzip -q "$RUNNER_TEMP/kz-sdk-tools.zip" -d "$ANDROID_HOME/cmdline-tools"
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/19.0"
manager="$ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager"
"$manager" --licenses < <(yes) >/dev/null
"$manager" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools' "$@" >/dev/null
