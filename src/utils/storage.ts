import { invoke } from '@tauri-apps/api/core';
import type { AccountsStore, StoredAccount, CodexAuthConfig, AppConfig, AccountInfo } from '../types';
import { parseAccountInfo, generateId } from './jwt';

const DEFAULT_CONFIG: AppConfig = {
  autoRefreshInterval: 30, // 30分钟
  codexPath: 'codex',
  theme: 'dark',
  hasInitialized: false,
  proxyEnabled: false,
  proxyUrl: 'http://127.0.0.1:7890',
};

const DEFAULT_STORE: AccountsStore = {
  version: '1.0.0',
  accounts: [],
  config: DEFAULT_CONFIG,
};

type LegacyStoredAccount = StoredAccount & { authConfig?: CodexAuthConfig };

export type AddAccountOptions = {
  allowMissingIdentity?: boolean;
};

type AccountIdentity = {
  accountId: string | null;
  userId: string | null;
  email: string | null;
};

function normalizeId(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'unknown') return null;
  if (!trimmed.includes('@')) return null;
  return trimmed.toLowerCase();
}

function buildIdentityFromAccountInfo(accountInfo: AccountInfo): AccountIdentity {
  return {
    accountId: normalizeId(accountInfo.accountId),
    userId: normalizeId(accountInfo.userId),
    email: normalizeEmail(accountInfo.email),
  };
}

function buildIdentityFromAuthConfig(authConfig: CodexAuthConfig): AccountIdentity {
  let accountInfo: AccountInfo | null = null;
  try {
    accountInfo = parseAccountInfo(authConfig);
  } catch (error) {
    console.log('Failed to parse auth token for identity:', error);
  }

  return {
    accountId: normalizeId(accountInfo?.accountId ?? authConfig.tokens?.account_id),
    userId: normalizeId(accountInfo?.userId),
    email: normalizeEmail(accountInfo?.email),
  };
}

function isEmptyIdentity(identity: AccountIdentity): boolean {
  return !identity.accountId && !identity.userId && !identity.email;
}

function isIdentityInsufficient(identity: AccountIdentity): boolean {
  return !identity.userId && !identity.email;
}

function getMatchRank(a: AccountIdentity, b: AccountIdentity): number {
  if (a.accountId && b.accountId && a.userId && b.userId) {
    if (a.accountId === b.accountId && a.userId === b.userId) return 5;
  }
  if (a.accountId && b.accountId && a.email && b.email) {
    if (a.accountId === b.accountId && a.email === b.email) return 4;
  }
  if (a.userId && b.userId && a.userId === b.userId) return 3;
  if (a.email && b.email && a.email === b.email) return 2;
  if (a.accountId && b.accountId && a.accountId === b.accountId) return 1;
  return 0;
}

function findBestMatch(
  accounts: StoredAccount[],
  identity: AccountIdentity
): { index: number; rank: number; count: number } {
  let bestIndex = -1;
  let bestRank = 0;
  let bestUpdatedAt = '';
  let bestCount = 0;

  accounts.forEach((account, index) => {
    const rank = getMatchRank(buildIdentityFromAccountInfo(account.accountInfo), identity);
    if (rank === 0) return;
    if (rank > bestRank) {
      bestRank = rank;
      bestIndex = index;
      bestUpdatedAt = account.updatedAt;
      bestCount = 1;
      return;
    }
    if (rank === bestRank) {
      bestCount += 1;
      if (!bestUpdatedAt || account.updatedAt > bestUpdatedAt) {
        bestIndex = index;
        bestUpdatedAt = account.updatedAt;
      }
    }
  });

  return { index: bestIndex, rank: bestRank, count: bestCount };
}

const MISSING_IDENTITY_ERROR = 'missing_account_identity';

function createMissingIdentityError(): Error {
  const error = new Error(MISSING_IDENTITY_ERROR);
  error.name = 'MissingAccountIdentity';
  return error;
}

export function isMissingIdentityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === MISSING_IDENTITY_ERROR || error.name === 'MissingAccountIdentity';
}

function buildFallbackAccountInfo(identity: AccountIdentity): AccountInfo {
  return {
    email: identity.email ?? 'Unknown',
    planType: 'free',
    accountId: identity.accountId ?? '',
    userId: identity.userId ?? '',
    subscriptionActiveUntil: undefined,
    organizations: [],
  };
}

async function saveAccountAuth(accountId: string, authConfig: CodexAuthConfig): Promise<void> {
  await invoke('save_account_auth', {
    accountId,
    authConfig: JSON.stringify(authConfig),
  });
}

async function loadAccountAuth(accountId: string): Promise<CodexAuthConfig> {
  const authJson = await invoke<string>('read_account_auth', { accountId });
  return JSON.parse(authJson) as CodexAuthConfig;
}

async function deleteAccountAuth(accountId: string): Promise<void> {
  await invoke('delete_account_auth', { accountId });
}

/**
 * 加载账号存储数据
 */
