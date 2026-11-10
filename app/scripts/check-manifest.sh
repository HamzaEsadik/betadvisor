#!/usr/bin/env bash
# Merges the release AndroidManifest and checks it (Part 15): POST_NOTIFICATIONS and the
# WorkManager components are present, and no permission outside the allowlist is requested.
# Run `npm run prebuild:android` first.
set -euo pipefail
cd "$(dirname "$0")/../android"
./gradlew :app:processReleaseMainManifest -q >/dev/null
M=app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml

ALLOWED='android.permission.INTERNET
android.permission.POST_NOTIFICATIONS
android.permission.VIBRATE
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.WAKE_LOCK
android.permission.ACCESS_NETWORK_STATE
android.permission.FOREGROUND_SERVICE
dev.hamza.betadvisor.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'

fail=0
perms=$(grep -o '<uses-permission[^>]*android:name="[^"]*"' "$M" | sed 's/.*android:name="\([^"]*\)"/\1/' | sort -u)
echo "Permissions:"
while read -r p; do
  if grep -qxF "$p" <<<"$ALLOWED"; then echo "  ok   $p"; else echo "  FAIL $p (not allowed)"; fail=1; fi
done <<<"$perms"
echo "Required:"
for need in android.permission.POST_NOTIFICATIONS \
  androidx.work.impl.background.systemjob.SystemJobService \
  androidx.work.impl.background.systemalarm.RescheduleReceiver \
  expo.modules.taskmanager.TaskJobService; do
  if grep -q "$need" "$M"; then echo "  ok   $need"; else echo "  FAIL missing $need"; fail=1; fi
done
exit $fail
