import React from 'react';
import type { StoredAccount } from '../types';
import UsageBar from './UsageBar';

interface AccountCardProps {
  account: StoredAccount;
  onSwitch: () => void;
  onDelete: () => void;
  onRefresh: () => void | Promise<void>;
}

const planTypeColors: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  plus: 'bg-blue-50 text-blue-600',
  pro: 'bg-amber-50 text-amber-600',
  team: 'bg-emerald-50 text-emerald-600',
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
  const displayName = alias || accountInfo.email.split('@')[0];
  const fiveHourLeft = usageInfo?.fiveHourLimit.percentLeft;
  const weeklyLeft = usageInfo?.weeklyLimit.percentLeft;

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center gap-5 px-4 py-4 rounded-2xl border border-slate-100 bg-white/90 transition-colors ${
        isActive
          ? 'bg-[rgba(47,107,255,0.08)] border-[rgba(47,107,255,0.32)] ring-1 ring-[rgba(47,107,255,0.35)] shadow-[0_16px_34px_rgba(47,107,255,0.12)]'
          : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-11 h-11 rounded-2xl bg-[var(--dash-accent-soft)] text-[var(--dash-accent)] flex items-center justify-center font-semibold">
          {accountInfo.email.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base text-[var(--dash-text-primary)] truncate">
              {displayName}
            </span>
            {isActive && (
              <span className="dash-pill bg-emerald-50 text-emerald-600">
                当前使用
              </span>
            )}
            <span
              className={`dash-pill ${
                planTypeColors[accountInfo.planType] || planTypeColors.free
              }`}
            >
              {planTypeLabels[accountInfo.planType] || accountInfo.planType}
            </span>
          </div>
          <p className="text-xs text-[var(--dash-text-secondary)] truncate mt-1">
            {accountInfo.email}
          </p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--dash-text-muted)]">周限额</span>
            <span className="text-lg font-semibold text-[var(--dash-text-primary)]">
              {weeklyLeft !== undefined ? `${weeklyLeft}%` : '--'}
            </span>
          </div>
          {usageInfo ? (
            <UsageBar label="周限额" showLabel={false} percentLeft={weeklyLeft ?? 0} />
          ) : (
            <div className="h-1.5 bg-slate-100 rounded-full" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--dash-text-muted)]">5h 限额</span>
            <span className="text-lg font-semibold text-[var(--dash-text-primary)]">
              {fiveHourLeft !== undefined ? `${fiveHourLeft}%` : '--'}
            </span>
          </div>
          {usageInfo ? (
            <UsageBar label="5h 限额" showLabel={false} percentLeft={fiveHourLeft ?? 0} />
          ) : (
            <div className="h-1.5 bg-slate-100 rounded-full" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-start lg:justify-end lg:w-[164px] lg:flex-shrink-0">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="h-9 px-3 bg-[var(--dash-accent)] text-white rounded-full text-xs font-medium hover:brightness-110 transition-colors"
          >
            切换
          </button>
        )}
        <button
          onClick={onRefresh}
          className="h-9 w-9 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 transition-colors flex items-center justify-center"
          title="刷新用量"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="h-9 w-9 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-red-600 hover:border-red-200 transition-colors flex items-center justify-center"
          title="删除账号"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default AccountCard;
