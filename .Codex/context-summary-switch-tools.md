## 项目上下文摘要（切换工具与自动重启）
生成时间：2026-04-22 10:25:00

### 1. 相似实现分析
- **实现1**: C:\Users\JCS\Desktop\codex-auth-manager\src\components\Header.tsx
  - 模式：头部操作按钮 + 下拉菜单
  - 可复用：现有“快速登录/导入备份”菜单展开模式
  - 需注意：按钮状态由 App 统一下发，适合新增“小工具”入口

- **实现2**: C:\Users\JCS\Desktop\codex-auth-manager\src\components\CloseBehaviorDialog.tsx
  - 模式：带单选/复选状态的确认弹窗
  - 可复用：首次确认 + “记住选择” 的交互模型
  - 需注意：组件内部自管 UI 状态，适合改造为“切换并重启 Codex”确认弹窗

- **实现3**: C:\Users\JCS\Desktop\codex-auth-manager\src\components\SettingsModal.tsx
  - 模式：设置面板字段编辑并统一 onSave
  - 可复用：新增布尔配置项的存取路径
  - 需注意：需要同步更新 AppConfig、默认配置与 store 合并逻辑

- **实现4**: C:\Users\JCS\Desktop\codex-auth-manager\src-tauri\src\lib.rs
  - 模式：Tauri command + Windows 进程拉起（start_codex_login）
  - 可复用：Command 启动外部进程、Windows 下创建无窗口/普通窗口的处理方式
  - 需注意：仓库 CI 在 macOS 上执行 cargo check，新命令必须保证非 Windows 也可编译

### 2. 项目约定
- **命名约定**: 前端 camelCase；React props 使用 onXxx / isXxx；Rust 结构体内部 snake_case，前端通信用 serde camelCase
- **文件组织**: 组件在 src/components；全局状态在 src/stores；文件/账号操作在 src/utils；Tauri 命令集中在 src-tauri/src/lib.rs
- **导入顺序**: React / 第三方 / 本地模块
- **代码风格**: 函数式 React + hooks；后端 Result<String, String> 返回错误；配置默认值集中定义

### 3. 可复用组件清单
- `C:\Users\JCS\Desktop\codex-auth-manager\src\components\Header.tsx`: 头部操作区与悬浮菜单
- `C:\Users\JCS\Desktop\codex-auth-manager\src\components\CloseBehaviorDialog.tsx`: 带复选框确认弹窗模式
- `C:\Users\JCS\Desktop\codex-auth-manager\src\components\ConfirmDialog.tsx`: 简单确认弹窗
- `C:\Users\JCS\Desktop\codex-auth-manager\src\utils\storage.ts`: AppConfig 默认值与 store 读写
- `C:\Users\JCS\Desktop\codex-auth-manager\src-tauri\src\lib.rs`: 写入 `.codex/auth.json`、读取文件、启动 codex 登录进程

### 4. 测试策略
- **测试框架**: 前端当前主要靠 `eslint` + `tsc/vite build`；Rust 有 `cargo test --lib`
- **参考文件**: `C:\Users\JCS\Desktop\codex-auth-manager\src-tauri\src\lib.rs` 内置单元测试
- **覆盖要求**: 本次至少保证 `npm run lint`、`npm run build`、`cargo fmt --all`；Rust 编译/测试受本机缺少 link.exe 限制时需留痕

### 5. 依赖和集成点
- **外部依赖**: Tauri API、PowerShell、Windows 进程模型、GitHub Actions
- **内部依赖**: App -> Header/SettingsModal；App -> store/updateConfig；Rust command -> 前端 invoke
- **集成方式**: 新增设置字段写入 accounts store；切换账号后条件调用 Rust 重启命令；工具按钮调用本地 `.codex/.env` 同步逻辑
- **配置来源**: `accounts.json` 中的 `config` 字段；用户主目录 `C:\Users\JCS\.codex\.env`

### 6. 技术选型理由
- **为什么用这个方案**: 复用现有 Settings + Header + Tauri command，避免新增复杂状态层
- **优势**: 改动集中、前后端职责清晰、后续可继续向“小工具菜单”扩展
- **劣势和风险**: CLI Codex 进程形态不稳定，只能按“Codex 相关进程”近似匹配；无法可靠判断会话进行中，因此必须保留首次确认弹窗

### 7. 关键风险点
- **并发问题**: 切换账号 + 自动重启可能与现有刷新并发，提示文案需要明确
- **边界条件**: `.codex/.env` 不存在、已有其他环境变量、未运行任何 Codex 进程、仅运行桌面版或仅运行 CLI
- **性能瓶颈**: 进程枚举依赖 PowerShell/WMI，频率低可接受
- **安全考虑**: 本次仅针对本地已知 `.codex` 与 Codex 相关进程操作
