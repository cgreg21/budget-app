#!/bin/sh
set -eu

NODE_VERSION="22.14.0"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR="$ROOT_DIR/build/macos-arm64"
APP="$BUILD_DIR/Budget App.app"
NODE_ARCHIVE="$BUILD_DIR/node.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.xz"

if [ "$(uname -m)" != "arm64" ]; then
  printf '%s\n' 'This target must be built on Apple Silicon (arm64).' >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

curl --fail --location --silent --show-error "$NODE_URL" -o "$NODE_ARCHIVE"
tar -xJf "$NODE_ARCHIVE" -C "$BUILD_DIR"
mv "$BUILD_DIR/node-v${NODE_VERSION}-darwin-arm64" "$BUILD_DIR/node"

cd "$ROOT_DIR"
"$BUILD_DIR/node/bin/npm" ci
"$BUILD_DIR/node/bin/npm" run build

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"
cp -a dist assets style.css node_modules package.json package-lock.json "$APP/Contents/Resources/app/"
cp assets/icons/com.arkdev.BudgetApp.svg "$APP/Contents/Resources/com.arkdev.BudgetApp.svg"
"$BUILD_DIR/node/bin/npm" prune --omit=dev --prefix "$APP/Contents/Resources/app"
cp -a "$BUILD_DIR/node" "$APP/Contents/Resources/node"

cat > "$APP/Contents/MacOS/budget-app" <<'EOF'
#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$HERE/Resources/app"
exec "$HERE/Resources/node/bin/node" --import node-gtk/register dist/main.js "$@"
EOF
chmod +x "$APP/Contents/MacOS/budget-app"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Budget App</string>
  <key>CFBundleExecutable</key>
  <string>budget-app</string>
  <key>CFBundleIdentifier</key>
  <string>com.arkdev.BudgetApp</string>
  <key>CFBundleName</key>
  <string>Budget App</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleIconFile</key>
  <string>com.arkdev.BudgetApp.svg</string>
</dict>
</plist>
EOF

cd "$ROOT_DIR"
rm -f 'Budget-App-macos-arm64.zip'
ditto -c -k --sequesterRsrc --keepParent "$APP" 'Budget-App-macos-arm64.zip'
printf 'Created %s\n' "$ROOT_DIR/Budget-App-macos-arm64.zip"
