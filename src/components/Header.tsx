import React, { useState, useEffect } from 'react';

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
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
  };
  
  return (
    <header className="win-acrylic border-b border-[#404040] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-5 py-3">
        <div className="flex items-center justify-between">
          {/* Logo和标题 */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">Codex Manager</h1>
              <p className="text-xs text-[#808080]">
                {accountCount > 0 ? `${accountCount} 个账号` : '添加账号开始使用'}
              </p>
            </div>
          </div>
          
          {/* 时间和操作按钮 */}
          <div className="flex items-center gap-4">
            {/* 时间显示 */}
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white tabular-nums">{formatTime(currentTime)}</p>
              <p className="text-xs text-[#808080]">{formatDate(currentTime)}</p>
            </div>
            
            <div className="h-8 w-px bg-[#404040] hidden sm:block" />
            
            <div className="flex items-center gap-2">
              {accountCount > 0 && (
                <button
                  onClick={onRefreshAll}
                  disabled={isLoading}
                  className="h-8 px-3 bg-[#2D2D2D] hover:bg-[#383838] disabled:opacity-50 text-[#B3B3B3] hover:text-white rounded border border-[#404040] text-sm transition-colors flex items-center gap-2"
                >
                  <svg 
                    className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden md:inline">刷新全部账号用量</span>
                </button>
              )}
              
              <button
                onClick={onAddAccount}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">添加账号</span>
              </button>
              
              <button
                onClick={onOpenSettings}
                className="h-8 w-8 bg-[#2D2D2D] hover:bg-[#383838] text-[#B3B3B3] hover:text-white rounded border border-[#404040] transition-colors flex items-center justify-center"
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
      </div>
    </header>
  );
};

export default Header;
