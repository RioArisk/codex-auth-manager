import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (authJson: string, alias?: string) => Promise<void>;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [authJson, setAuthJson] = useState('');
  const [alias, setAlias] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  
  if (!isOpen) return null;
  
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });
      
      if (selected) {
        const content = await invoke<string>('read_file_content', { 
          filePath: selected 
        });
        setAuthJson(content);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取文件');
    }
  };
  
  const handleImportCurrent = async () => {
    try {
      setIsLoading(true);
      const content = await invoke<string>('read_codex_auth');
      setAuthJson(content);
      setError(null);
    } catch (err) {
      setError('未找到当前Codex配置文件。请确保已登录Codex。');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      const parsed = JSON.parse(authJson);
      if (!parsed.tokens || !parsed.tokens.id_token) {
        throw new Error('无效的auth.json格式：缺少tokens字段');
      }
      
      await onAdd(authJson, alias || undefined);
      
      setAuthJson('');
      setAlias('');
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('JSON格式无效，请检查输入');
      } else {
        setError(err instanceof Error ? err.message : '添加账号失败');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[#2D2D2D] rounded-lg p-5 w-full max-w-lg mx-4 border border-[#404040] shadow-xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-white">添加 Codex 账号</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#808080] hover:text-white hover:bg-[#383838] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 模式选择 */}
        <div className="flex gap-1 mb-4 p-1 bg-[#1F1F1F] rounded">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`flex-1 py-1.5 px-3 rounded text-sm transition-colors ${
              mode === 'paste' 
                ? 'bg-[#383838] text-white' 
                : 'text-[#808080] hover:text-white'
            }`}
          >
            粘贴JSON
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex-1 py-1.5 px-3 rounded text-sm transition-colors ${
              mode === 'file' 
                ? 'bg-[#383838] text-white' 
                : 'text-[#808080] hover:text-white'
            }`}
          >
            选择文件
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          {/* 别名输入 */}
          <div className="mb-4">
            <label className="block text-[#B3B3B3] text-xs font-medium mb-1.5">
              账号别名（可选）
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="例如：工作账号、个人账号..."
              className="w-full h-9 px-3 bg-[#1F1F1F] border border-[#404040] rounded text-sm text-white placeholder-[#606060] focus:border-emerald-600 outline-none transition-colors"
            />
          </div>
          
          {mode === 'paste' ? (
            <div className="mb-4">
              <label className="block text-[#B3B3B3] text-xs font-medium mb-1.5">
                auth.json 内容
              </label>
              <textarea
                value={authJson}
                onChange={(e) => setAuthJson(e.target.value)}
                placeholder='粘贴 .codex/auth.json 文件的内容...'
                rows={6}
                className="w-full px-3 py-2 bg-[#1F1F1F] border border-[#404040] rounded text-sm text-white placeholder-[#606060] focus:border-emerald-600 outline-none transition-colors font-mono resize-none"
              />
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-[#B3B3B3] text-xs font-medium mb-1.5">
                选择 auth.json 文件
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  className="flex-1 h-9 bg-[#383838] hover:bg-[#454545] text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  选择文件
                </button>
                <button
                  type="button"
                  onClick={handleImportCurrent}
                  disabled={isLoading}
                  className="flex-1 h-9 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  导入当前账号
                </button>
              </div>
              
              {authJson && (
                <div className="mt-2 p-2 bg-[#1F1F1F] rounded border border-[#404040]">
                  <p className="text-xs text-[#606060] mb-1">已加载文件内容</p>
                  <pre className="text-xs text-[#808080] overflow-auto max-h-24 font-mono">
                    {authJson.substring(0, 200)}...
                  </pre>
                </div>
              )}
            </div>
          )}
          
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-2.5 bg-red-600/10 border border-red-600/30 rounded text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 bg-[#383838] hover:bg-[#454545] text-white rounded text-sm transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!authJson || isLoading}
              className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#383838] disabled:text-[#606060] text-white rounded text-sm font-medium transition-colors"
            >
              {isLoading ? '添加中...' : '添加账号'}
            </button>
          </div>
        </form>
        
        {/* 帮助提示 */}
        <div className="mt-4 p-2.5 bg-[#1F1F1F] rounded border border-[#404040]">
          <p className="text-xs text-[#606060]">
            <span className="text-[#808080]">提示：</span> auth.json 文件位于 
            <code className="mx-1 px-1 py-0.5 bg-[#2D2D2D] rounded text-[#B3B3B3] font-mono">
              %USERPROFILE%\.codex\auth.json
            </code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AddAccountModal;
