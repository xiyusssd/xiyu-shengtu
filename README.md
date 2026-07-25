# xiyu-shengtu · 网页版生图

个人本地 AI 生图工具。目前包含 3 个可用形态：

- **`apps/studio`**（3210）— 生图工作台（批量表格结构 + img2img）
- **`apps/toolbox-web`**（3211）— Provider 渠道管理界面（cc-switch 风双栏）
- **`apps/toolbox-cli`** — 命令行工具箱（无参数进入交互菜单）

三者共享 `~/.imagegen/config.json`，任何一端改配置，另外两端立即生效。

## 快速开始

```bash
pnpm install

# 起两个网页应用（Studio + Toolbox）
pnpm dev
# → Studio  http://localhost:3210
# → Toolbox http://localhost:3211

# 或者只起其一
pnpm dev:studio
pnpm dev:toolbox
```

## Studio · 生图（3210）

- 单页批量表结构：每行「参考图 + 提示词 + 结果缩略」
- 顶栏选 Provider / 尺寸预设 / 并发（1~10，默认 5）
- 底部悬浮"批量生成"，一键跑所有有效行
- 参考图存在则自动走 Provider 的 img2img 通道
- 快捷键：`⌘/Ctrl + Enter` 触发（单行时）

## Toolbox · Provider 管理（3211）

cc-switch 风双栏界面：

- **左栏**：Provider 卡片列表，单击选中；卡片左侧圆钮"设为当前"，绿色对号 = 使用中
- **右栏**：编辑面板，改显示名 / Endpoint / 模型 / API Key
- **顶栏**：`+ 添加 Provider`（弹出向导）+ 刷新
- **右栏底部**：测试连通性 · 保存 · 复制一份 · 删除

一键切换 Provider 后，Studio 下一次生图立即用新渠道，无需重启。

## CLI · 也可用（apps/toolbox-cli）

```bash
pnpm cli                      # 无参数 → 交互主菜单
pnpm cli provider list        # 表格列出所有 provider（含中文对齐）
pnpm cli provider test        # 测当前 provider 连通性
```

## 配置目录

默认 `~/.imagegen/config.json`。可用 `IMAGEGEN_HOME=/tmp/foo` 覆盖。

⚠️ MVP 阶段 API Key 明文存储，请勿把 `~/.imagegen/` 同步到公共云盘或 Git 仓库。

## Provider 类型

- `mock` — 离线占位，支持 text2img 和 img2img（把参考图叠在占位图里）
- `openai-compat` — OpenAI `/v1/images/generations` + `/v1/images/edits`，兼容 One-API / New-API / 硅基流动 / 火山方舟兼容层
