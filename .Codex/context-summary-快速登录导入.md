## 项目上下文摘要（快速登录导入）
生成时间：2026-03-27 14:45:00

### 1. 相似实现分析
- **实现1**: `src/App.tsx`
  - 模式：界面层集中编排账号导入、同步当前账号、错误提示与初始化流程
  - 可复用：`handleAddAccount`、`syncCurrentCodexAccount`、`identityConfirm` 状态机
  - 需注意：导入后要继续复用 `addAccount` 与 `syncCurrentAccount`，不能另起一套账号落地逻辑

- **实现2**: `src/utils/storage.ts`
  - 模式：所有账号导入、去重、元数据刷新都统一走存储层
  - 可复用：`addAccount`、`loadAccountsStore`、`saveAccountsStore`、`refreshAccountsWorkspaceMetadata`
  - 需注意：重复账号更新、身份缺失确认、workspace metadata 拉取都已经在这里实现

- **实现3**: `src-tauri/src/lib.rs`
  - 模式：Tauri 命令集中提供本地文件读写、当前 auth 读取、用量查询与 watcher
  - 可复用：`get_codex_auth_path`、`read_codex_auth`、`write_codex_auth`、时间戳辅助函数
  - 需注意：新增快速登录命令时要遵循现有 `#[tauri::command]` 导出方式，并保持返回值可直接被前端 `invoke` 消费

### 2. 项目约定
- **命名约定**: React 组件使用 PascalCase，状态与函数使用 camelCase，Tauri 命令使用 snake_case
- **文件组织**: 前端 UI 在 `src/components`，页面编排在 `src/App.tsx`，Tauri 逻辑在 `src-tauri/src/lib.rs`
- **导入顺序**: 先第三方，再本地类型/工具/组件
- **代码风格**: TypeScript 使用显式类型别名与接口；Rust 使用 `Result<_, String>` 暴露错误

### 3. 可复用组件清单
- `src/utils/storage.ts`: 账号导入、去重、auth 持久化
- `src/stores/useAccountStore.ts`: 应用级状态与异步动作
- `src/hooks/useAutoRefresh.ts`: 用量刷新与当前账号同步
- `src/components/ConfirmDialog.tsx`: 风险确认弹窗

### 4. 测试策略
- **前端验证**: 使用现有 `npm run build` 与 `npm run lint` 做类型和静态检查
- **后端验证**: 在 `src-tauri/src/lib.rs` 内补纯函数单元测试，覆盖命令路径解析、auth 变更检测、超时参数归一化
- **覆盖重点**: 登录流程成功、命令缺失、超时未登录、重复导入与身份缺失确认

### 5. 依赖和集成点
- **外部依赖**: Tauri Shell 能力、系统内的 `codex` CLI、用户目录下的 `.codex/auth.json`
- **内部依赖**: `App.tsx -> useAccountStore -> storage.ts -> Tauri invoke`
- **集成方式**: 前端调用 `start_codex_login`，后端启动 `codex login` 并轮询 auth 变化
- **配置来源**: `AppConfig.codexPath`、`AppConfig.proxyEnabled`、`AppConfig.proxyUrl`

### 6. 技术选型理由
- **为什么复用 Codex CLI**: 当前仓库已具备 Shell 权限和 `codexPath` 配置，改动范围更小，且贴近参考项目行为
- **优势**: 无需自建 OAuth 回调链路；直接复用本机已工作的登录方式
- **风险**: 本机缺少 `codex` 或 Rust 工具链时，需要明确报错并在验证报告中说明

### 7. 关键风险点
- **并发问题**: 用户重复点击快速登录可能导致重复流程，需要前端状态弹层阻止误操作
- **边界条件**: `auth.json` 先存在但内容未变化、登录进程提前退出、导入后身份信息不足
- **性能瓶颈**: 轮询 `auth.json` 频率需保守，避免高频 I/O
- **兼容性**: Windows 下 `codex` 可能表现为 `.cmd`、`.exe` 或 `.ps1`，需要统一解析
