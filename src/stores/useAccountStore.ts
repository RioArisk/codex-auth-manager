import { create } from 'zustand';
import type { StoredAccount, AccountsStore, AppConfig, UsageInfo, CodexAuthConfig } from '../types';
import {
  loadAccountsStore,
  saveAccountsStore,
  switchToAccount as switchAccount,
  addAccount as addAccountToStore,
  removeAccount as removeAccountFromStore,
  updateAccountUsage as updateUsage,
  syncCurrentAccount as syncCurrent,
  isMissingIdentityError,
  refreshAccountsWorkspaceMetadata,
  type AddAccountOptions,
} from '../utils/storage';

interface AccountState {
  accounts: StoredAccount[];
  activeAccountId: string | null;
  config: AppConfig;
  isLoading: boolean;
  error: string | null;

  loadAccounts: () => Promise<void>;
  syncCurrentAccount: () => Promise<void>;
  addAccount: (authJson: string, alias?: string, options?: AddAccountOptions) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  switchToAccount: (accountId: string) => Promise<void>;
  updateUsage: (accountId: string, usage: UsageInfo) => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  refreshAllUsage: () => Promise<void>;
  setError: (message: string) => void;
  clearError: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  autoRefreshInterval: 30,
  codexPath: 'codex',
  closeBehavior: 'ask',
  theme: 'dark',
  hasInitialized: false,
  proxyEnabled: false,
  proxyUrl: 'http://127.0.0.1:7890',
  autoRestartCodexOnSwitch: false,
  skipSwitchRestartConfirm: false,
};

function buildStateFromStore(store: AccountsStore) {
  const activeAccount = store.accounts.find((account) => account.isActive);
  return {
    accounts: store.accounts,
    activeAccountId: activeAccount?.id ?? null,
    config: { ...DEFAULT_CONFIG, ...store.config },
  };
}

let latestLoadRequestId = 0;

function invalidatePendingLoads(): void {
  latestLoadRequestId += 1;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  activeAccountId: null,
  config: DEFAULT_CONFIG,
  isLoading: false,
  error: null,

  loadAccounts: async () => {
    const requestId = ++latestLoadRequestId;
    set({ isLoading: true, error: null });

    try {
      const initialStore = await loadAccountsStore();
      await syncCurrent();
      await refreshAccountsWorkspaceMetadata(initialStore.config);
      const finalStore = await loadAccountsStore();

      if (requestId !== latestLoadRequestId) {
        return;
      }

      set({
        ...buildStateFromStore(finalStore),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== latestLoadRequestId) {
        return;
      }

      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load accounts',
      });
    }
  },

  syncCurrentAccount: async () => {
    try {
      await syncCurrent();
      const store = await loadAccountsStore();
      set(buildStateFromStore(store));
    } catch (error) {
      console.error('Failed to sync current account:', error);
    }
  },

  addAccount: async (authJson: string, alias?: string, options?: AddAccountOptions) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      const authConfig = JSON.parse(authJson) as CodexAuthConfig;
      await addAccountToStore(authConfig, alias, options);
      const store = await loadAccountsStore();
      set({
        ...buildStateFromStore(store),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      if (isMissingIdentityError(error)) {
        set({ isLoading: false, error: null });
        throw error;
      }

      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to add account',
      });
      throw error;
    }
  },

  removeAccount: async (accountId: string) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      await removeAccountFromStore(accountId);
      const store = await loadAccountsStore();
      set({
        ...buildStateFromStore(store),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to remove account',
      });
    }
  },

  switchToAccount: async (accountId: string) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      await switchAccount(accountId);
      const store = await loadAccountsStore();
      set({
        ...buildStateFromStore(store),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to switch account',
      });
    }
  },

  updateUsage: async (accountId: string, usage: UsageInfo) => {
    try {
      await updateUsage(accountId, usage);
      const store = await loadAccountsStore();
      set(buildStateFromStore(store));
    } catch (error) {
      console.error('Failed to update usage:', error);
    }
  },

  updateConfig: async (config: Partial<AppConfig>) => {
    const store = await loadAccountsStore();
    const nextStore: AccountsStore = {
      ...store,
      config: {
        ...store.config,
        ...config,
      },
    };

    await saveAccountsStore(nextStore);
    set(buildStateFromStore(nextStore));
  },

  refreshAllUsage: async () => {
    console.log('Refreshing all usage...');
  },

  setError: (message: string) => set({ error: message }),
  clearError: () => set({ error: null }),
}));
