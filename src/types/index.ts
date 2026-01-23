// Codex auth.json 文件结构
export interface CodexAuthConfig {
  OPENAI_API_KEY: string | null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh: string;
}

// 从JWT解析出的账号信息
export interface AccountInfo {
  email: string;
  planType: 'free' | 'plus' | 'pro' | 'team';
  accountId: string;
  userId: string;
  subscriptionActiveUntil?: string;
  organizations?: Array<{
    id: string;
    title: string;
    role: string;
  }>;
}

// 用量信息
export interface UsageInfo {
  contextWindow?: {
    percentLeft: number;
    used: string;
    total: string;
  };
  fiveHourLimit: {
    percentLeft: number;
    resetTime: string;
  };
  weeklyLimit: {
    percentLeft: number;
    resetTime: string;
  };
  lastUpdated: string;
  sourceFile?: string;
}

// 存储的账号数据
export interface StoredAccount {
  id: string;
  alias: string; // 用户自定义别名
  accountInfo: AccountInfo;
  usageInfo?: UsageInfo;
  isActive: boolean; // 是否是当前激活账号
  createdAt: string;
  updatedAt: string;
}

// 应用配置
export interface AppConfig {
  autoRefreshInterval: number; // 自动刷新间隔（分钟）
  codexPath: string; // Codex CLI路径
  theme: 'dark' | 'light';
  hasInitialized: boolean; // 是否已尝试过首次自动同步
}

// 账号存储文件结构
export interface AccountsStore {
  version: string;
  accounts: StoredAccount[];
  config: AppConfig;
}
