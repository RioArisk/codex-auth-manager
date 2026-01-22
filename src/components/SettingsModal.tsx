import React, { useState } from 'react';
import type { AppConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onClose: () => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
}) => {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(config.autoRefreshInterval);
  const [isSaving, setIsSaving] = useState(false);
  
  if (!isOpen) return null;
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ autoRefreshInterval });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[#2D2D2D] rounded-lg p-5 w-full max-w-sm mx-4 border border-[#404040] shadow-xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-white">设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#808080] hover:text-white hover:bg-[#383838] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-5">
          {/* 自动刷新间隔 */}
          <div>
            <label className="block text-[#B3B3B3] text-xs font-medium mb-2">
              自动刷新间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="flex-1 h-1 bg-[#404040] rounded appearance-none cursor-pointer accent-emerald-600"
              />
              <span className="text-white text-sm w-16 text-right tabular-nums">
                {autoRefreshInterval === 0 ? '禁用' : `${autoRefreshInterval} 分钟`}
              </span>
            </div>
            <p className="text-xs text-[#606060] mt-2">
              设置为0禁用自动刷新
            </p>
          </div>
          
          {/* 关于 */}
          <div className="pt-4 border-t border-[#404040]">
            <h3 className="text-[#B3B3B3] text-xs font-medium mb-2">关于</h3>
            <div className="space-y-1 text-sm text-[#808080]">
              <p>Codex Manager v0.1.0</p>
              <p className="text-xs text-[#606060]">
                管理多个 OpenAI Codex 账号的桌面工具
              </p>
              <p className="text-xs text-[#606060] mt-2">
                所有数据存储在本地
              </p>
            </div>
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 h-9 bg-[#383838] hover:bg-[#454545] text-white rounded text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#383838] text-white rounded text-sm font-medium transition-colors"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
