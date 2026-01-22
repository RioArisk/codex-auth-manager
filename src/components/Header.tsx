import React from 'react';

interface HeaderProps {
  accountCount: number;
  onAddAccount: () => void;
  onRefreshAll: () => void;
  onOpenSettings: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  accountCount,
  onAddAccount,
  onRefreshAll,
  onOpenSettings,
  isLoading,
}) => {
  return (
    <header className="bg-stone-900/80 backdrop-blur-lg border-b border-stone-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo和标题 */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Codex Manager</h1>
              <p className="text-sm text-stone-400">
                {accountCount > 0 
                  ? `管理 ${accountCount} 个账号` 
                  : '添加您的Codex账号开始使用'}
              </p>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            {accountCount > 0 && (
              <button
                onClick={onRefreshAll}
                disabled={isLoading}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-300 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg 
                  className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新全部
              </button>
            )}
            
            <button
              onClick={onAddAccount}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-amber-600/30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加账号
            </button>
            
            <button
              onClick={onOpenSettings}
              className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors"
              title="设置"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
