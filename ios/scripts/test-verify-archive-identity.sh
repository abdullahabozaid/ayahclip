#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
verifier="$script_dir/verify-archive-identity.sh"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT INT TERM

archive="$temporary/AyahClip.xcarchive"
app="$archive/Products/Applications/AyahClip.app"
extension="$app/PlugIns/AyahClipShare.appex"
mkdir -p "$extension"

make_plist() {
  path=$1
  bundle=$2
  name=$3
  executable=$4
  plutil -create xml1 "$path"
  plutil -insert CFBundleIdentifier -string "$bundle" "$path"
  plutil -insert CFBundleDisplayName -string "$name" "$path"
  plutil -insert CFBundleExecutable -string "$executable" "$path"
  plutil -insert CFBundleShortVersionString -string '0.1.0' "$path"
  plutil -insert CFBundleVersion -string '3' "$path"
}

make_plist "$app/Info.plist" 'app.ayahclip.mobile' 'AyahClip' 'AyahClip'
make_plist "$extension/Info.plist" 'app.ayahclip.mobile.share' 'Import to AyahClip' 'AyahClipShare'

"$verifier" "$archive" 'app.ayahclip.mobile' 'AyahClip' '0.1.0' '3' >/dev/null

if "$verifier" "$archive" 'app.ayahclip.mobile' 'AyahClip' '0.1.0' '4' >/dev/null 2>&1; then
  echo 'identity test failed: verifier accepted the wrong build' >&2
  exit 1
fi

plutil -replace CFBundleIdentifier -string 'com.scanauctions.app' "$app/Info.plist"
plutil -replace CFBundleDisplayName -string 'ScanAuctions' "$app/Info.plist"
if "$verifier" "$archive" 'app.ayahclip.mobile' 'AyahClip' '0.1.0' '3' >/dev/null 2>&1; then
  echo 'identity test failed: verifier accepted ScanAuctions metadata' >&2
  exit 1
fi

echo 'archive identity verifier tests passed'
