# 网页版生图工具 · 项目计划书

**版本**：v0.1 草案
**日期**：2026-07-24
**作者**：Kiro & xiyu
**定位**：个人本地使用为主，未来可扩展至团队/SaaS

---

## 1. 项目概览

本项目交付两个相互解耦、通过本地配置目录握手的工具：

| 编号 | 名称 | 形态 | 职责 |
|-----|-----|-----|-----|
| ① | **ImageGen Studio**（生图主站） | Next.js 全栈网页应用 | 提示词编辑、参数配置、生图、图库管理、历史记录 |
| ② | **Provider Toolbox**（API 工具箱） | Tauri 桌面应用 + Node CLI 双形态 | 管理多组 AI 图像 API 凭据、Profile 切换、连通性测试、导入导出 |

两者共享同一个本地目录 `~/.imagegen/`，配置写入即生效，无需主站重启。

## 2. 需求梳理

### 2.1 用户核心诉求

- 一个"能画图的网页"，输入 Prompt 就出图
- 支持切换多家 API（火山方舟、通义万相、文心、OpenAI 兼容、SD-WebUI/ComfyUI、Replicate、自定义 HTTP）
- Key 管理不能塞进主站前端源码里，要有独立的"工具箱"负责
- 个人本地跑，最低运维成本

### 2.2 功能清单（MVP）

**生图主站**：
- 文本生图（必选）
- 图生图 / 局部重绘（Provider 支持时启用）
- 参数面板：尺寸、步数、CFG、Seed、Negative Prompt、批量数
- 生成中进度流式回显（SSE）
- 本地图库：SQLite 存元数据 + 文件系统存 PNG/JPG
- 历史 Prompt 回填、收藏、标签、批量导出
- Provider 快速切换（下拉选择当前 Profile / Provider）

**工具箱**：
- 增删改查 Provider 凭据
- 多 Profile（工作/个人/测试）
- 一键连通性测试（发送一张 32×32 的测试图请求）
- 导入导出配置（JSON，密钥可选加密）
- Provider 模板库（预置国内外主流服务的表单模板）
- CLI 与 GUI 功能对等

### 2.3 非目标（本轮不做）

- 多用户、账号系统、权限
- 计费、额度、发票
- 云端图库同步
- 视频生成（预留 Provider 接口，实现放后续）
- 移动端适配（响应式做到"能用"即可）

## 3. 系统架构

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│  ImageGen Studio (Next.js)  │    │  Provider Toolbox           │
│                             │    │  ┌──────────┐  ┌─────────┐  │
│  ┌──────────┐  ┌─────────┐  │    │  │ Tauri GUI│  │  Node   │  │
│  │  React   │  │ API      │  │    │  │          │  │  CLI    │  │
│  │  UI      │←→│ Routes   │  │    │  └────┬─────┘  └────┬────┘  │
│  └──────────┘  └────┬─────┘  │    │       │             │       │
│                     │        │    │       └──────┬──────┘       │
└─────────────────────┼────────┘    └──────────────┼──────────────┘
                      │                             │
                      ▼                             ▼
              ┌───────────────────────────────────────┐
              │      ~/.imagegen/  (共享数据目录)      │
              │                                       │
              │  ├── config.json    Profile & Provider│
              │  ├── secrets.enc    加密后的 API Key  │
              │  ├── studio.db      SQLite 元数据库   │
              │  ├── images/        生成的图片        │
              │  └── logs/          日志              │
              └───────────────────────────────────────┘
                              ▲
                              │ 依赖
              ┌───────────────┴───────────────┐
              │ packages/provider-core        │
              │  统一 Provider 抽象接口       │
              │  两个工具共享的唯一强耦合点   │
              └───────────────────────────────┘
```

### 3.1 关键架构决策

| 决策项 | 选择 | 理由 |
|-------|-----|-----|
| Web 框架 | Next.js 15 App Router | 一体化开发，API Routes 处理服务端逻辑，SSE 支持好 |
| 桌面外壳 | Tauri 2 | 包体 ~10MB（Electron ~100MB），冷启动快 |
| CLI 层 | 独立 Node CLI | 面向脚本/CI 用户，npm 全局安装即用 |
| 数据存储 | SQLite（better-sqlite3） | 单文件、零运维、同步 API 直接在 API Route 用 |
| 密钥存储 | Keychain 优先 / AES-256-GCM 兜底 | macOS 用 Keychain，其他平台走主密码派生 |
| Provider 抽象 | 独立 npm 包 `provider-core` | 两工具唯一强耦合点，隔离在 monorepo 一个包里 |

## 4. 通用适配层（Provider Core）

### 4.1 统一接口

```typescript
// packages/provider-core/src/types.ts
export interface ImageProvider {
  readonly id: string;              // 'openai-compat', 'volcano-ark', ...
  readonly displayName: string;
  readonly capabilities: Capability[];  // text2img | img2img | inpaint | upscale

