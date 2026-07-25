# 发布指南 · xiyu-shengtu

## 首次准备（只做一次）

### 1. 签名密钥

Tauri Updater 用 EdDSA 签名保证更新包完整性。密钥已在本机生成：

```
~/.tauri/xiyu-shengtu.key      私钥（打包用，勿泄漏、勿入库）
~/.tauri/xiyu-shengtu.key.pub  公钥（已嵌入 tauri.conf.json）
```

公钥内容也会随 App 发出去。**丢了私钥 = 以后没法给旧用户推更新**，务必备份到密码管理器。

### 2. GitHub 仓库

- 建仓库（例如 `xiyu/xiyu-shengtu`），把项目推上去
- 在 `apps/desktop/src-tauri/tauri.conf.json` 里改 endpoint 为你的仓库地址
- 私钥字符串加到 GitHub Actions Secrets：
  - `TAURI_SIGNING_PRIVATE_KEY` → `cat ~/.tauri/xiyu-shengtu.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → 空串（如果生成时未设密码）

### 3. 首次发布

在项目根跑：

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions 会：
1. 分别在 macOS Apple Silicon / Intel 上编译打包
2. 上传 `.dmg / .app.tar.gz / .sig` 到 Release
3. 汇总生成 `latest.json` 并上传到同一 Release

发布完成后，装了 App 的用户下次开或点"检查更新"就会看到新版本。

## 日常发新版

**推荐 · 用 CI**（省事）：

```bash
# 顺手 bump 版本号（可选）
bash apps/desktop/scripts/release.sh --version 0.2.0
git add -A && git commit -m "release: 0.2.0"

# 打 tag 触发 CI
git tag v0.2.0
git push origin main --tags
```

**本机手动打**（应急 · 只出 Apple Silicon 版）：

```bash
bash apps/desktop/scripts/release.sh --version 0.2.0
# 产物在 apps/desktop/src-tauri/target/release/bundle/release/
```

然后手动到 GitHub Releases 页新建 v0.2.0 tag，把 `release/` 里 4 个文件都上传上去。

## 用户端体验

- 装了 App 的用户，打开 App 后进 **设置 → 更新 → 检查** 就能看到新版本
- 弹层显示当前版本 → 新版本 + release notes
- 点"升级到 vX"自动下载 → 校验签名 → 解压覆盖 → 提示重启
- 用户第一次装：右键 `.app` → 打开 → 确认（ad-hoc 签名，Gatekeeper 会问一次）

## 版本号约定

`X.Y.Z`：X 大改架构、Y 加新功能、Z 修 bug。

## 常见坑

- **忘了嵌入公钥**：新装的 App 打不开 updater。检查 `tauri.conf.json` 里 `plugins.updater.pubkey`
- **私钥换了**：老用户的 App 无法验证新签名，只能重装。所以私钥要长期保存
- **endpoint 写错**：check() 会 404，Toast 里能看到具体错。改 `plugins.updater.endpoints` 重打包
- **ad-hoc 签名 + Gatekeeper**：用户拿到 .dmg 第一次装可能看到"未验证的开发者"。右键"打开"一次即可，以后不再问。上 Apple Developer Program 可彻底消除此提示
