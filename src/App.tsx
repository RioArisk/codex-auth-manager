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

  // 初始化加载账号
  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // 错误提示自动消失
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

  return (
    <div className="min-h-screen pb-16">
      <Header
        accountCount={accounts.length}
        onAddAccount={() => setShowAddModal(true)}
        onRefreshAll={refreshAllUsage}
        onOpenSettings={() => setShowSettings(true)}
        isLoading={isLoading}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && accounts.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-slate-400">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>加载中...</span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {accounts.map((account, index) => (
                <div
                  key={account.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
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

      {/* 底部信息 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800 py-3 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
          <span>Codex Manager v0.1.0</span>
          <span>数据存储于本地，安全私密</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
