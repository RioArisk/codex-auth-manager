import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  AccountCard,
  AccountFilters,
  AddAccountModal,
  ConfirmDialog,
  EmptyState,
  Header,
  QuickLoginModal,
  SettingsModal,
  StatsSummary,
  Toast,
} from './components';
import { useAutoRefresh } from './hooks';
import { useAccountStore } from './stores/useAccountStore';
import type { StoredAccount } from './types';
import {
  DEFAULT_ACCOUNT_FILTERS,
  type AccountFilterState,
  type LimitFilterValue,
  type PlanFilterValue,
} from './types/accountFilters';
import { getAccountExpiryBucket, isAccountExpired } from './utils/accountStatus';
import {
  exportAccountsBackup,
  importAccountsBackup,
  isMissingIdentityError,
  type AddAccountOptions,
} from './utils/storage';

interface StartCodexLoginResult {
  status: 'success' | 'timeout' | 'process_error' | 'cancelled';
  authJson?: string;
  changedAt?: string;
  message?: string;
}

type QuickLoginState = {
  isOpen: boolean;
  phase: 'starting' | 'waiting' | 'importing' | 'success' | 'error';
  title: string;
  message: string;
  detail?: string | null;
  canClose?: boolean;
  canCancel?: boolean;
};

const formatChangedAtDetail = (changedAt?: string) => {
  if (!changedAt) return null;
  const value = Number(changedAt);
  if (!Number.isFinite(value)) return changedAt;
  return `auth 更新时间：${new Date(value).toLocaleString('zh-CN')}`;
};

