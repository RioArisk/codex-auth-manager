import { create } from 'zustand';
import type { StoredAccount, AccountsStore, AppConfig, UsageInfo } from '../types';
import { 
  loadAccountsStore, 
  saveAccountsStore, 
  switchToAccount as switchAccount,
  addAccount as addAccountToStore,
  removeAccount as removeAccountFromStore,
  updateAccountUsage as updateUsage,
  syncCurrentAccount as syncCurrent,
} from '../utils/storage';

interface AccountState {
  // 状态
  accounts: StoredAccount[];
  activeAccountId: string | null;
  config: AppConfig;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadAccounts: () => Promise<void>;
  syncCurrentAccount: () => Promise<void>;
  addAccount: (authJson: string, alias?: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  switchToAccount: (accountId: string) => Promise<void>;
  updateUsage: (accountId: string, usage: UsageInfo) => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  refreshAllUsage: () => Promise<void>;
  clearError: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  config: {
    autoRefreshInterval: 10,
    codexPath: 'codex',
    theme: 'dark',
  },
  isLoading: false,
  error: null,
  
  loadAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const store = await loadAccountsStore();
      const activeAccount = store.accounts.find(a => a.isActive);
      set({ 
        accounts: store.accounts, 
        activeAccountId: activeAccount?.id || null,
        config: store.config,
        isLoading: false 
      });
      
      // 加载后自动同步当前登录账号
      await get().syncCurrentAccount();
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to load accounts' 
      });
    }
  },
  
  syncCurrentAccount: async () => {
    try {
      const matchedId = await syncCurrent();
      
      // 更新本地状态（包括未登录时清除所有激活状态）
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => ({
        ...a,
        isActive: matchedId ? a.id === matchedId : false,
      }));
      
      set({ 
        accounts: updatedAccounts, 
        activeAccountId: matchedId,
      });
    } catch (error) {
      console.error('Failed to sync current account:', error);
    }
  },
  
  addAccount: async (authJson: string, alias?: string) => {
    set({ isLoading: true, error: null });
    try {
      const authConfig = JSON.parse(authJson);
      const newAccount = await addAccountToStore(authConfig, alias);
      
      // 更新本地状态
      const { accounts } = get();
      const existingIndex = accounts.findIndex(a => a.id === newAccount.id);
      
      if (existingIndex >= 0) {
        const updated = [...accounts];
        updated[existingIndex] = newAccount;
        set({ accounts: updated, isLoading: false });
      } else {
        set({ 
          accounts: [...accounts, newAccount],
          activeAccountId: accounts.length === 0 ? newAccount.id : get().activeAccountId,
          isLoading: false 
        });
      }
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to add account' 
      });
      throw error;
    }
  },
  
  removeAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      await removeAccountFromStore(accountId);
      const { accounts, activeAccountId } = get();
      const newAccounts = accounts.filter(a => a.id !== accountId);
      
      // 如果删除的是活动账号，切换到第一个账号
      let newActiveId = activeAccountId;
      if (activeAccountId === accountId) {
        newActiveId = newAccounts[0]?.id || null;
      }
      
      set({ 
        accounts: newAccounts, 
        activeAccountId: newActiveId,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to remove account' 
      });
    }
  },
  
  switchToAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      await switchAccount(accountId);
      
      // 更新本地状态
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => ({
        ...a,
        isActive: a.id === accountId,
      }));
      
      set({ 
        accounts: updatedAccounts, 
        activeAccountId: accountId,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to switch account' 
      });
    }
  },
  
  updateUsage: async (accountId: string, usage: UsageInfo) => {
    try {
      await updateUsage(accountId, usage);
      
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => 
        a.id === accountId ? { ...a, usageInfo: usage } : a
      );
      
      set({ accounts: updatedAccounts });
    } catch (error) {
      console.error('Failed to update usage:', error);
    }
  },
  
  updateConfig: async (config: Partial<AppConfig>) => {
    const { accounts, config: currentConfig } = get();
    const newConfig = { ...currentConfig, ...config };
    
    const store: AccountsStore = {
      version: '1.0.0',
      accounts,
      config: newConfig,
    };
    
    await saveAccountsStore(store);
    set({ config: newConfig });
  },
  
  refreshAllUsage: async () => {
    // 这个功能需要依次切换账号并获取用量
    // 由于codex /status需要交互式运行，这里暂时只是一个占位
    console.log('Refreshing all usage...');
  },
  
  clearError: () => set({ error: null }),
}));
