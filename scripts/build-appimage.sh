#!/bin/sh
set -eu

APP_ID="com.arkdev.BudgetApp"
NODE_VERSION="26.9.0"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR="$ROOT_DIR/build/appimage"
APP_DIR="$BUILD_DIR/AppDir"

case "$(uname -m)" in
  x86_64)
    NODE_ARCH="x64"
    LINUXDEPLOY_ARCH="x86_64"
    ;;
  aarch64|arm64)
    NODE_ARCH="arm64"
    LINUXDEPLOY_ARCH="aarch64"
    ;;
  *)
    printf '%s\n' "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$APP_DIR"

NODE_ARCHIVE="$BUILD_DIR/node.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
LINUXDEPLOY="$BUILD_DIR/linuxdeploy"
LINUXDEPLOY_CONTINUOUS_URL="https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-${LINUXDEPLOY_ARCH}.AppImage"

echo "Building AppImage for $APP_ID on $(uname -m)..."
echo "Node.js version: $NODE_VERSION"

curl --fail --location --silent --show-error "$NODE_URL" -o "$NODE_ARCHIVE"
tar -xJf "$NODE_ARCHIVE" -C "$BUILD_DIR"
mv "$BUILD_DIR/node-v${NODE_VERSION}-linux-${NODE_ARCH}" "$APP_DIR/opt-node"

echo "Installing dependencies and building the app..."
cd "$ROOT_DIR"
npm ci
echo "Running build script..."
npm run build
echo "Copying app files to AppDir..."
mkdir -p "$APP_DIR/opt/budget-app"
cp -a dist assets style.css node_modules package.json package-lock.json "$APP_DIR/opt/budget-app/"
"$APP_DIR/opt-node/bin/npm" prune --omit=dev --prefix "$APP_DIR/opt/budget-app"
echo "Creating AppRun script..."
cat > "$APP_DIR/AppRun" <<'EOF'
#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$HERE/opt/budget-app"
exec "$HERE/opt-node/bin/node" --import node-gtk/register dist/main.js "$@"
EOF
chmod +x "$APP_DIR/AppRun"
echo "Creating desktop entry and icon..."
mkdir -p "$APP_DIR/usr/share/applications" "$APP_DIR/usr/share/metainfo" "$APP_DIR/usr/share/icons/hicolor/scalable/apps"
cp "$ROOT_DIR/flatpak/com.arkdev.BudgetApp.desktop" "$APP_DIR/usr/share/applications/$APP_ID.desktop"
cp "$ROOT_DIR/flatpak/com.arkdev.BudgetApp.metainfo.xml" "$APP_DIR/usr/share/metainfo/$APP_ID.metainfo.xml"
cp "$ROOT_DIR/assets/icons/$APP_ID.svg" "$APP_DIR/usr/share/icons/hicolor/scalable/apps/$APP_ID.svg"
echo "Downloading linuxdeploy..."
curl --fail --location --silent --show-error "$LINUXDEPLOY_CONTINUOUS_URL" -o "$LINUXDEPLOY"
chmod +x "$LINUXDEPLOY"
echo "Creating AppImage..."
cd "$ROOT_DIR"
APPIMAGE_EXTRACT_AND_RUN=1 "$LINUXDEPLOY" \
  --appdir "$APP_DIR" \
  --desktop-file "$APP_DIR/usr/share/applications/$APP_ID.desktop" \
  --icon-file "$APP_DIR/usr/share/icons/hicolor/scalable/apps/$APP_ID.svg" \
  --output appimage
