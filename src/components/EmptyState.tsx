import React from 'react';

interface EmptyStateProps {
  onAddAccount: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddAccount }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      {/* 装饰性背景 */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center border border-slate-700">
          <svg className="w-16 h-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-3">开始使用 Codex Manager</h2>
      <p className="text-slate-400 text-center max-w-md mb-8">
        添加您的 Codex 账号，轻松管理多个账号、一键切换、实时监控用量信息。
      </p>
      
      <button
        onClick={onAddAccount}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all hover:scale-105 shadow-lg shadow-blue-600/30 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        添加第一个账号
      </button>
      
      {/* 功能特点 */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full">
        <div className="text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-blue-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h3 className="font-semibold text-white mb-2">一键切换</h3>
          <p className="text-sm text-slate-400">快速在多个账号之间切换，无需手动修改配置文件</p>
        </div>
        
        <div className="text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-emerald-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white mb-2">用量监控</h3>
          <p className="text-sm text-slate-400">实时查看各账号的限额使用情况和重置时间</p>
        </div>
        
        <div className="text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white mb-2">安全存储</h3>
          <p className="text-sm text-slate-400">所有数据本地加密存储，保护您的账号安全</p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
