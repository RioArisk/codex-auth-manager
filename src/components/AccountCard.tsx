import React from 'react';
import type { StoredAccount } from '../types';
import UsageBar from './UsageBar';

interface AccountCardProps {
  account: StoredAccount;
  onSwitch: () => void;
  onDelete: () => void;
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
  isRefreshingSelf?: boolean;
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
  isRefreshing = false,
  isRefreshingSelf = false,
}) => {
  const { accountInfo, usageInfo, isActive, alias } = account;
  const displayName = alias || accountInfo.email.split('@')[0];
  const hasUsage = !!usageInfo && (!usageInfo.status || usageInfo.status === 'ok');
  const fiveHourLeft = usageInfo?.fiveHourLimit?.percentLeft;
  const weeklyLeft = usageInfo?.weeklyLimit?.percentLeft;
  const codeReviewLeft = usageInfo?.codeReviewLimit?.percentLeft;
  const fiveHourReset = usageInfo?.fiveHourLimit?.resetTime;
  const weeklyReset = usageInfo?.weeklyLimit?.resetTime;

  const normalizeWeeklyReset = (value?: string) => {
    if (!value) return null;
    return /^\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ? value : null;
  };

  const normalizeFiveHourReset = (value?: string) => {
    if (!value) return null;
    return /^\d{2}:\d{2}$/.test(value) ? value : null;
  };

  const weeklyResetText = normalizeWeeklyReset(weeklyReset);
  const fiveHourResetText = normalizeFiveHourReset(fiveHourReset);

  const getLastRefreshedText = (value?: string) => {
    if (!value) return null;
    const numeric = /^\d+$/.test(value) ? Number(value) : NaN;
    let timestamp = Number.isFinite(numeric) ? numeric : Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp < 1_000_000_000_000) {
      timestamp *= 1000;
    }
    const diffMs = Date.now() - timestamp;
    if (!Number.isFinite(diffMs) || diffMs < 0) return null;
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `上次刷新 ${hours}小时 ${minutes}分钟`;
  };

  const lastRefreshedText = getLastRefreshedText(usageInfo?.lastUpdated);

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center gap-5 px-4 py-4 rounded-2xl border border-slate-100 bg-white/90 transition-colors ${
        isActive
          ? 'bg-[rgba(47,107,255,0.08)] border-[rgba(47,107,255,0.32)] ring-1 ring-[rgba(47,107,255,0.35)] shadow-[0_16px_34px_rgba(47,107,255,0.12)]'
          : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 lg:flex-[0.85]">
        <div className="w-11 h-11 rounded-2xl bg-[var(--dash-accent-soft)] text-[var(--dash-accent)] flex items-center justify-center font-semibold">
          {accountInfo.email.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base text-[var(--dash-text-primary)] truncate">
              {displayName}
            </span>
            {isActive && (
              <span className="dash-pill bg-emerald-50 text-emerald-600">当前使用</span>
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

      <div className="lg:flex-[1.15] space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2 min-w-0 flex-nowrap">
              <span className="text-xs text-[var(--dash-text-muted)] shrink-0">周限额</span>
              {weeklyResetText && (
                <span className="text-[10px] text-[var(--dash-text-muted)] truncate max-w-[120px]">
                  {weeklyResetText}
                </span>
              )}
              <span className="ml-auto text-lg font-semibold text-[var(--dash-text-primary)] shrink-0">
                {weeklyLeft !== undefined ? `${weeklyLeft}%` : '--'}
              </span>
            </div>
            {hasUsage ? (
              <UsageBar label="周限额" showLabel={false} percentLeft={weeklyLeft ?? 0} />
            ) : (
              <div className="h-1.5 bg-slate-100 rounded-full" />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[var(--dash-text-muted)]">5h 限额</span>
              {fiveHourResetText && (
                <span className="text-[10px] text-[var(--dash-text-muted)]">
                  {fiveHourResetText}
                </span>
              )}
              <span className="ml-auto text-lg font-semibold text-[var(--dash-text-primary)]">
                {fiveHourLeft !== undefined ? `${fiveHourLeft}%` : '--'}
              </span>
            </div>
            {hasUsage ? (
              <UsageBar label="5h 限额" showLabel={false} percentLeft={fiveHourLeft ?? 0} />
            ) : (
              <div className="h-1.5 bg-slate-100 rounded-full" />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--dash-text-muted)]">Code Review</span>
              <span className="text-lg font-semibold text-[var(--dash-text-primary)]">
                {codeReviewLeft !== undefined ? `${codeReviewLeft}%` : '--'}
              </span>
            </div>
            {hasUsage && codeReviewLeft !== undefined ? (
              <UsageBar label="Code Review" showLabel={false} percentLeft={codeReviewLeft ?? 0} />
            ) : (
              <div className="h-1.5 bg-slate-100 rounded-full" />
            )}
          </div>
        </div>

        {usageInfo?.status && usageInfo.status !== 'ok' && (
          <div className="w-full rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 truncate">
            {usageInfo.message || '用量信息不可用'}
          </div>
        )}

        {lastRefreshedText && (
          <div className="text-[11px] text-[var(--dash-text-muted)]">
            {lastRefreshedText}
          </div>
        )}
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
          disabled={isRefreshing}
          className="h-9 w-9 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 transition-colors flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
          title="刷新用量"
        >
          <svg
            className={`w-4 h-4 ${isRefreshingSelf ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
