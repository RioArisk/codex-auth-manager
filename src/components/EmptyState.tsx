import React from 'react';

interface EmptyStateProps {
  onAddAccount: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddAccount }) => {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4">
      <div className="w-20 h-20 rounded-2xl bg-white border border-[var(--dash-border)] flex items-center justify-center mb-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
        <svg className="w-10 h-10 text-[var(--dash-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </div>
      
      <h2 className="text-xl font-semibold text-[var(--dash-text-primary)] mb-2">开始使用 Codex Manager</h2>
      <p className="text-[var(--dash-text-secondary)] text-sm text-center max-w-md mb-6">
        添加您的 Codex 账号，轻松管理多个账号、一键切换、实时监控用量信息
      </p>
      
      <button
        onClick={onAddAccount}
        className="h-10 px-5 bg-[var(--dash-accent)] hover:brightness-110 text-white rounded-full text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        添加第一个账号
      </button>
      
      {/* 功能特点 */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">一键切换</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">快速在多个账号之间切换</p>
        </div>
        
        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">用量监控</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">实时查看限额使用情况</p>
        </div>
        
        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">安全存储</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">数据本地存储，安全私密</p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