function matchesLimitFilter(
  value: number | undefined,
  filter: LimitFilterValue
): boolean {
  if (filter === 'all') return true;
  if (typeof value !== 'number') return false;
  if (filter === '0-33') return value <= 33;
  if (filter === '33-66') return value > 33 && value <= 66;
  return value > 66;
}

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
    syncCurrentAccount,
    updateConfig,
    setError,
    clearError,
  } = useAccountStore();
  const { refreshAllUsage, refreshSingleAccount, isRefreshing } = useAutoRefresh();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [shouldInitialRefresh, setShouldInitialRefresh] = useState(false);
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null);
  const [filters, setFilters] = useState<AccountFilterState>(DEFAULT_ACCOUNT_FILTERS);
  const autoImportInFlightRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | 'all' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    accountId: string | null;
    accountName: string;
  }>({
    isOpen: false,
    accountId: null,
    accountName: '',
  });
  const [identityConfirm, setIdentityConfirm] = useState<{
    isOpen: boolean;
    authJson: string;
    alias?: string;
    source: 'manual' | 'sync' | 'auto' | 'quick-login';
  } | null>(null);
  const [quickLoginState, setQuickLoginState] = useState<QuickLoginState | null>(null);

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

    if (config.hasInitialized || autoImportInFlightRef.current) {
      setIsInitializing(false);
      return;
    }

    autoImportInFlightRef.current = true;
    setIsInitializing(true);

    const runAutoImport = async () => {
      let authJson: string | null = null;
      try {
        authJson = await invoke<string>('read_codex_auth');
        await addAccount(authJson);
        setShouldInitialRefresh(true);
      } catch (currentError) {
        if (authJson && isMissingIdentityError(currentError)) {
          setIdentityConfirm({ isOpen: true, authJson, source: 'auto' });
          clearError();
        }
      } finally {
        try {
          await updateConfig({ hasInitialized: true });
        } catch {
          // 忽略初始化状态写入失败。
        }
        setIsInitializing(false);
        autoImportInFlightRef.current = false;
      }
    };

    void runAutoImport();
  }, [accounts.length, addAccount, clearError, config.hasInitialized, hasLoadedAccounts, updateConfig]);

  useEffect(() => {
    if (!shouldInitialRefresh || accounts.length === 0) return;
    const targetId = accounts.find((account) => account.isActive)?.id ?? accounts[0].id;
    void refreshSingleAccount(targetId);
    setShouldInitialRefresh(false);
  }, [accounts, refreshSingleAccount, shouldInitialRefresh]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
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
    try {
      await addAccount(authJson, alias);
    } catch (currentError) {
      if (isMissingIdentityError(currentError)) {
        setIdentityConfirm({ isOpen: true, authJson, alias, source: 'manual' });
        clearError();
        return;
      }
      throw currentError;
    }
  };

  const handleCloseQuickLogin = async () => {
    if (!quickLoginState) return;

    if (quickLoginState.canCancel) {
      setQuickLoginState({
        isOpen: true,
        phase: 'waiting',
        title: '正在取消快速登录',
        message: '正在停止等待授权，请稍候。',
        detail: null,
        canClose: false,
        canCancel: false,
      });

      try {
        await invoke('cancel_codex_login');
      } catch (currentError) {
        setQuickLoginState({
          isOpen: true,
          phase: 'error',
          title: '取消快速登录失败',
          message: currentError instanceof Error ? currentError.message : '取消登录等待失败',
          detail: null,
          canClose: true,
          canCancel: false,
        });
      }
      return;
    }

    setQuickLoginState(null);
  };

  const handleQuickLogin = async () => {
    setQuickLoginState({
      isOpen: true,
      phase: 'starting',
      title: '快速登录并导入',
      message: '正在启动 Codex 登录流程，请稍候。',
      detail: config.codexPath || 'codex',
      canClose: false,
      canCancel: true,
    });

    try {
      setQuickLoginState({
        isOpen: true,
        phase: 'waiting',
        title: '快速登录并导入',
        message: '已启动 Codex 登录，请在浏览器中完成授权。若不想继续，可以直接取消等待。',
        detail: config.codexPath || 'codex',
        canClose: false,
        canCancel: true,
      });

      const result = await invoke<StartCodexLoginResult>('start_codex_login', {
        codexPath: config.codexPath,
        timeoutSeconds: 180,
      });

      if (result.status === 'cancelled') {
        setQuickLoginState(null);
        showToast('已取消快速登录', 'warning');
        return;
      }

      if (result.status !== 'success' || !result.authJson) {
        setQuickLoginState({
          isOpen: true,
          phase: 'error',
          title: '快速登录失败',
          message: result.message || '未能完成 Codex 登录。',
          detail: formatChangedAtDetail(result.changedAt),
          canClose: true,
          canCancel: false,
        });
        return;
      }

      setQuickLoginState({
        isOpen: true,
        phase: 'importing',
        title: '快速登录并导入',
        message: '已检测到新的 auth 配置，正在导入账号并同步状态。',
        detail: formatChangedAtDetail(result.changedAt),
        canClose: false,
        canCancel: false,
      });

      try {
        await addAccount(result.authJson);
      } catch (currentError) {
        if (isMissingIdentityError(currentError)) {
          setQuickLoginState(null);
          setIdentityConfirm({ isOpen: true, authJson: result.authJson, source: 'quick-login' });
          clearError();
          return;
        }
        throw currentError;
      }

      await syncCurrentAccount();
      setShouldInitialRefresh(true);

      setQuickLoginState({
        isOpen: true,
        phase: 'success',
        title: '快速登录完成',
        message: '账号已成功导入并同步为当前登录状态。',
        detail: formatChangedAtDetail(result.changedAt),
        canClose: true,
        canCancel: false,
      });
      showToast('快速登录并导入成功', 'success');
    } catch (currentError) {
      setQuickLoginState({
        isOpen: true,
        phase: 'error',
        title: '快速登录失败',
        message: currentError instanceof Error ? currentError.message : '启动 Codex 登录失败',
        detail: config.codexPath || 'codex',
        canClose: true,
        canCancel: false,
      });
    }
  };

  const syncCurrentCodexAccount = async (): Promise<boolean> => {
    try {
      const authJson = await invoke<string>('read_codex_auth');
      try {
        await addAccount(authJson);
      } catch (currentError) {
        if (isMissingIdentityError(currentError)) {
          setIdentityConfirm({ isOpen: true, authJson, source: 'sync' });
          clearError();
          return false;
        }
        throw currentError;
      }

      await syncCurrentAccount();
      setShouldInitialRefresh(true);
      return true;
    } catch {
      setError('未找到当前 Codex 配置文件，请先完成 Codex 登录。');
      return false;
    }
  };

  const handleSyncAccount = async () => {
    await syncCurrentCodexAccount();
  };

  const handleImportBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Codex Manager Backup',
            extensions: ['json'],
          },
        ],
      });

      if (!selected || Array.isArray(selected)) return;

      const backupJson = await invoke<string>('read_file_content', {
        filePath: selected,
      });
      const result = await importAccountsBackup(backupJson);
      await loadAccounts();
      showToast(`已导入 ${result.importedCount} 个账号`, 'success');
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '导入备份失败');
    }
  };

  const handleExportBackup = async () => {
    try {
      const filePath = await save({
        defaultPath: `codex-manager-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          {
            name: 'Codex Manager Backup',
            extensions: ['json'],
          },
        ],
      });

      if (!filePath) return;

      const backupJson = await exportAccountsBackup();
      await invoke('write_file_content', {
        filePath,
        content: backupJson,
      });
      showToast('备份已导出', 'success');
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '导出备份失败');
    }
  };

  const handleConfirmIdentityImport = async () => {
    if (!identityConfirm) return;
    const { authJson, alias, source } = identityConfirm;
    setIdentityConfirm(null);

    const options: AddAccountOptions = { allowMissingIdentity: true };
    try {
      await addAccount(authJson, alias, options);
      if (source === 'auto' || source === 'quick-login') {
        await syncCurrentAccount();
        setShouldInitialRefresh(true);
      }
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '导入失败');
    }
  };

  const handleRefreshAll = async () => {
    if (isRefreshing) return;
    setRefreshingAccountId('all');
    try {
      const result = await refreshAllUsage();
      if (result.skipped) return;
      if (result.updated > 0) {
        showToast('刷新成功', 'success');
      } else {
        showToast('未找到用量信息，请稍后重试', 'warning');
      }
    } finally {
      setRefreshingAccountId(null);
    }
  };

  const handleRefresh = async (accountId: string) => {
    if (isRefreshing) return;
    setRefreshingAccountId(accountId);
    try {
      const result = await refreshSingleAccount(accountId);
      if (result.status === 'success') {
        showToast('刷新成功', 'success');
      } else {
        const message =
          result.message ||
          (result.status === 'missing-account-id'
            ? '缺少 ChatGPT account ID'
            : result.status === 'missing-token'
              ? '缺少 access token'
              : result.status === 'no-codex-access'
                ? '当前账号没有 Codex 权限'
                : result.status === 'no-usage'
                  ? '未找到用量信息，请稍后重试'
                  : '刷新失败');
        showToast(message, 'warning');
      }
    } finally {
      setRefreshingAccountId(null);
    }
  };

  const handleToggleProxy = async () => {
    await updateConfig({ proxyEnabled: !config.proxyEnabled });
  };

  const handleSwitchAccount = async (account: StoredAccount) => {
    if (isAccountExpired(account)) {
      const synced = await syncCurrentCodexAccount();
      if (synced) {
        showToast('目标账号已过期，已同步当前 Codex 登录账号', 'warning');
      }
      return;
    }

    await switchToAccount(account.id);
  };

  const availablePlanTypes: Array<Exclude<PlanFilterValue, 'all'>> = (
    ['free', 'plus', 'pro', 'team'] as const
  ).filter((plan) => accounts.some((account) => account.accountInfo.planType === plan));

  const filteredAccounts = accounts.filter((account) => {
    if (filters.plan !== 'all' && account.accountInfo.planType !== filters.plan) {
      return false;
    }

    if (filters.expiry !== 'all' && getAccountExpiryBucket(account) !== filters.expiry) {
      return false;
    }

    if (!matchesLimitFilter(account.usageInfo?.weeklyLimit?.percentLeft, filters.weekly)) {
      return false;
    }

    if (!matchesLimitFilter(account.usageInfo?.fiveHourLimit?.percentLeft, filters.hourly)) {
      return false;
    }

    return true;
  });

  const activeAccount = accounts.find((account) => account.isActive);
  const activeName = activeAccount
    ? activeAccount.alias || activeAccount.accountInfo.email.split('@')[0]
    : undefined;

  return (
    <>
      <div className="min-h-screen pb-12 page-enter">
        <Header
          accountCount={accounts.length}
          activeName={activeName}
          onAddAccount={() => setShowAddModal(true)}
          onQuickLogin={handleQuickLogin}
          onReadCurrentAccount={handleSyncAccount}
          onImportBackup={handleImportBackup}
          onExportBackup={handleExportBackup}
          onRefreshAll={handleRefreshAll}
          onOpenSettings={() => setShowSettings(true)}
          onToggleProxy={handleToggleProxy}
          isProxyEnabled={config.proxyEnabled}
          isRefreshing={isRefreshing}
          isRefreshingAll={isRefreshing && refreshingAccountId === 'all'}
          isLoading={isLoading}
        >
          {accounts.length > 0 ? <StatsSummary accounts={accounts} embedded /> : null}
        </Header>

        <main className="max-w-7xl mx-auto px-6 py-8">
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

          {hasLoadedAccounts && !isLoading && !isInitializing && accounts.length === 0 && (
            <EmptyState onAddAccount={handleQuickLogin} />
          )}

          {accounts.length > 0 && (
            <div className="dash-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-[var(--dash-text-primary)]">账号列表</h2>
                  <span className="text-xs text-[var(--dash-text-muted)]">共 {accounts.length} 个</span>
                </div>
                <AccountFilters
                  filters={filters}
                  availablePlanTypes={availablePlanTypes}
                  filteredCount={filteredAccounts.length}
                  totalCount={accounts.length}
                  onChange={(next) => setFilters((current) => ({ ...current, ...next }))}
                  onClear={() => setFilters({ ...DEFAULT_ACCOUNT_FILTERS })}
                />
              </div>

              {filteredAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--dash-border)] bg-slate-50/70 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-[var(--dash-text-primary)]">没有匹配当前筛选条件的账号</p>
                  <p className="text-xs text-[var(--dash-text-muted)] mt-2">调整筛选条件后会立即更新列表</p>
                  <button
                    type="button"
                    onClick={() => setFilters({ ...DEFAULT_ACCOUNT_FILTERS })}
                    className="mt-4 h-9 px-4 rounded-full border border-[var(--dash-border)] bg-white text-sm text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 transition-colors"
                  >
                    清空筛选
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredAccounts.map((account, index) => (
                    <div
                      key={account.id}
                      className="animate-fade-in h-full"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <AccountCard
                        account={account}
                        onSwitch={() => handleSwitchAccount(account)}
                        onDelete={() => setDeleteConfirm({
                          isOpen: true,
                          accountId: account.id,
                          accountName: account.alias,
                        })}
                        onRefresh={() => handleRefresh(account.id)}
                        isRefreshing={isRefreshing}
                        isRefreshingSelf={
                          isRefreshing && (refreshingAccountId === account.id || refreshingAccountId === 'all')
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddAccount}
      />

      <QuickLoginModal
        isOpen={!!quickLoginState?.isOpen}
        phase={quickLoginState?.phase || 'starting'}
        title={quickLoginState?.title || '快速登录并导入'}
        message={quickLoginState?.message || ''}
        detail={quickLoginState?.detail}
        canClose={quickLoginState?.canClose}
        canCancel={quickLoginState?.canCancel}
        onClose={() => {
          void handleCloseQuickLogin();
        }}
        onCancel={() => {
          void handleCloseQuickLogin();
        }}
      />

      <SettingsModal
        isOpen={showSettings}
        config={config}
        onClose={() => setShowSettings(false)}
        onSave={updateConfig}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="删除账号"
        message={`确定要删除账号 “${deleteConfirm.accountName}” 吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={async () => {
          if (deleteConfirm.accountId) {
            await removeAccount(deleteConfirm.accountId);
          }
          setDeleteConfirm({ isOpen: false, accountId: null, accountName: '' });
        }}
        onCancel={() => setDeleteConfirm({ isOpen: false, accountId: null, accountName: '' })}
      />

      <ConfirmDialog
        isOpen={!!identityConfirm?.isOpen}
        title="账号身份信息缺失"
        message="未检测到有效的账号邮箱或用户 ID。继续导入可能导致账号无法区分，建议确认后再决定是否导入。"
        confirmText="继续导入"
        cancelText="取消"
        variant="warning"
        onConfirm={handleConfirmIdentityImport}
        onCancel={() => setIdentityConfirm(null)}
      />

      {toast && (
        <div className="fixed top-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
          <Toast message={toast.message} tone={toast.tone} />
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/70 border-t border-[var(--dash-border)] py-2 px-5 backdrop-blur z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-[var(--dash-text-muted)]">
          <span>Codex Manager v0.1.5</span>
          <span>数据存储于本地</span>
        </div>
      </footer>
    </>
  );
}

export default App;
