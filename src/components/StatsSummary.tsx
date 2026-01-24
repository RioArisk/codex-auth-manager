import React from 'react';
import type { StoredAccount } from '../types';

interface StatsSummaryProps {
  accounts: StoredAccount[];
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ accounts }) => {
  if (accounts.length === 0) return null;
  
  const accountsWithUsage = accounts.filter(
    (a) => a.usageInfo && (!a.usageInfo.status || a.usageInfo.status === 'ok')
  );
  const activeCount = accounts.filter(a => a.isActive).length;
  
  const bestAccount = accountsWithUsage.reduce<StoredAccount | null>((best, current) => {
    if (!best) return current;
    const bestUsage = best.usageInfo?.weeklyLimit?.percentLeft || 0;
    const currentUsage = current.usageInfo?.weeklyLimit?.percentLeft || 0;
    return currentUsage > bestUsage ? current : best;
  }, null);
  
  const avgWeeklyLeft = accountsWithUsage.length > 0
    ? accountsWithUsage.reduce((sum, a) => sum + (a.usageInfo?.weeklyLimit?.percentLeft || 0), 0) / accountsWithUsage.length
    : 0;
  
  const avgFiveHourLeft = accountsWithUsage.length > 0
    ? accountsWithUsage.reduce((sum, a) => sum + (a.usageInfo?.fiveHourLimit?.percentLeft || 0), 0) / accountsWithUsage.length
    : 0;
  
  const planCounts = accounts.reduce((acc, a) => {
    const plan = a.accountInfo.planType;
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return (
    <div className="dash-card p-5 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:divide-x md:divide-slate-200">
        <div className="md:pr-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">账号总览</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-semibold text-[var(--dash-text-primary)]">{accounts.length}</p>
            <span className="dash-pill bg-emerald-50 text-emerald-600">
              活跃 {activeCount}
            </span>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {Object.entries(planCounts).map(([plan, count]) => (
              <span
                key={plan}
                className="text-xs px-2 py-1 rounded-full bg-slate-100 text-[var(--dash-text-secondary)]"
              >
                {plan.toUpperCase()} · {count}
              </span>
            ))}
          </div>
        </div>

        <div className="md:px-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">周限额平均</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-semibold text-[var(--dash-text-primary)]">
              {avgWeeklyLeft.toFixed(0)}%
            </p>
            <span className={`dash-pill ${avgWeeklyLeft >= 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {avgWeeklyLeft >= 50 ? '健康' : '需关注'}
            </span>
          </div>
          <p className="text-xs text-[var(--dash-text-secondary)] mt-2">
            体现整体账号周限额余量
          </p>
        </div>

        <div className="md:px-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">5h 限额平均</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-semibold text-[var(--dash-text-primary)]">
              {avgFiveHourLeft.toFixed(0)}%
            </p>
            <span className={`dash-pill ${avgFiveHourLeft >= 50 ? 'bg-sky-50 text-sky-600' : 'bg-rose-50 text-rose-600'}`}>
              {avgFiveHourLeft >= 50 ? '充足' : '紧张'}
            </span>
          </div>
          <p className="text-xs text-[var(--dash-text-secondary)] mt-2">
            用于短期调用压力判断
          </p>
        </div>

        <div className="md:pl-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">推荐账号</p>
          <div className="mt-2">
            {bestAccount ? (
              <>
                <p className="text-lg font-semibold text-[var(--dash-text-primary)] truncate">
                  {bestAccount.alias}
                </p>
                <p className="text-xs text-[var(--dash-text-secondary)] mt-1">
                  周限额剩余 {bestAccount.usageInfo?.weeklyLimit?.percentLeft || 0}%
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--dash-text-secondary)]">暂无用量数据</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsSummary;
