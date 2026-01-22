import React from 'react';
import type { StoredAccount } from '../types';

interface StatsSummaryProps {
  accounts: StoredAccount[];
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ accounts }) => {
  if (accounts.length === 0) return null;
  
  const accountsWithUsage = accounts.filter(a => a.usageInfo);
  
  const bestAccount = accountsWithUsage.reduce<StoredAccount | null>((best, current) => {
    if (!best) return current;
    const bestUsage = best.usageInfo?.weeklyLimit.percentLeft || 0;
    const currentUsage = current.usageInfo?.weeklyLimit.percentLeft || 0;
    return currentUsage > bestUsage ? current : best;
  }, null);
  
  const avgWeeklyLeft = accountsWithUsage.length > 0
    ? accountsWithUsage.reduce((sum, a) => sum + (a.usageInfo?.weeklyLimit.percentLeft || 0), 0) / accountsWithUsage.length
    : 0;
  
  const avgFiveHourLeft = accountsWithUsage.length > 0
    ? accountsWithUsage.reduce((sum, a) => sum + (a.usageInfo?.fiveHourLimit.percentLeft || 0), 0) / accountsWithUsage.length
    : 0;
  
  const planCounts = accounts.reduce((acc, a) => {
    const plan = a.accountInfo.planType;
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
      {/* 总账号数 */}
      <div className="bg-[#2D2D2D] rounded-md p-4 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#383838] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#B3B3B3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-semibold text-white">{accounts.length}</p>
            <p className="text-xs text-[#808080]">账号总数</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {Object.entries(planCounts).map(([plan, count]) => (
            <span key={plan} className="text-xs px-1.5 py-0.5 bg-[#383838] rounded text-[#B3B3B3]">
              {plan}: {count}
            </span>
          ))}
        </div>
      </div>
      
      {/* 平均周限额 */}
      <div className="bg-[#2D2D2D] rounded-md p-4 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#383838] flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-semibold text-white">{avgWeeklyLeft.toFixed(0)}%</p>
            <p className="text-xs text-[#808080]">平均周限额</p>
          </div>
        </div>
      </div>
      
      {/* 平均5小时限额 */}
      <div className="bg-[#2D2D2D] rounded-md p-4 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#383838] flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-semibold text-white">{avgFiveHourLeft.toFixed(0)}%</p>
            <p className="text-xs text-[#808080]">平均5h限额</p>
          </div>
        </div>
      </div>
      
      {/* 推荐账号 */}
      <div className="bg-[#2D2D2D] rounded-md p-4 border border-emerald-600/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-emerald-600/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400 font-medium">推荐使用</p>
            {bestAccount ? (
              <>
                <p className="text-white font-semibold text-sm truncate">{bestAccount.alias}</p>
                <p className="text-xs text-[#808080]">
                  周限额 {bestAccount.usageInfo?.weeklyLimit.percentLeft || 0}%
                </p>
              </>
            ) : (
              <p className="text-[#808080] text-sm">暂无数据</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsSummary;
