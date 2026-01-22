import React from 'react';
import type { StoredAccount } from '../types';
import UsageBar from './UsageBar';

interface AccountCardProps {
  account: StoredAccount;
  onSwitch: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}

const planTypeColors: Record<string, string> = {
  free: 'bg-slate-600',
  plus: 'bg-emerald-600',
  pro: 'bg-purple-600',
  team: 'bg-blue-600',
};

const planTypeLabels: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
};

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  onSwitch,
  onDelete,
  onRefresh,
}) => {
  const { accountInfo, usageInfo, isActive, alias } = account;
  
  return (
    <div 
      className={`
        relative rounded-xl p-5 transition-all duration-300
        ${isActive 
          ? 'bg-gradient-to-br from-blue-900/50 to-slate-800 border-2 border-blue-500 shadow-lg shadow-blue-500/20' 
          : 'bg-slate-800/80 border border-slate-700 hover:border-slate-600'
        }
      `}
    >
      {/* 活动标记 */}
      {isActive && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded-full animate-pulse-glow">
          当前使用
        </div>
      )}
      
      {/* 头部信息 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
            {accountInfo.email.charAt(0).toUpperCase()}
          </div>
          
          <div>
            <h3 className="font-semibold text-white text-lg">{alias}</h3>
            <p className="text-slate-400 text-sm">{accountInfo.email}</p>
          </div>
        </div>
        
        {/* 订阅类型徽章 */}
        <span className={`px-2.5 py-1 text-xs font-medium text-white rounded-full ${planTypeColors[accountInfo.planType] || planTypeColors.free}`}>
          {planTypeLabels[accountInfo.planType] || accountInfo.planType}
        </span>
      </div>
      
      {/* 用量信息 */}
      {usageInfo ? (
        <div className="space-y-3 mb-4">
          <UsageBar 
            label="5小时限额" 
            percentLeft={usageInfo.fiveHourLimit.percentLeft}
            resetTime={usageInfo.fiveHourLimit.resetTime}
          />
          <UsageBar 
            label="周限额" 
            percentLeft={usageInfo.weeklyLimit.percentLeft}
            resetTime={usageInfo.weeklyLimit.resetTime}
          />
          
          {/* 上下文窗口 */}
          <div className="flex justify-between text-sm text-slate-400 pt-2 border-t border-slate-700">
            <span>上下文窗口</span>
            <span>{usageInfo.contextWindow.used} / {usageInfo.contextWindow.total}</span>
          </div>
          
          {/* 最后更新时间 */}
          <p className="text-xs text-slate-500">
            更新于 {new Date(usageInfo.lastUpdated).toLocaleString('zh-CN')}
          </p>
        </div>
      ) : (
        <div className="py-6 text-center text-slate-500 mb-4">
          <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm font-medium">暂无用量数据</p>
          {isActive ? (
            <p className="text-xs mt-1 text-slate-400">
              使用 Codex 提问后可获取用量信息
            </p>
          ) : (
            <p className="text-xs mt-1 text-slate-400">
              切换到此账号并使用 Codex 提问后可获取
            </p>
          )}
        </div>
      )}
      
      {/* 操作按钮 */}
      <div className="flex gap-2">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            切换到此账号
          </button>
        )}
        
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          title="刷新用量"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        
        <button
          onClick={onDelete}
          className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
          title="删除账号"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      
      {/* 订阅到期提醒 */}
      {accountInfo.subscriptionActiveUntil && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            订阅有效期至: {new Date(accountInfo.subscriptionActiveUntil).toLocaleDateString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  );
};

export default AccountCard;
