import { invoke } from '@tauri-apps/api/core';
import type { AccountsStore, StoredAccount, CodexAuthConfig, AppConfig } from '../types';
import { parseAccountInfo, generateId } from './jwt';

const DEFAULT_CONFIG: AppConfig = {
  autoRefreshInterval: 10, // 10分钟
  codexPath: 'codex',
  theme: 'dark',
};

const DEFAULT_STORE: AccountsStore = {
  version: '1.0.0',
  accounts: [],
  config: DEFAULT_CONFIG,
};

/**
 * 加载账号存储数据
 */
export async function loadAccountsStore(): Promise<AccountsStore> {
  try {
    const data = await invoke<string>('load_accounts_store');
    const store = JSON.parse(data) as AccountsStore;
    return {
      ...DEFAULT_STORE,
      ...store,
      config: { ...DEFAULT_CONFIG, ...store.config },
    };
  } catch (error) {
    console.log('No existing store found, using default:', error);
    return DEFAULT_STORE;
  }
}

/**
 * 保存账号存储数据
 */
export async function saveAccountsStore(store: AccountsStore): Promise<void> {
  const data = JSON.stringify(store, null, 2);
  await invoke('save_accounts_store', { data });
}

/**
 * 添加新账号
 */
export async function addAccount(
  authConfig: CodexAuthConfig,
  alias?: string
): Promise<StoredAccount> {
  const store = await loadAccountsStore();
  
  // 解析账号信息
  const accountInfo = parseAccountInfo(authConfig);
  
  // 检查是否已存在
  const existingIndex = store.accounts.findIndex(
    (acc) => acc.accountInfo.accountId === accountInfo.accountId
  );
  
  const now = new Date().toISOString();
  
  if (existingIndex >= 0) {
    // 更新现有账号
    store.accounts[existingIndex] = {
      ...store.accounts[existingIndex],
      authConfig,
      accountInfo,
      alias: alias || store.accounts[existingIndex].alias,
      updatedAt: now,
    };
    await saveAccountsStore(store);
    return store.accounts[existingIndex];
  }
  
  // 创建新账号
  const newAccount: StoredAccount = {
    id: generateId(),
    alias: alias || accountInfo.email.split('@')[0],
    authConfig,
    accountInfo,
    isActive: store.accounts.length === 0, // 第一个账号默认激活
    createdAt: now,
    updatedAt: now,
  };
  
  store.accounts.push(newAccount);
  await saveAccountsStore(store);
  
  return newAccount;
}

/**
 * 删除账号
 */
export async function removeAccount(accountId: string): Promise<void> {
  const store = await loadAccountsStore();
  store.accounts = store.accounts.filter((acc) => acc.id !== accountId);
  await saveAccountsStore(store);
}

/**
 * 更新账号用量信息
 */
export async function updateAccountUsage(
  accountId: string,
  usageInfo: StoredAccount['usageInfo']
): Promise<void> {
  const store = await loadAccountsStore();
  const account = store.accounts.find((acc) => acc.id === accountId);
  
  if (account) {
    account.usageInfo = usageInfo;
    account.updatedAt = new Date().toISOString();
    await saveAccountsStore(store);
  }
}

/**
 * 设置活动账号
 */
export async function setActiveAccount(accountId: string): Promise<void> {
  const store = await loadAccountsStore();
  
  store.accounts.forEach((acc) => {
    acc.isActive = acc.id === accountId;
  });
  
  await saveAccountsStore(store);
}

/**
 * 获取活动账号
 */
export async function getActiveAccount(): Promise<StoredAccount | null> {
  const store = await loadAccountsStore();
  return store.accounts.find((acc) => acc.isActive) || null;
}

/**
 * 切换到指定账号（写入.codex/auth.json）
 */
export async function switchToAccount(accountId: string): Promise<void> {
  const store = await loadAccountsStore();
  const account = store.accounts.find((acc) => acc.id === accountId);
  
  if (!account) {
    throw new Error('Account not found');
  }
  
  // 调用Tauri后端写入auth.json
  await invoke('write_codex_auth', {
    authConfig: JSON.stringify(account.authConfig),
  });
  
  // 更新活动状态
  await setActiveAccount(accountId);
}

/**
 * 从文件导入账号
 */
export async function importAccountFromFile(filePath: string): Promise<StoredAccount> {
  const content = await invoke<string>('read_file_content', { filePath });
  const authConfig = JSON.parse(content) as CodexAuthConfig;
  return addAccount(authConfig);
}

/**
 * 更新应用配置
 */
export async function updateAppConfig(config: Partial<AppConfig>): Promise<void> {
  const store = await loadAccountsStore();
  store.config = { ...store.config, ...config };
  await saveAccountsStore(store);
}

/**
 * 读取当前 .codex/auth.json 的账号ID
 */
export async function getCurrentAuthAccountId(): Promise<string | null> {
  try {
    const authJson = await invoke<string>('read_codex_auth');
    const authConfig = JSON.parse(authJson) as CodexAuthConfig;
    
    // 优先从 tokens.account_id 获取
    if (authConfig.tokens?.account_id) {
      return authConfig.tokens.account_id;
    }
    
    // 尝试从 JWT 解析
    if (authConfig.tokens?.id_token) {
      const accountInfo = parseAccountInfo(authConfig);
      return accountInfo.accountId;
    }
    
    return null;
  } catch (error) {
    console.log('Failed to read current auth:', error);
    return null;
  }
}

/**
 * 同步当前登录账号状态
 * 读取 .codex/auth.json 并与系统中的账号比对，更新 isActive 状态
 */
export async function syncCurrentAccount(): Promise<string | null> {
  const currentAccountId = await getCurrentAuthAccountId();
  
  if (!currentAccountId) {
    return null;
  }
  
  const store = await loadAccountsStore();
  let matchedId: string | null = null;
  let needsSave = false;
  
  // 遍历所有账号，找到匹配的并更新 isActive
  store.accounts.forEach((acc) => {
    const isMatch = acc.accountInfo.accountId === currentAccountId || 
                    acc.authConfig.tokens.account_id === currentAccountId;
    
    if (isMatch) {
      matchedId = acc.id;
      if (!acc.isActive) {
        acc.isActive = true;
        needsSave = true;
      }
    } else if (acc.isActive) {
      acc.isActive = false;
      needsSave = true;
    }
  });
  
  if (needsSave) {
    await saveAccountsStore(store);
  }
  
  return matchedId;
}