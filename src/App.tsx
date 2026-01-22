import { useEffect, useState } from 'react';
import { useAccountStore } from './stores/useAccountStore';
import { useAutoRefresh } from './hooks';
import {
  AccountCard,
  AddAccountModal,
  ConfirmDialog,
  EmptyState,
  Header,
  SettingsModal,
  StatsSummary,
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
    clearError,
  } = useAccountStore();

  const { refreshAllUsage, refreshSingleAccount } = useAutoRefresh();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleAddAccount = async (authJson: string, alias?: string) => {
    await addAccount(authJson, alias);
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

  const handleRefresh = async (accountId: string) => {
    await refreshSingleAccount(accountId);
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
        onRefreshAll={refreshAllUsage}
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
        {isLoading && accounts.length === 0 && (
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
        {!isLoading && accounts.length === 0 && (
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