export async function loadAccountsStore(): Promise<AccountsStore> {
  try {
    const data = await invoke<string>('load_accounts_store');
    const store = JSON.parse(data) as AccountsStore & { accounts?: LegacyStoredAccount[] };
    const accounts = store.accounts ?? [];
    let needsSave = false;

    const normalizedAccounts: StoredAccount[] = [];

    for (const account of accounts) {
      if (account.authConfig) {
        await saveAccountAuth(account.id, account.authConfig);
        needsSave = true;
      }
      const { authConfig, ...rest } = account;
      normalizedAccounts.push(rest);
    }

    const normalizedStore: AccountsStore = {
      ...DEFAULT_STORE,
      ...store,
      accounts: normalizedAccounts,
      config: { ...DEFAULT_CONFIG, ...store.config },
    };

    if (needsSave) {
      await saveAccountsStore(normalizedStore);
    }

    return normalizedStore;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Store file not found')) {
      console.log('No existing store found, using default:', error);
      return DEFAULT_STORE;
    }
    throw error;
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
  alias?: string,
  options: AddAccountOptions = {}
): Promise<StoredAccount> {
  const store = await loadAccountsStore();

  let accountInfo: AccountInfo;
  try {
    accountInfo = parseAccountInfo(authConfig);
  } catch (error) {
    const identity = buildIdentityFromAuthConfig(authConfig);
    if (!options.allowMissingIdentity) {
      throw createMissingIdentityError();
    }
    accountInfo = buildFallbackAccountInfo(identity);
  }

  const newIdentity = buildIdentityFromAccountInfo(accountInfo);
  if (isIdentityInsufficient(newIdentity) && !options.allowMissingIdentity) {
    throw createMissingIdentityError();
  }
  
  // 检查是否已存在
  const match = findBestMatch(store.accounts, newIdentity);
  const existingIndex = match.rank >= 2 ? match.index : -1;
  
  const now = new Date().toISOString();
  
  if (existingIndex >= 0) {
    const existingAccount = store.accounts[existingIndex];
    await saveAccountAuth(existingAccount.id, authConfig);

    // 更新现有账号
    store.accounts[existingIndex] = {
      ...existingAccount,
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
    accountInfo,
    isActive: store.accounts.length === 0, // 第一个账号默认激活
    createdAt: now,
    updatedAt: now,
  };
  
  await saveAccountAuth(newAccount.id, authConfig);
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
  await deleteAccountAuth(accountId);
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
  
  const authConfig = await loadAccountAuth(accountId);

  // 调用Tauri后端写入auth.json
  await invoke('write_codex_auth', {
    authConfig: JSON.stringify(authConfig),
  });
  
  // 更新活动状态
  await setActiveAccount(accountId);
}

/**
 * 从文件导入账号
 */
export async function importAccountFromFile(
  filePath: string,
  options: AddAccountOptions = {}
): Promise<StoredAccount> {
  const content = await invoke<string>('read_file_content', { filePath });
  const authConfig = JSON.parse(content) as CodexAuthConfig;
  return addAccount(authConfig, undefined, options);
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

    const identity = buildIdentityFromAuthConfig(authConfig);
    return identity.accountId ?? null;
  } catch (error) {
    console.log('Failed to read current auth:', error);
    return null;
  }
}

/**
 * 同步当前登录账号状态
 * 读取 .codex/auth.json 并与系统中的账号比对，更新 isActive 状态
 * 如果 auth.json 不存在，则清除所有账号的 isActive 状态
 */
export async function syncCurrentAccount(): Promise<string | null> {
  let currentIdentity: AccountIdentity | null = null;
  try {
    const authJson = await invoke<string>('read_codex_auth');
    const authConfig = JSON.parse(authJson) as CodexAuthConfig;
    currentIdentity = buildIdentityFromAuthConfig(authConfig);
  } catch (error) {
    console.log('Failed to read current auth:', error);
  }
  const store = await loadAccountsStore();
  let matchedId: string | null = null;
  let needsSave = false;
  
  // 如果 auth.json 不存在或无法获取账号ID，清除所有账号的激活状态
  if (!currentIdentity || isEmptyIdentity(currentIdentity)) {
    store.accounts.forEach((acc) => {
      if (acc.isActive) {
        acc.isActive = false;
        needsSave = true;
      }
    });
    
    if (needsSave) {
      await saveAccountsStore(store);
    }
    
    return null;
  }
  
  let bestRank = 0;
  let bestIndexes: number[] = [];

  store.accounts.forEach((acc, index) => {
    const rank = getMatchRank(buildIdentityFromAccountInfo(acc.accountInfo), currentIdentity);
    if (rank === 0) return;
    if (rank > bestRank) {
      bestRank = rank;
      bestIndexes = [index];
      return;
    }
    if (rank === bestRank) {
      bestIndexes.push(index);
    }
  });

  if (bestRank === 0 || bestIndexes.length === 0) {
    store.accounts.forEach((acc) => {
      if (acc.isActive) {
        acc.isActive = false;
        needsSave = true;
      }
    });

    if (needsSave) {
      await saveAccountsStore(store);
    }

    return null;
  }

  let targetIndex = bestIndexes[0];
  const activeIndex = bestIndexes.find((index) => store.accounts[index].isActive);
  if (typeof activeIndex === 'number') {
    targetIndex = activeIndex;
  } else {
    targetIndex = bestIndexes.reduce((best, index) => {
      const bestTime = store.accounts[best].updatedAt;
      const currentTime = store.accounts[index].updatedAt;
      return currentTime > bestTime ? index : best;
    }, bestIndexes[0]);
  }

  store.accounts.forEach((acc, index) => {
    const shouldBeActive = index === targetIndex;
    if (acc.isActive !== shouldBeActive) {
      acc.isActive = shouldBeActive;
      needsSave = true;
    }
    if (shouldBeActive) {
      matchedId = acc.id;
    }
  });
  
  if (needsSave) {
    await saveAccountsStore(store);
  }
  
  return matchedId;
}