  validate(cfg: ProviderConfig): Promise<ValidationResult>;
  generate(req: GenerateRequest, ctx: RunContext): AsyncIterable<GenerateEvent>;
}

export interface GenerateRequest {
  prompt: string;
  negativePrompt?: string;
  size: { w: number; h: number };
  steps?: number;
  cfg?: number;
  seed?: number;
  batchSize?: number;
  initImage?: Blob;          // 图生图
  maskImage?: Blob;          // 局部重绘
  extra?: Record<string, unknown>;  // Provider 私有参数
}

export type GenerateEvent =
  | { type: 'progress'; percent: number; preview?: Blob }
  | { type: 'image'; blob: Blob; seed: number; meta: ImageMeta }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' };
```

### 4.2 Provider 注册表（首批实现）

| ID | 覆盖服务 | 优先级 |
|----|---------|-------|
| `openai-compat` | OpenAI DALL·E / One-API / New-API 中转 / 硅基流动 | M2 |
| `volcano-ark` | 火山方舟豆包生图 | M4 |
| `alibaba-wanx` | 通义万相 | M4 |
| `baidu-wenxin` | 百度文心一格 | M4 |
| `tencent-hunyuan` | 腾讯混元生图 | M4 |
| `sd-webui` | AUTOMATIC1111 本地/远程 | M4 |
| `comfyui` | ComfyUI 工作流 API | M4 |
| `replicate` | Replicate 云托管模型 | M4 |
| `custom-http` | JMESPath 映射的自定义 HTTP | M4 |

`custom-http` 是兜底方案：用户在工具箱里填 endpoint、headers、请求体模板、响应字段路径，无需改代码即可接入任意兼容 REST 的图像服务。

### 4.3 配置文件结构

```jsonc
// ~/.imagegen/config.json
{
  "version": 1,
  "activeProfile": "personal",
  "profiles": {
    "personal": {
      "activeProvider": "my-openai",
      "providers": {
        "my-openai": {
          "type": "openai-compat",
          "displayName": "个人 OpenAI",
          "endpoint": "https://api.openai.com/v1",
          "model": "dall-e-3",
          "apiKeyRef": "secret://personal/my-openai",
          "extra": { "quality": "hd" }
        },
        "local-sd": {
          "type": "sd-webui",
          "endpoint": "http://127.0.0.1:7860",
          "model": "sd_xl_base_1.0",
          "apiKeyRef": null
        }
      }
    }
  },
  "preferences": {
    "outputDir": "~/.imagegen/images",
    "language": "zh-CN",
    "theme": "system"
  }
}
```

密钥单独存放在 `secrets.enc`，用 Argon2id 从主密码派生 KEK，AES-256-GCM 加密。macOS 上如果启用 Keychain，`secrets.enc` 只存索引，值放系统钥匙串。

## 5. 生图主站（ImageGen Studio）

### 5.1 页面结构

```
/                     首页：Prompt 编辑器 + 参数面板 + 结果画布
/gallery              图库：网格视图，支持筛选、标签、批量导出
/history              历史：按时间线展开，可回填参数
/templates            提示词模板：保存/复用/分享（本地）
/settings             偏好设置：主题、输出目录、语言（Provider 由工具箱管）
```

### 5.2 API Routes

| 路由 | 方法 | 说明 |
|-----|-----|-----|
| `/api/providers` | GET | 列出可用 Provider（从 config.json 读） |
| `/api/generate` | POST | 提交生图任务，返回 SSE 流 |
| `/api/history` | GET | 分页读取历史 |
| `/api/history/:id` | DELETE | 删除记录（可选保留文件） |
| `/api/images/:id` | GET | 提供本地图片文件 |
| `/api/templates` | GET/POST/PUT/DELETE | Prompt 模板 CRUD |

### 5.3 生图数据流

```
Client              API Route              Provider           Local FS
  │                    │                       │                  │
  ├─POST /generate────►│                       │                  │
  │                    ├─load config──────────►│                  │
  │                    ├─call provider────────►│                  │
  │◄─SSE progress──────┤◄─progress event───────┤                  │
  │◄─SSE progress──────┤◄─progress event───────┤                  │
  │                    │◄─image blob───────────┤                  │
  │                    ├─save png─────────────────────────────────►
  │                    ├─insert sqlite row                        │
  │◄─SSE image url─────┤                                          │
  │◄─SSE done──────────┤                                          │
