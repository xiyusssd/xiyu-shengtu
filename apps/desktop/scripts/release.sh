#!/usr/bin/env bash
# release.sh · 打包 + 签名 + 生成 latest.json
#
# 用法：
#   bash apps/desktop/scripts/release.sh
#   bash apps/desktop/scripts/release.sh --version 0.2.0    # 顺便改 version
#
# 前提：
#   密钥文件在 ~/.tauri/xiyu-shengtu.key（配套的公钥已嵌入 tauri.conf.json）

set -e

# 参数解析
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$SCRIPT_DIR/.."
cd "$APP_ROOT"

if [ ! -f "$HOME/.tauri/xiyu-shengtu.key" ]; then
  echo "✗ 找不到签名密钥 ~/.tauri/xiyu-shengtu.key"
  echo "  运行 cargo tauri signer generate --write-keys ~/.tauri/xiyu-shengtu.key 生成一次"
  exit 1
fi

# 载入 cargo
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi

# 可选：改版本号
if [ -n "$VERSION" ]; then
  echo "→ 更新版本号到 $VERSION"
  # tauri.conf.json
  sed -i.bak "s/\"version\": \"[0-9.]*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
  # Cargo.toml
  sed -i.bak "s/^version = \"[0-9.]*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
  # package.json
  node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
pkg.version = '$VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
  rm -f src-tauri/tauri.conf.json.bak src-tauri/Cargo.toml.bak
fi

CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo "→ 打包 v$CURRENT_VERSION"

# 用私钥打包（Tauri 会自动签名 .app.tar.gz）
# 新版 Tauri 认 TAURI_SIGNING_PRIVATE_KEY 里的字符串内容而非路径
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/xiyu-shengtu.key")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# 清老包（避免 dmg 里带旧版本）
rm -rf src-tauri/target/release/bundle/dmg src-tauri/target/release/bundle/macos

cargo tauri build 2>&1 | tail -5

# 产物路径
BUNDLE_DIR="src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_DIR/macos/xiyu-shengtu.app"
DMG_PATH="$BUNDLE_DIR/dmg/xiyu-shengtu_${CURRENT_VERSION}_aarch64.dmg"
TAR_PATH="$BUNDLE_DIR/macos/xiyu-shengtu.app.tar.gz"
SIG_PATH="$BUNDLE_DIR/macos/xiyu-shengtu.app.tar.gz.sig"

if [ ! -f "$DMG_PATH" ]; then
  echo "✗ 找不到 $DMG_PATH"
  exit 1
fi

# ad-hoc 自签名 · 让 macOS 至少不显示"损坏"
echo "→ ad-hoc 代码签名"
codesign --sign - --force --deep --options runtime "$APP_PATH" 2>&1

# 生成 latest.json（Tauri Updater 认这个 schema）
echo "→ 生成 latest.json"
SIGNATURE=""
if [ -f "$SIG_PATH" ]; then
  SIGNATURE=$(cat "$SIG_PATH")
fi

# GitHub Releases URL 模板 · 用户后面把 dmg + latest.json + .tar.gz 上传即可
DOWNLOAD_URL="https://github.com/xiyusssd/xiyu-shengtu/releases/download/v${CURRENT_VERSION}/xiyu-shengtu.app.tar.gz"
NOTES_FILE="RELEASE_NOTES.md"
NOTES="v${CURRENT_VERSION} 更新"
if [ -f "$APP_ROOT/../../$NOTES_FILE" ]; then
  NOTES=$(cat "$APP_ROOT/../../$NOTES_FILE")
fi

RELEASE_DIR="$BUNDLE_DIR/release"
mkdir -p "$RELEASE_DIR"
cat > "$RELEASE_DIR/latest.json" << JSON
{
  "version": "$CURRENT_VERSION",
  "notes": $(node -e "console.log(JSON.stringify(process.argv[1]))" "$NOTES"),
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIGNATURE",
      "url": "$DOWNLOAD_URL"
    },
    "darwin-x86_64": {
      "signature": "$SIGNATURE",
      "url": "$DOWNLOAD_URL"
    }
  }
}
JSON

# 把 dmg / tar.gz / sig / latest.json 汇总到 release 目录方便上传
cp "$DMG_PATH" "$RELEASE_DIR/"
[ -f "$TAR_PATH" ] && cp "$TAR_PATH" "$RELEASE_DIR/"
[ -f "$SIG_PATH" ] && cp "$SIG_PATH" "$RELEASE_DIR/"

echo ""
echo "✓ 打包完成"
echo "  产物：$RELEASE_DIR"
ls -lh "$RELEASE_DIR"
echo ""
echo "→ 下一步：把 $RELEASE_DIR 里的 3-4 个文件（.dmg / .app.tar.gz / .sig / latest.json）"
echo "  上传到 GitHub Releases v$CURRENT_VERSION，用户 App 里点检查更新就能拿到"
