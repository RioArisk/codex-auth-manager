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
  free: 'bg-[#505050] text-[#B3B3B3]',
  plus: 'bg-emerald-600/20 text-emerald-400',
  pro: 'bg-amber-600/20 text-amber-400',
  team: 'bg-sky-600/20 text-sky-400',
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
        relative rounded-md p-4 transition-all duration-150 win-card
        ${isActive 
          ? 'bg-[#2D2D2D] border-2 border-emerald-600' 
          : 'bg-[#2D2D2D] border border-[#404040] hover:bg-[#333333]'
        }
      `}
    >
      {/* 活动标记 */}
      {isActive && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-600 text-white text-xs font-medium rounded">
          当前使用
        </div>
      )}
      
      {/* 头部信息 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div className="w-10 h-10 rounded bg-[#505050] flex items-center justify-center text-white font-semibold text-sm">
            {accountInfo.email.charAt(0).toUpperCase()}
          </div>
          
          <div>
            <h3 className="font-semibold text-white text-sm">{alias}</h3>
            <p className="text-[#808080] text-xs">{accountInfo.email}</p>
          </div>
        </div>
        
        {/* 订阅类型徽章 */}
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${planTypeColors[accountInfo.planType] || planTypeColors.free}`}>
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
          <div className="flex justify-between text-xs text-[#808080] pt-2 border-t border-[#404040]">
            <span>上下文窗口</span>
            <span>{usageInfo.contextWindow.used} / {usageInfo.contextWindow.total}</span>
          </div>
          
          {/* 最后更新时间 */}
          <p className="text-xs text-[#606060]">
            更新于 {new Date(usageInfo.lastUpdated).toLocaleString('zh-CN')}
          </p>
        </div>
      ) : (
        <div className="py-6 text-center text-[#808080] mb-4">
          <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">暂无用量数据</p>
          <p className="text-xs mt-1 text-[#606060]">
            {isActive ? '使用 Codex 提问后可获取' : '切换到此账号后可获取'}
          </p>
        </div>
      )}
      
      {/* 操作按钮 */}
      <div className="flex gap-2">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors"
          >
            切换到此账号
          </button>
        )}
        
        <button
          onClick={onRefresh}
          className="h-8 w-8 bg-[#383838] hover:bg-[#454545] text-[#B3B3B3] hover:text-white rounded transition-colors flex items-center justify-center"
          title="刷新用量"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        
        <button
          onClick={onDelete}
          className="h-8 w-8 bg-[#383838] hover:bg-red-600/30 text-[#B3B3B3] hover:text-red-400 rounded transition-colors flex items-center justify-center"
          title="删除账号"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      
      {/* 订阅到期提醒 */}
      {accountInfo.subscriptionActiveUntil && (
        <div className="mt-3 pt-3 border-t border-[#404040]">
          <p className="text-xs text-[#606060]">
            订阅有效期至: {new Date(accountInfo.subscriptionActiveUntil).toLocaleDateString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  );
};

export default AccountCard;
