#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 5 ]; then
  echo "usage: $0 <.xcarchive-or-.app> [expected-bundle-id] [expected-display-name] [expected-version] [expected-build]" >&2
  exit 64
fi

input=$1
expected_bundle_id=${2:-app.ayahclip.mobile}
expected_display_name=${3:-AyahClip}
expected_version=${4:-}
expected_build=${5:-}
is_archive=0

case "$input" in
  *.xcarchive)
    is_archive=1
    app_path=$(find "$input/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)
    ;;
  *.app)
    app_path=$input
    ;;
  *)
    echo "identity check failed: expected an .xcarchive or .app path" >&2
    exit 65
    ;;
esac

if [ -z "${app_path:-}" ] || [ ! -f "$app_path/Info.plist" ]; then
  echo "identity check failed: no embedded application Info.plist found" >&2
  exit 66
fi

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")
display_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$app_path/Info.plist")
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Info.plist")
build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Info.plist")

if [ "$bundle_id" != "$expected_bundle_id" ]; then
  echo "identity check failed: bundle ID is '$bundle_id', expected '$expected_bundle_id'" >&2
  exit 67
fi

if [ "$display_name" != "$expected_display_name" ]; then
  echo "identity check failed: display name is '$display_name', expected '$expected_display_name'" >&2
  exit 68
fi

if [ "$bundle_id" = 'com.scanauctions.app' ] || [ "$display_name" = 'ScanAuctions' ]; then
  echo "identity check failed: ScanAuctions metadata was found in the AyahClip artifact" >&2
  exit 69
fi

if [ -n "$expected_version" ] && [ "$version" != "$expected_version" ]; then
  echo "identity check failed: version is '$version', expected '$expected_version'" >&2
  exit 70
fi

if [ -n "$expected_build" ] && [ "$build" != "$expected_build" ]; then
  echo "identity check failed: build is '$build', expected '$expected_build'" >&2
  exit 71
fi

if [ "$is_archive" -eq 1 ]; then
  extension_plist="$app_path/PlugIns/AyahClipShare.appex/Info.plist"
  if [ ! -f "$extension_plist" ]; then
    echo "identity check failed: AyahClip Share extension is missing from the archive" >&2
    exit 72
  fi
  extension_bundle=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$extension_plist")
  extension_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$extension_plist")
  if [ "$extension_bundle" != 'app.ayahclip.mobile.share' ] || \
     [ "$extension_name" != 'Import to AyahClip' ]; then
    echo "identity check failed: unexpected Share extension '$extension_name' ($extension_bundle)" >&2
    exit 73
  fi
fi

echo "verified app identity: $display_name $version ($build), $bundle_id, executable $executable"
