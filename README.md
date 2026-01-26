# Codex Auth Manager (Codex Manager)

一个用于管理多个 OpenAI Codex 账号的 Windows 桌面应用（Tauri + React）。

## 功能特点

- 🔄 **一键切换账号**：在多个 Codex 账号之间快速切换，自动写入 `.codex/auth.json`
- 📊 **用量监控**：通过 `wham/usage` API 获取 5 小时 / 周限额信息
- 🎯 **智能推荐**：基于周限额剩余量自动推荐最充足账号
- ⏰ **自动刷新**：可设置自动刷新间隔（分钟）
- 🧩 **本地存储**：账号与配置均保存到本地文件

## 技术栈

- **前端**：React + TypeScript + TailwindCSS
- **后端**：Tauri (Rust)
- **状态管理**：Zustand

## 环境要求（Windows）

1. **Node.js**：建议 v18+
2. **Rust**：通过 rustup 安装
3. **Tauri 依赖**：
   - WebView2（Windows 10/11 通常已自带）
   - Visual Studio Build Tools（安装 “Desktop development with C++”）
   - Windows 10/11 SDK（随 VS Build Tools 勾选安装）

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发（Tauri）
npm run tauri dev

# 构建安装包
npm run tauri build
```

> 也可以使用 `npm run tauri:dev` / `npm run tauri:build`，效果一致。

## 使用说明

### 添加账号

1. 点击右上角的 **“添加账号”**
2. 选择以下方式之一：
   - **粘贴 JSON**：复制 `%USERPROFILE%\.codex\auth.json` 内容
   - **选择文件**：直接选择本地 `auth.json`
   - **导入当前账号**：自动读取当前已登录的 Codex 配置

### 切换账号

点击账号卡片 **“切换到此账号”**：
1. 将该账号的配置写入 `%USERPROFILE%\.codex\auth.json`
2. 标记该账号为当前活动账号

### 刷新用量

- 刷新单个账号：卡片上的刷新按钮
- 刷新全部账号：顶部 **“刷新全部”**

> 用量数据来自 `https://chatgpt.com/backend-api/wham/usage`。
> 若账号缺少有效 token 或无 Codex 访问权限，将显示“暂无用量数据”。

### 设置

- 自动刷新间隔（分钟）：设置为 0 可禁用自动刷新

## 数据与隐私

数据全部保存在本地文件中（**不会上传**），但目前为 **明文 JSON** 存储：

- **账号列表与配置**：`%LOCALAPPDATA%\codex-manager\accounts.json`
- **账号凭据**：`%USERPROFILE%\.codex_manager\auths\{accountId}.json`
- **当前 Codex 配置**：`%USERPROFILE%\.codex\auth.json`
- **用量来源**：`https://chatgpt.com/backend-api/wham/usage`（使用本地账号 token）

## 已知限制

- 用量时间显示目前固定按 **UTC+8** 计算（后续可改为本地时区）
- 用量查询依赖 `wham/usage` 接口与账号 token，网络不可用或 token 失效会导致刷新失败

## 项目结构

```
codex-manager/
├── src/                    # React 前端源码
├── src-tauri/              # Tauri 后端源码
└── package.json
```

## License

当前仓库未附带 LICENSE。若需要开源许可，请补充对应 LICENSE 文件。
