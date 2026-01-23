import { useEffect, useRef, useState } from 'react';
import { useAccountStore } from './stores/useAccountStore';
import { useAutoRefresh } from './hooks';
import { invoke } from '@tauri-apps/api/core';
import {
  AccountCard,
  AddAccountModal,
  ConfirmDialog,
  EmptyState,
  Header,
  SettingsModal,
  StatsSummary,
  Toast,
} from './components';

function App() {
  const {
    accounts,
    config,
    isLoading,
    error,
    loadAccounts,
    addAccount,
    removeAccount,
    switchToAccount,
    updateConfig,
    setError,
    clearError,
  } = useAccountStore();

  const { refreshAllUsage, refreshSingleAccount } = useAutoRefresh();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [shouldInitialRefresh, setShouldInitialRefresh] = useState(false);
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null);
  const autoImportInFlightRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    accountId: string | null;
    accountName: string;
  }>({
    isOpen: false,
    accountId: null,
    accountName: '',
  });

  useEffect(() => {
    let active = true;

    const runLoad = async () => {
      await loadAccounts();
      if (active) {
        setHasLoadedAccounts(true);
      }
    };

    void runLoad();

    return () => {
      active = false;
    };
  }, [loadAccounts]);

  useEffect(() => {
    if (!hasLoadedAccounts) return;

    if (accounts.length > 0) {
      if (!config.hasInitialized) {
        void updateConfig({ hasInitialized: true });
      }
      setIsInitializing(false);
      return;
    }

    if (config.hasInitialized) {
      setIsInitializing(false);
      return;
    }

    if (autoImportInFlightRef.current) {
      return;
    }

    autoImportInFlightRef.current = true;
    setIsInitializing(true);

    const runAutoImport = async () => {
      try {
        const authJson = await invoke<string>('read_codex_auth');
        await addAccount(authJson);
        setShouldInitialRefresh(true);
      } catch {
        // No local auth or invalid auth; fall back to empty state.
      } finally {
        try {
          await updateConfig({ hasInitialized: true });
        } catch {
          // Ignore config update failures for initialization.
        }
        setIsInitializing(false);
        autoImportInFlightRef.current = false;
      }
    };

    void runAutoImport();
  }, [accounts.length, addAccount, config.hasInitialized, hasLoadedAccounts, updateConfig]);

  useEffect(() => {
    if (!shouldInitialRefresh || accounts.length === 0) return;

    const targetId = accounts.find((account) => account.isActive)?.id ?? accounts[0].id;
    void refreshSingleAccount(targetId);
    setShouldInitialRefresh(false);
  }, [accounts, refreshSingleAccount, shouldInitialRefresh]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (message: string, tone: 'success' | 'warning' = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2200);
  };

  const handleAddAccount = async (authJson: string, alias?: string) => {
    await addAccount(authJson, alias);
  };

  const handleSyncAccount = async () => {
    try {
      const authJson = await invoke<string>('read_codex_auth');
      await addAccount(authJson);
    } catch {
      setError('未找到当前Codex配置文件。请确保已登录Codex。');
    }
  };

  const handleDeleteClick = (accountId: string, accountName: string) => {
    setDeleteConfirm({
      isOpen: true,
      accountId,
      accountName,
    });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm.accountId) {
      await removeAccount(deleteConfirm.accountId);
    }
    setDeleteConfirm({ isOpen: false, accountId: null, accountName: '' });
  };

  const handleRefreshAll = async () => {
    const result = await refreshAllUsage();
    if (result.skipped) return;
    if (result.updated > 0) {
      showToast('刷新成功', 'success');
    } else {
      showToast('未找到用量信息，请对话一次', 'warning');
    }
  };

  const handleRefresh = async (accountId: string) => {
    const result = await refreshSingleAccount(accountId);
    if (result.status === 'success') {
      showToast('刷新成功', 'success');
    } else if (result.status === 'no-usage') {
      showToast('未找到用量信息，请对话一次', 'warning');
    }
  };

  const activeAccount = accounts.find((account) => account.isActive);
  const activeName = activeAccount
    ? activeAccount.alias || activeAccount.accountInfo.email.split('@')[0]
    : undefined;

  return (
    <div className="min-h-screen pb-12 page-enter">
      <Header
        accountCount={accounts.length}
        activeName={activeName}
        onAddAccount={() => setShowAddModal(true)}
        onSyncAccount={handleSyncAccount}
        onRefreshAll={handleRefreshAll}
        onOpenSettings={() => setShowSettings(true)}
        isLoading={isLoading}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
            <button onClick={clearError} className="text-red-500 hover:text-red-600 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* 加载状态 */}
        {isInitializing && accounts.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-[var(--dash-text-secondary)]">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">初始化中...</span>
            </div>
          </div>
        )}

        {isLoading && accounts.length === 0 && !isInitializing && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-[var(--dash-text-secondary)]">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {hasLoadedAccounts && !isLoading && !isInitializing && accounts.length === 0 && (
          <EmptyState onAddAccount={() => setShowAddModal(true)} />
        )}

        {/* 有账号时显示统计和列表 */}
        {accounts.length > 0 && (
          <>
            <StatsSummary accounts={accounts} />

            <div className="dash-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--dash-text-primary)]">账号列表</h2>
                  <p className="text-xs text-[var(--dash-text-secondary)]">聚焦关键用量信息</p>
                </div>
                <span className="text-xs text-[var(--dash-text-muted)]">
                  共 {accounts.length} 个
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {accounts.map((account, index) => (
                  <div
                    key={account.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <AccountCard
                      account={account}
                      onSwitch={() => switchToAccount(account.id)}
                      onDelete={() => handleDeleteClick(account.id, account.alias)}
                      onRefresh={() => handleRefresh(account.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* 添加账号弹窗 */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddAccount}
      />

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={showSettings}
        config={config}
        onClose={() => setShowSettings(false)}
        onSave={updateConfig}
      />

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="删除账号"
        message={`确定要删除账号 "${deleteConfirm.accountName}" 吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, accountId: null, accountName: '' })}
      />

      {/* 右上角提示 */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
          <Toast message={toast.message} tone={toast.tone} />
        </div>
      )}

      {/* 底部状态栏 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/70 border-t border-[var(--dash-border)] py-2 px-5 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-[var(--dash-text-muted)]">
          <span>Codex Manager v0.1.0</span>
          <span>数据存储于本地</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