```

### 5.4 UI 技术栈

- **样式**：Tailwind CSS v4
- **组件**：shadcn/ui（可直接改源码，避免版本锁死）
- **状态**：Zustand（轻量）+ TanStack Query（服务端状态）
- **表单**：react-hook-form + zod
- **图片**：next/image 走本地 loader，指向 `/api/images/:id`

## 6. 工具箱（Provider Toolbox）

### 6.1 双形态共享内核

```
apps/toolbox-gui       Tauri GUI（日常使用）
apps/toolbox-cli       Node CLI（脚本/CI）
      │                       │
      └───────┬───────────────┘
              ▼
      packages/toolbox-core   核心逻辑：CRUD、加密、测试连通性
              ▼
      packages/provider-core  统一 Provider 抽象
```

### 6.2 GUI 布局

```
┌────────────────────────────────────────────────┐
│  Profile: [personal ▾]  [+ 新建] [导入] [导出] │
├────────────────────────────────────────────────┤
│  Providers                                     │
│  ┌──────────────────────────────────────────┐  │
│  │ ✓ my-openai       OpenAI 兼容    [测试]  │  │
│  │ ✓ volcano-doubao  火山方舟       [测试]  │  │
│  │ ⚠ local-sd        SD WebUI       [测试]  │  │
│  │ [+ 添加 Provider]                        │  │
│  └──────────────────────────────────────────┘  │
├────────────────────────────────────────────────┤
│  当前激活：my-openai                            │
│  最近测试：2 分钟前 · 延迟 1.2s · ✓ 成功       │
└────────────────────────────────────────────────┘
```

### 6.3 CLI 命令

```bash
imagegen-toolbox provider list
imagegen-toolbox provider add --type openai-compat --interactive
imagegen-toolbox provider test <id>
imagegen-toolbox provider remove <id>

imagegen-toolbox profile list
imagegen-toolbox profile use <name>
imagegen-toolbox profile export --out backup.json --with-secrets

