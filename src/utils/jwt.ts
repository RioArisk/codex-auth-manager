import type { AccountInfo, CodexAuthConfig } from '../types';

/**
 * 解码JWT token的payload部分（不验证签名）
 */
function decodeJWTPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    // Base64Url decode
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const decoded = atob(padded);
    
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    throw new Error('Invalid JWT token');
  }
}

/**
 * 从id_token解析账号信息
 */
export function parseAccountInfo(authConfig: CodexAuthConfig): AccountInfo {
  const payload = decodeJWTPayload(authConfig.tokens.id_token);
  
  // 获取OpenAI特定的auth信息
  const authData = payload['https://api.openai.com/auth'] as Record<string, unknown> | undefined;
  
  if (!authData) {
    throw new Error('Missing OpenAI auth data in token');
  }
  
  return {
    email: payload['email'] as string || 'Unknown',
    planType: (authData['chatgpt_plan_type'] as string || 'free') as AccountInfo['planType'],
    accountId: authData['chatgpt_account_id'] as string || authConfig.tokens.account_id,
    userId: authData['chatgpt_user_id'] as string || '',
    subscriptionActiveUntil: authData['chatgpt_subscription_active_until'] as string | undefined,
    organizations: (authData['organizations'] as AccountInfo['organizations']) || [],
  };
}

/**
 * 检查token是否已过期
 */
export function isTokenExpired(authConfig: CodexAuthConfig): boolean {
  try {
    const payload = decodeJWTPayload(authConfig.tokens.id_token);
    const exp = payload['exp'] as number;
    
    if (!exp) return true;
    
    // 提前5分钟认为过期
    const expirationTime = exp * 1000 - 5 * 60 * 1000;
    return Date.now() > expirationTime;
  } catch {
    return true;
  }
}

/**
 * 获取token过期时间
 */
export function getTokenExpirationDate(authConfig: CodexAuthConfig): Date | null {
  try {
    const payload = decodeJWTPayload(authConfig.tokens.id_token);
    const exp = payload['exp'] as number;
    
    if (!exp) return null;
    
    return new Date(exp * 1000);
  } catch {
    return null;
  }
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}
