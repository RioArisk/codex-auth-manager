import React, { useState, useEffect } from 'react';

interface HeaderProps {
  accountCount: number;
  activeName?: string;
  onAddAccount: () => void;
  onSyncAccount: () => void;
  onRefreshAll: () => void | Promise<void>;
  onOpenSettings: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  accountCount,
  activeName,
  onAddAccount,
  onSyncAccount,
  onRefreshAll,
  onOpenSettings,
  isLoading,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };
  
  const formatDate = (date: Date) =>
    date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });

  const hour = currentTime.getHours();
  const greeting =
    hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const displayName = activeName || '欢迎回来';
  
  return (
    <header className="sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="dash-card-soft px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">
              {formatDate(currentTime)}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-[var(--dash-text-primary)]">
              {greeting}，{displayName}！
            </h1>
            <p className="text-sm text-[var(--dash-text-secondary)] mt-1">
              {accountCount > 0 ? `当前管理 ${accountCount} 个账号` : '添加账号开始使用'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="dash-pill bg-[var(--dash-accent-soft)] text-[var(--dash-accent)] hidden sm:flex">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
              </svg>
              <span className="tabular-nums">{formatTime(currentTime)}</span>
            </div>

            {accountCount > 0 && (
              <button
                onClick={onRefreshAll}
                disabled={isLoading}
                className="h-10 px-3 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 bg-white/70 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm hidden md:inline">刷新用量</span>
              </button>
            )}

            <button
              onClick={onSyncAccount}
              disabled={isLoading}
              className="h-10 px-4 rounded-full bg-blue-50 text-blue-600 text-sm font-medium transition-colors hover:bg-blue-100 disabled:bg-slate-200 disabled:text-slate-400 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              同步当前账号
            </button>

            <button
              onClick={onAddAccount}
              className="h-10 px-4 rounded-full bg-[var(--dash-accent)] text-white text-sm font-medium transition-colors hover:brightness-110 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加账号
            </button>

            <button
              onClick={onOpenSettings}
              className="h-10 w-10 rounded-full border border-[var(--dash-border)] bg-white/70 text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 transition-colors flex items-center justify-center"
              title="设置"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
