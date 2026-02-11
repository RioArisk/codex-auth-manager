import { useEffect, useRef, useCallback, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { invoke } from '@tauri-apps/api/core';
import type { UsageInfo } from '../types';

/**
 * Rust 后端返回的用量数据结构
 */
interface RustUsageData {
  five_hour_percent_left: number;
  five_hour_reset_time_ms: number;
  weekly_percent_left: number;
  weekly_reset_time_ms: number;
  code_review_percent_left?: number;
  code_review_reset_time_ms?: number;
  last_updated: string;
}

interface RustUsageResult {
  status: 'ok' | 'missing_account_id' | 'missing_token' | 'no_codex_access' | 'no_usage' | 'expired' | 'forbidden' | 'error';
  message?: string;
  plan_type?: string;
  usage?: RustUsageData;
}


const formatResetTime = (resetTimeMs: number, includeWeekday: boolean): string => {
  if (!Number.isFinite(resetTimeMs) || resetTimeMs <= 0) {
    throw new Error('Invalid reset timestamp');
  }

  const date = new Date(resetTimeMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid reset timestamp');
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (!includeWeekday) {
    return `${hours}:${minutes}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const buildUsageInfo = (usageData: RustUsageData, planType?: string): UsageInfo => ({
  status: 'ok',
  planType,
  fiveHourLimit: {
    percentLeft: Math.round(usageData.five_hour_percent_left),
    resetTime: formatResetTime(usageData.five_hour_reset_time_ms, false),
  },
  weeklyLimit: {
    percentLeft: Math.round(usageData.weekly_percent_left),
    resetTime: formatResetTime(usageData.weekly_reset_time_ms, true),
  },
  codeReviewLimit: Number.isFinite(usageData.code_review_percent_left) &&
    Number.isFinite(usageData.code_review_reset_time_ms)
    ? {
        percentLeft: Math.round(usageData.code_review_percent_left as number),
        resetTime: formatResetTime(usageData.code_review_reset_time_ms as number, false),
      }
    : undefined,
  lastUpdated: usageData.last_updated,
});

const buildStatusUsageInfo = (result: RustUsageResult): UsageInfo => ({
  status: result.status,
  message: result.message,
  planType: result.plan_type,
  lastUpdated: new Date().toISOString(),
});

/**
 * 自动刷新用量数据的 Hook
 */
export function useAutoRefresh() {
  const { accounts, config, updateUsage, activeAccountId, syncCurrentAccount } = useAccountStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const autoRefreshAccountIdRef = useRef<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  type RefreshStatus =
    | 'success'
    | 'no-usage'
    | 'missing-account-id'
    | 'missing-token'
    | 'no-codex-access'
    | 'expired'
    | 'forbidden'
    | 'error'
    | 'skipped';
  type RefreshResult = { status: RefreshStatus; message?: string };
  type RefreshAllResult = { updated: number; missing: number; skipped: boolean };


  /**
   * 获取单个账号的用量信息
   * 通过 wham/usage API 获取 Codex quota
   */
  const fetchAccountUsage = useCallback(async (accountId: string): Promise<{
    usage: UsageInfo | null;
    status: RefreshStatus;
  }> => {
    try {
      const usageResult = await invoke<RustUsageResult>('get_codex_wham_usage', {
        accountId,
        proxyEnabled: config.proxyEnabled,
        proxyUrl: config.proxyUrl,
      });

      if (usageResult.status === 'ok' && usageResult.usage) {
        return {
          usage: buildUsageInfo(usageResult.usage, usageResult.plan_type),
          status: 'success',
        };
      }
      const statusMap: Partial<Record<RustUsageResult['status'], RefreshStatus>> = {
        no_usage: 'no-usage',
        missing_account_id: 'missing-account-id',
        missing_token: 'missing-token',
        no_codex_access: 'no-codex-access',
        expired: 'expired',
        forbidden: 'forbidden',
        error: 'error',
      };
      const mappedStatus = statusMap[usageResult.status] ?? 'error';
      return { usage: buildStatusUsageInfo(usageResult), status: mappedStatus };
    } catch (error) {
      console.error(`Failed to fetch usage for account ${accountId}:`, error);
      return {
        usage: {
          status: 'error',
          message: error instanceof Error ? error.message : 'wham/usage 请求失败',
          lastUpdated: new Date().toISOString(),
        },
        status: 'error',
      };
    }
  }, [config.proxyEnabled, config.proxyUrl]);

  /**
   * 刷新所有账号的用量
   */
  const refreshAllUsage = useCallback(async (): Promise<RefreshAllResult> => {
    if (isRefreshingRef.current || accounts.length === 0) {
      return { updated: 0, missing: 0, skipped: true };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    let updated = 0;
    let missing = 0;

    try {
      for (const account of accounts) {
        const { usage, status } = await fetchAccountUsage(account.id);
        // 无论成功还是失败都保存 usage 信息，让 UI 能展示错误状态
        if (usage) {
          await updateUsage(account.id, usage);
        }
        if (status === 'success') {
          updated += 1;
        } else {
          missing += 1;
        }
        // 添加延迟避免过快请求
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return { updated, missing, skipped: false };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [accounts, fetchAccountUsage, updateUsage]);

  /**
   * 刷新单个账号的用量
   */
  const refreshSingleAccount = useCallback(async (accountId: string): Promise<RefreshResult> => {
    if (isRefreshingRef.current) {
      return { status: 'skipped' };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    let status: RefreshStatus = 'no-usage';
    let message: string | undefined;

    try {
      const { usage, status: fetchStatus } = await fetchAccountUsage(accountId);
      status = fetchStatus === 'success' ? 'success' : fetchStatus;
      message = usage?.message;

      // 无论成功还是失败都保存 usage 信息
      if (usage) {
        await updateUsage(accountId, usage);
      }

      return { status, message };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [fetchAccountUsage, updateUsage]);

  // 当前活跃账号变化时自动刷新 quota
  useEffect(() => {
    if (!activeAccountId) {
      autoRefreshAccountIdRef.current = null;
      return;
    }

    if (autoRefreshAccountIdRef.current === activeAccountId) {
      return;
    }

    const activeAccount = accounts.find(account => account.id === activeAccountId);
    if (!activeAccount) return;

    const runAutoRefresh = async () => {
      autoRefreshAccountIdRef.current = activeAccountId;
      await refreshSingleAccount(activeAccountId);
    };

    void runAutoRefresh();
  }, [accounts, activeAccountId, refreshSingleAccount]);

  // 设置自动刷新定时器
  useEffect(() => {
    if (config.autoRefreshInterval <= 0 || accounts.length === 0) {
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const intervalMs = config.autoRefreshInterval * 60 * 1000;
    intervalRef.current = setInterval(() => {
      void refreshAllUsage();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.autoRefreshInterval, accounts.length, refreshAllUsage]);

  // 定期检测外部登录/登出操作并同步前端状态
  useEffect(() => {
    if (authCheckIntervalRef.current) {
      clearInterval(authCheckIntervalRef.current);
    }

    const AUTH_CHECK_INTERVAL = 30 * 1000;
    authCheckIntervalRef.current = setInterval(() => {
      syncCurrentAccount();
    }, AUTH_CHECK_INTERVAL);

    return () => {
      if (authCheckIntervalRef.current) {
        clearInterval(authCheckIntervalRef.current);
      }
    };
  }, [syncCurrentAccount]);

  return {
    refreshAllUsage,
    refreshSingleAccount,
    isRefreshing,
  };
}

export default useAutoRefresh;
