import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;
  
  const variantStyles = {
    danger: {
      icon: 'text-red-400',
      iconBg: 'bg-red-600/20',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'text-amber-400',
      iconBg: 'bg-amber-600/20',
      button: 'bg-amber-600 hover:bg-amber-700',
    },
    info: {
      icon: 'text-emerald-400',
      iconBg: 'bg-emerald-600/20',
      button: 'bg-emerald-600 hover:bg-emerald-700',
    },
  };
  
  const styles = variantStyles[variant];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[#2D2D2D] rounded-lg p-5 w-full max-w-sm mx-4 border border-[#404040] shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${styles.iconBg} ${styles.icon}`}>
            {variant === 'danger' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {variant === 'warning' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {variant === 'info' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-sm text-[#B3B3B3] mt-1">{message}</p>
          </div>
        </div>
        
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="h-8 px-4 bg-[#383838] hover:bg-[#454545] text-white rounded text-sm transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`h-8 px-4 ${styles.button} text-white rounded text-sm font-medium transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
