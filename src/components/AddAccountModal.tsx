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
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">添加 Codex 账号</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 模式选择 */}
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-full">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`flex-1 py-1.5 px-3 rounded-full text-sm transition-colors ${
              mode === 'paste' 
                ? 'bg-white text-[var(--dash-text-primary)] shadow-sm' 
                : 'text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)]'
            }`}
          >
            粘贴JSON
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex-1 py-1.5 px-3 rounded-full text-sm transition-colors ${
              mode === 'file' 
                ? 'bg-white text-[var(--dash-text-primary)] shadow-sm' 
                : 'text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)]'
            }`}
          >
            选择文件
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          {/* 别名输入 */}
          <div className="mb-4">
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
              账号别名（可选）
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="例如：工作账号、个人账号..."
              className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
            />
          </div>
          
          {mode === 'paste' ? (
            <div className="mb-4">
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                auth.json 内容
              </label>
              <textarea
                value={authJson}
                onChange={(e) => setAuthJson(e.target.value)}
                placeholder='粘贴 .codex/auth.json 文件的内容...'
                rows={6}
                className="w-full px-3 py-2 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors font-mono resize-none"
              />
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                选择 auth.json 文件
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
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
                  className="flex-1 h-10 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  导入当前账号
                </button>
              </div>
              
              {authJson && (
                <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-[var(--dash-border)]">
                  <p className="text-xs text-[var(--dash-text-muted)] mb-1">已加载文件内容</p>
                  <pre className="text-xs text-[var(--dash-text-secondary)] overflow-auto max-h-24 font-mono">
                    {authJson.substring(0, 200)}...
                  </pre>
                </div>
              )}
            </div>
          )}
          
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
          
          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!authJson || isLoading}
              className="flex-1 h-10 bg-[var(--dash-accent)] hover:brightness-110 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {isLoading ? '添加中...' : '添加账号'}
            </button>
          </div>
        </form>
        
        {/* 帮助提示 */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-[var(--dash-border)]">
          <p className="text-xs text-[var(--dash-text-muted)]">
            <span className="text-[var(--dash-text-secondary)]">提示：</span> auth.json 文件位于 
            <code className="mx-1 px-1.5 py-0.5 bg-white rounded text-[var(--dash-text-secondary)] font-mono">
              %USERPROFILE%\.codex\auth.json
            </code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AddAccountModal;