imagegen-toolbox doctor          # 自检：目录权限、Keychain 可用性、SQLite 版本
```

### 6.4 Provider 模板

`packages/toolbox-core/templates/*.json` 描述每类 Provider 的表单字段（label、type、required、default、验证规则），GUI 与 CLI 都基于此生成表单/交互提示，新增 Provider 无需改前端代码。

## 7. 目录结构

```
webgen-imagegen/                    (monorepo, pnpm workspaces)
├── apps/
│   ├── studio/                     Next.js 生图主站
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   ├── toolbox-gui/                Tauri 应用
│   │   ├── src/                    前端（React）
│   │   └── src-tauri/              Rust 侧
│   └── toolbox-cli/                Node CLI
│       └── src/
├── packages/
│   ├── provider-core/              统一 Provider 抽象
│   │   ├── src/providers/          各 Provider 实现
│   │   └── src/types.ts
│   ├── toolbox-core/               工具箱共享逻辑
│   │   ├── src/config-store.ts
│   │   ├── src/secrets.ts
│   │   └── templates/
│   └── shared/                     通用工具（logger、path、schema）
├── docs/
│   ├── PLAN.md                     本文档
│   ├── PROVIDER-SPEC.md            Provider 接入规范
│   └── SECURITY.md                 密钥存储/加密说明
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── biome.json
```

## 8. 技术选型汇总

| 层级 | 选型 | 备选 | 备注 |
|-----|-----|-----|-----|
| 语言 | TypeScript 5.x | — | 全栈统一 |
| Web 框架 | Next.js 15 (App Router) | Remix | 生态最广、SSE 原生 |
| UI | Tailwind v4 + shadcn/ui | Chakra | 可改源码 |
| 前端状态 | Zustand + TanStack Query | Redux Toolkit | 轻量足够 |
| 桌面外壳 | Tauri 2 | Electron | 包体积 & 安全 |
| CLI | commander + prompts + chalk | oclif | 成熟无重依赖 |
| 数据库 | SQLite（better-sqlite3） | LowDB | 同步 API 好用 |
| 加密 | @noble/ciphers + argon2 | node:crypto | 纯 JS 无原生依赖 |
| 钥匙串 | keytar（可选） | — | 未装则降级到主密码 |
| HTTP 客户端 | undici | node-fetch | Node 20+ 内置更优 |
| 测试 | Vitest + Playwright | Jest | Vitest 速度快 |
| 包管理 | pnpm | npm/yarn | monorepo 首选 |
| Lint/Format | Biome | ESLint+Prettier | 单工具一站式 |

## 9. 开发路线图

### M1 · 骨架（1-2 天）
- pnpm workspace 建仓，配 tsconfig / biome / vitest
- `provider-core` 空实现 + 类型定义 + `mock` provider（返回本地占位图）
- `toolbox-core` 的 `config-store` / `secrets`（先明文，加密留 M5）
- Studio 首页跑通"输入 Prompt → 调 mock → 展示图片"
- Tauri GUI 骨架 + CLI 骨架，能读写 config.json
- **交付**：`pnpm dev` 打开网页能出一张占位图

### M2 · 第一家真 Provider（2 天）
- 实现 `openai-compat` provider（覆盖 OpenAI、One-API、New-API、硅基流动）
- 工具箱 GUI/CLI 加"添加 Provider"表单，走模板 schema
- 连通性测试功能（发 32×32 请求，5s 超时）
- **交付**：能用自己的 OpenAI Key 真实出图

### M3 · 主站完整工作台（2-3 天）
- 参数面板、SSE 进度、Gallery、History、Templates 全部完成
- SQLite schema + 迁移脚本
- 图生图 / 局部重绘（Provider 支持时启用）
- **交付**：日常可用的个人生图工作台

### M4 · 扩展 Provider 生态（2-3 天）
- 火山方舟、通义万相、文心、混元、SD-WebUI、ComfyUI、Replicate
- `custom-http` 通用适配器（JMESPath 映射）
- 工具箱 `doctor` 自检命令
- **交付**：9 类 Provider 全部可切换

### M5 · 安全与打包（1-2 天）
- Keychain 集成 + 主密码流程
- 配置导入/导出（可选加密包）
- Tauri 打包 dmg，CLI 发 npm
- **交付**：可分发的正式版

**总工作量**：约 10 人日，单人推进预计 3 周。

## 10. 风险与对策

| 风险 | 对策 |
|-----|-----|
| 各家 Provider 参数差异大 | `extra` 字段兜底 + `custom-http` 万能适配 |
| API Key 泄露 | Keychain 优先，日志脱敏（写入前 mask），前端永不出现明文 |
| 本地端口冲突 | 启动前探测，自动 +1 递增 |
| SQLite 并发 | 开启 WAL 模式，写入串行化 |
| 图片存储膨胀 | 可选 WebP 转码 + 定期清理未收藏项 |
| Next.js API Route 阻塞 | 生图走独立 worker（node:worker_threads）或队列 |
| Tauri 与 CLI 逻辑漂移 | 强制走 `toolbox-core`，Tauri/CLI 只做壳 |

## 11. 交付清单

- `apps/studio` — 可通过 `pnpm dev` 启动的生图主站
- `apps/toolbox-gui` — Tauri 打包后的 dmg/exe
- `apps/toolbox-cli` — npm 发布的全局 CLI
- `packages/provider-core` — 独立可复用的 Provider 抽象包
- `~/.imagegen/` 目录规范文档
- `docs/PROVIDER-SPEC.md` — 第三方接入指南
- README / 快速上手视频（可选）

## 12. 后续扩展方向

- 视频生成（复用 Provider 抽象，加 `video` capability）
- LoRA / Checkpoint 管理面板（SD-WebUI/ComfyUI 场景）
- Prompt 工程助手（接大模型做提示词改写）
- 局域网多机共享：把 `~/.imagegen/` 放 NAS，多台电脑共用同一份配置与图库
- 插件系统：让第三方以 `provider-core` 接口发布自己的 Provider 包

## 13. 已确认的关键决策（2026-07-24）

| # | 项 | 决定 | 备注 |
|---|----|-----|-----|
| 1 | 仓库名 | `xiyu-shengtu` | monorepo 根目录名 |
| 2 | CLI 命令名 | `shengtu-tool` | 全局注册为 `shengtu-tool xxx` |
| 3 | 数据目录 | `~/.imagegen/` | 默认路径不变 |
| 4 | 密钥存储 | **不加密**，明文 JSON | 单机个人使用，接受风险；后续需要时再补 |
| 5 | CLI 与 GUI 关系 | **独立发布**，两个包互不依赖二进制 | 共享 `toolbox-core` 逻辑包 |

> ⚠️ 关于第 4 条：`~/.imagegen/config.json` 会以明文保存 API Key。请勿把此目录同步到公共云盘或 Git 仓库。计划书里"密码 123456"仅作为 M5 之后可选的启用加密时的默认主密码占位，MVP 阶段不启用。

---

## 14. M1 立即执行清单

以下顺序进入编码阶段：

1. 建 monorepo 骨架：`package.json` / `pnpm-workspace.yaml` / `tsconfig.base.json` / `biome.json` / `.gitignore`
2. `packages/provider-core`：类型定义 + `mock` provider（返回本地占位图）
3. `packages/toolbox-core`：`config-store`（明文 JSON 读写）+ Provider 模板 loader
4. `apps/toolbox-cli`：`shengtu-tool provider add/list/test/remove` + `profile use`
5. `apps/studio`（Next.js 15）：首页 Prompt 输入 → 调 mock → 展示图片；SSE 骨架
6. `apps/toolbox-gui`（Tauri）：留空 stub 目录，M1 尾部再补（不阻塞主链路）

**M1 完成标准**：`pnpm dev` 启动 Studio；`shengtu-tool provider add` 手动加一条 mock 配置；网页输入 Prompt 出一张占位图。


