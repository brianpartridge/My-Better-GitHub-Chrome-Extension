#!/usr/bin/env bash
# Installs My Better GitHub in Chrome or Safari.
#
#   ./install.sh           Asks which browser.
#   ./install.sh chrome    Copies the extension folder path and opens Chrome's
#                          extensions page. Chrome has no way to load an
#                          unpacked extension from a script, so the last steps
#                          are manual.
#   ./install.sh safari    Builds the Safari app with Xcode, copies it to
#                          /Applications, and opens it once so Safari sees it.
#
# Safari settings, as environment variables:
#   MBG_TEAM_ID        Apple Developer team ID to sign with. Default: the team
#                      of the first "Apple Development" certificate in your
#                      keychain. Set it to "none" to sign for local use only.
#                      Safari then needs "Allow unsigned extensions".
#   MBG_INSTALL_DIR    Where to put the app. Default: /Applications, or
#                      ~/Applications when /Applications is not writable.
#   MBG_DERIVED_DATA   Xcode build folder. Default: safari/build.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION="$ROOT/extension"
APP_NAME="My Better GitHub"
PROJECT="$ROOT/safari/$APP_NAME.xcodeproj"
BROWSER=""

say() { printf '%s\n' "$*"; }
fail() { say "install.sh: $*" >&2; exit 1; }

choose_browser() {
  case "${1:-}" in
    chrome | safari) BROWSER="$1"; return ;;
    "") ;;
    *) fail "unknown browser \"$1\". Use chrome or safari." ;;
  esac
  [ -t 0 ] || fail "no browser given. Run: ./install.sh chrome|safari"
  say "Which browser do you want to install the extension in?"
  say "  1) Chrome"
  say "  2) Safari"
  while true; do
    read -r -p "Enter 1 or 2: " answer
    case "$answer" in
      1 | [Cc]hrome) BROWSER=chrome; return ;;
      2 | [Ss]afari) BROWSER=safari; return ;;
    esac
  done
}

install_chrome() {
  say "Chrome loads the extension from this folder:"
  say "  $EXTENSION"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$EXTENSION" | pbcopy
    say "The path is on your clipboard."
  fi
  say
  say "1. In Chrome, open chrome://extensions"
  say "2. Turn on Developer mode, at the top right."
  say "3. Click Load unpacked and choose the folder above."
  say "   If the extension is already loaded, click its reload icon instead."
  say "   If its card points at the repository root rather than extension/,"
  say "   remove it and load the folder above. The code moved in version 1.3.3."
  say "4. Reload any open GitHub tabs."
  if [ "$(uname)" = Darwin ] && open -Ra "Google Chrome" 2>/dev/null; then
    open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
  fi
}

# Prints the team ID of the first valid Apple Development certificate, or nothing.
# The team ID is the certificate's OU. The ID in its name is the developer's.
detect_team() {
  local name
  name="$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$name" ] || return 0
  security find-certificate -c "$name" -p 2>/dev/null \
    | openssl x509 -noout -subject 2>/dev/null \
    | sed -n 's/.*OU *= *\([A-Z0-9]*\).*/\1/p' | head -n 1
}

install_safari() {
  [ "$(uname)" = Darwin ] || fail "Safari runs only on macOS."
  xcodebuild -version >/dev/null 2>&1 \
    || fail "Xcode is required. Install it, then run: sudo xcode-select -s /Applications/Xcode.app"

  local version derived team unsigned=0
  version="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$EXTENSION/manifest.json")"
  derived="${MBG_DERIVED_DATA:-$ROOT/safari/build}"
  team="${MBG_TEAM_ID:-$(detect_team)}"

  local -a signing
  if [ -z "$team" ] || [ "$team" = none ]; then
    unsigned=1
    signing=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=)
    say "No Apple Development certificate found. Signing the app for local use only."
  else
    signing=(CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$team")
    say "Signing the app with team $team."
  fi

  say "Building $APP_NAME $version with Xcode. The first build takes about a minute."
  xcodebuild -project "$PROJECT" -scheme "$APP_NAME" -configuration Release \
    -destination "generic/platform=macOS" \
    -derivedDataPath "$derived" MARKETING_VERSION="$version" "${signing[@]}" \
    build -quiet 2>&1 | { grep -v ' \[MT\] ' || true; }  # Drops Xcode's own log noise.
  local app="$derived/Build/Products/Release/$APP_NAME.app"
  [ -d "$app" ] || fail "the build finished, but $app is missing."

  local dir="${MBG_INSTALL_DIR:-}"
  if [ -z "$dir" ]; then
    if [ -w /Applications ]; then dir=/Applications; else dir="$HOME/Applications"; fi
  fi
  mkdir -p "$dir"
  local target="$dir/$APP_NAME.app"
  # Copy the new app beside the old one first, so a failed copy, such as a
  # full disk, leaves the installed app untouched. Then swap the two with
  # renames, and keep the old app until the new one is in place.
  local staged="$dir/.$APP_NAME.app.new" backup="$dir/.$APP_NAME.app.old"
  rm -rf "$staged" "$backup"
  if ! ditto "$app" "$staged"; then
    rm -rf "$staged"
    fail "could not copy the app to $dir. The installed app, if any, is unchanged."
  fi
  if pkill -x "$APP_NAME" 2>/dev/null; then
    # Wait for the old copy to exit. Opening the new one too soon fails.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      pgrep -x "$APP_NAME" >/dev/null || break
      sleep 0.5
    done
  fi
  if [ -e "$target" ] && ! mv "$target" "$backup"; then
    rm -rf "$staged"
    fail "could not move the installed app aside. It is unchanged."
  fi
  if ! mv "$staged" "$target"; then
    [ -e "$backup" ] && mv "$backup" "$target"
    rm -rf "$staged"
    fail "could not put the new app at $target. The previous app is back in place."
  fi
  rm -rf "$backup"
  say "Installed $target"

  # Safari lists every copy of the app that macOS knows about, so a build copy
  # left here would show the extension twice. Forget it and delete it.
  local lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
  if [ -x "$lsregister" ]; then "$lsregister" -u "$app" >/dev/null 2>&1 || true; fi
  rm -rf "$app" "${app%/*}/$APP_NAME Extension.appex"

  # Safari lists the extension only after the app has run once.
  local opened=0
  for _ in 1 2 3; do
    if open "$target" 2>/dev/null; then opened=1; break; fi
    sleep 1
  done
  [ "$opened" = 1 ] || say "Could not open the app. Open it once by hand, so Safari lists the extension."
  say
  say "Next, in Safari:"
  if [ "$unsigned" = 1 ]; then
    say "1. Turn on the Develop menu: Safari > Settings > Advanced > Show features for web developers."
    say "2. Choose Develop > Developer Settings, then turn on Allow unsigned extensions."
    say "   Safari turns this off again when it quits."
  fi
  say "- Choose Safari > Settings > Extensions and turn on $APP_NAME."
  say "- Allow it on github.com when Safari asks."
  say "- Reload any open GitHub tabs."
}

choose_browser "${1:-}"
case "$BROWSER" in
  chrome) install_chrome ;;
  safari) install_safari ;;
esac
