import { useEffect, useRef, useCallback, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { invoke } from '@tauri-apps/api/core';
import type { UsageInfo } from '../types';

/**
 * Rust 鍚庣杩斿洖鐨勭敤閲忔暟鎹粨鏋?
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
  status: 'ok' | 'missing_account_id' | 'missing_token' | 'no_codex_access' | 'no_usage' | 'error';
  message?: string;
  plan_type?: string;
  usage?: RustUsageData;
}

/**
 * 鑷姩鍒锋柊鐢ㄩ噺鏁版嵁鐨凥ook
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
    | 'error'
    | 'skipped';
  type RefreshResult = { status: RefreshStatus; message?: string };
  type RefreshAllResult = { updated: number; missing: number; skipped: boolean };

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

      if (usageResult.status === 'no_usage') {
        return { usage: buildStatusUsageInfo(usageResult), status: 'no-usage' };
      }

      if (usageResult.status === 'missing_account_id') {
        return { usage: buildStatusUsageInfo(usageResult), status: 'missing-account-id' };
      }

      if (usageResult.status === 'missing_token') {
        return { usage: buildStatusUsageInfo(usageResult), status: 'missing-token' };
      }

      if (usageResult.status === 'no_codex_access') {
        return { usage: buildStatusUsageInfo(usageResult), status: 'no-codex-access' };
      }

      return { usage: buildStatusUsageInfo(usageResult), status: 'error' };
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
   * 鍒锋柊鎵€鏈夎处鍙风殑鐢ㄩ噺
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
        if (status === 'success' && usage) {
          await updateUsage(account.id, usage);
        }
        if (status === 'success') {
          updated += 1;
        } else {
          missing += 1;
        }
        // 娣诲姞灏忓欢杩熼伩鍏嶈繃蹇垏鎹?
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return { updated, missing, skipped: false };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [accounts, fetchAccountUsage, updateUsage]);
  
  /**
   * 鍒锋柊鍗曚釜璐﹀彿鐨勭敤閲?
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

      if (status === 'success' && usage) {
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
  
  // 璁剧疆鑷姩鍒锋柊瀹氭椂鍣?
  useEffect(() => {
    if (config.autoRefreshInterval <= 0 || accounts.length === 0) {
      return;
    }
    
    // 娓呴櫎鏃х殑瀹氭椂鍣?
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // 璁剧疆鏂扮殑瀹氭椂鍣紙闂撮殧浠ュ垎閽熶负鍗曚綅锛?
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
  // 当前活跃账号变化时自动刷新 quota
  // 鐢ㄤ簬妫€娴嬪閮ㄧ櫥褰?鐧诲嚭鎿嶄綔骞跺悓姝ュ墠绔姸鎬?
  useEffect(() => {
    // 娓呴櫎鏃х殑瀹氭椂鍣?
    if (authCheckIntervalRef.current) {
      clearInterval(authCheckIntervalRef.current);
    }
  // 当前活跃账号变化时自动刷新 quota
    const AUTH_CHECK_INTERVAL = 30 * 1000; // 30绉?
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













