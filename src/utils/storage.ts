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

type AccountWorkspaceMetadata = {
  workspaceName?: string | null;
  accountUserId?: string | null;
  accountStructure?: AccountInfo['accountStructure'];
  planType?: AccountInfo['planType'] | null;
};

type AccountBackupEntry = {
  alias?: string;
  authConfig: CodexAuthConfig;
};

type AccountsBackupFile = {
  format: 'codex-manager-backup';
  version: '1.0.0';
  exportedAt: string;
  accounts: AccountBackupEntry[];
};

function normalizePlanType(
  value: string | null | undefined
): AccountInfo['planType'] | null {
  switch (value) {
    case 'free':
    case 'plus':
    case 'pro':
    case 'team':
      return value;
    default:
      return null;
  }
}

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
  // 当两者都有 accountId 且不同时，属于不同工作空间（如个人 vs Team），
  // 即使 email/userId 相同也不应视为同一账号
  if (a.accountId && b.accountId && a.accountId !== b.accountId) return 0;

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
    accountUserId: undefined,
    accountStructure: undefined,
    workspaceName: undefined,
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

function parseAccountsBackup(data: string): AccountsBackupFile {
  let parsed: Partial<AccountsBackupFile>;
  try {
    parsed = JSON.parse(data) as Partial<AccountsBackupFile>;
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }

  if (parsed.format !== 'codex-manager-backup') {
    throw new Error('无效的备份格式');
  }

  if (!Array.isArray(parsed.accounts)) {
    throw new Error('备份文件缺少账号列表');
  }

  parsed.accounts.forEach((account, index) => {
    if (!account?.authConfig?.tokens?.id_token) {
      throw new Error(`备份文件中的第 ${index + 1} 个账号缺少有效凭证`);
    }
  });

  return {
    format: 'codex-manager-backup',
    version: '1.0.0',
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    accounts: parsed.accounts,
  };
}
function mergeWorkspaceMetadata(
  accountInfo: AccountInfo,
  metadata: AccountWorkspaceMetadata | null | undefined
): AccountInfo {
  if (!metadata) return accountInfo;

  const currentPlanType = normalizePlanType(accountInfo.planType) ?? 'free';
  const metadataPlanType = normalizePlanType(metadata.planType);
  const accountStructure = metadata.accountStructure ?? accountInfo.accountStructure;

  let mergedPlanType = currentPlanType;
  if (metadataPlanType) {
    if (accountStructure === 'workspace') {
      mergedPlanType = metadataPlanType;
    } else if (currentPlanType === 'free' && metadataPlanType !== 'free') {
      mergedPlanType = metadataPlanType;
    }
  }

  return {
    ...accountInfo,
    accountUserId: metadata.accountUserId ?? accountInfo.accountUserId,
    accountStructure,
    workspaceName: metadata.workspaceName ?? accountInfo.workspaceName,
    planType: mergedPlanType,
  };
}

async function fetchWorkspaceMetadata(
  accountId: string,
  config: AppConfig
): Promise<AccountWorkspaceMetadata | null> {
  try {
    return await invoke<AccountWorkspaceMetadata | null>('get_wham_account_metadata', {
      accountId,
      proxyEnabled: config.proxyEnabled,
      proxyUrl: config.proxyUrl,
    });
  } catch (error) {
    console.log(`Failed to fetch workspace metadata for account ${accountId}:`, error);
    return null;
  }
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
      const normalizedAccount = { ...account } as StoredAccount & { authConfig?: CodexAuthConfig };
      delete normalizedAccount.authConfig;
      normalizedAccounts.push(normalizedAccount);
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

export async function exportAccountsBackup(): Promise<string> {
  const store = await loadAccountsStore();

  const accounts = await Promise.all(
    store.accounts.map(async (account) => ({
      alias: account.alias || undefined,
      authConfig: await loadAccountAuth(account.id),
    }))
  );

  const backup: AccountsBackupFile = {
    format: 'codex-manager-backup',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    accounts,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importAccountsBackup(
  backupJson: string
): Promise<{ importedCount: number }> {
  const backup = parseAccountsBackup(backupJson);

  for (const account of backup.accounts) {
    await addAccount(account.authConfig, account.alias, { allowMissingIdentity: true });
  }

  return { importedCount: backup.accounts.length };
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
  } catch {
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
    const workspaceMetadata = await fetchWorkspaceMetadata(existingAccount.id, store.config);
    const enrichedAccountInfo = mergeWorkspaceMetadata(accountInfo, workspaceMetadata);

    // 更新现有账号
    store.accounts[existingIndex] = {
      ...existingAccount,
      accountInfo: enrichedAccountInfo,
      alias: alias || store.accounts[existingIndex].alias,
      updatedAt: now,
    };
    await saveAccountsStore(store);
    return store.accounts[existingIndex];
  }
  
  // 创建新账号
  // 同邮箱不同工作空间时自动添加计划类型后缀以区分
  let autoAlias = alias || accountInfo.email.split('@')[0];
  if (!alias) {
    const newEmail = normalizeEmail(accountInfo.email);
    const hasSameEmail = newEmail && store.accounts.some(
      (acc) => normalizeEmail(acc.accountInfo.email) === newEmail
    );
    if (hasSameEmail) {
      const planLabel = accountInfo.planType.charAt(0).toUpperCase() + accountInfo.planType.slice(1);
      autoAlias = `${autoAlias} (${planLabel})`;
    }
  }

  const newAccount: StoredAccount = {
    id: generateId(),
    alias: autoAlias,
    accountInfo,
    isActive: store.accounts.length === 0, // 第一个账号默认激活
    createdAt: now,
    updatedAt: now,
  };
  
  await saveAccountAuth(newAccount.id, authConfig);
  const workspaceMetadata = await fetchWorkspaceMetadata(newAccount.id, store.config);
  newAccount.accountInfo = mergeWorkspaceMetadata(newAccount.accountInfo, workspaceMetadata);
  store.accounts.push(newAccount);
  await saveAccountsStore(store);
  
  return newAccount;
}

export async function refreshAccountsWorkspaceMetadata(config: AppConfig): Promise<StoredAccount[]> {
  const store = await loadAccountsStore();
  let changed = false;

  const updatedAccounts = await Promise.all(
    store.accounts.map(async (account) => {
      let baseAccountInfo = account.accountInfo;
      try {
        const authConfig = await loadAccountAuth(account.id);
        const parsedAccountInfo = parseAccountInfo(authConfig);
        baseAccountInfo = {
          ...account.accountInfo,
          ...parsedAccountInfo,
          accountStructure: account.accountInfo.accountStructure,
          workspaceName: account.accountInfo.workspaceName,
        };
      } catch (error) {
        console.log(`Failed to reload account info from auth for account ${account.id}:`, error);
      }

      const metadata = await fetchWorkspaceMetadata(account.id, config);
      const accountInfo = mergeWorkspaceMetadata(baseAccountInfo, metadata);

      if (JSON.stringify(accountInfo) === JSON.stringify(account.accountInfo)) {
        return account;
      }

      changed = true;
      return {
        ...account,
        accountInfo,
      };
    })
  );

  if (changed) {
    store.accounts = updatedAccounts;
    await saveAccountsStore(store);
  }

  return changed ? updatedAccounts : store.accounts;
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
