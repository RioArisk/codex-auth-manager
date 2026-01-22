import React from 'react';
import { getProgressBarColor } from '../utils/statusParser';

interface UsageBarProps {
  label: string;
  percentLeft: number;
  resetTime?: string;
  showLabel?: boolean;
}

export const UsageBar: React.FC<UsageBarProps> = ({ 
  label, 
  percentLeft, 
  resetTime,
  showLabel = true 
}) => {
  const barColor = getProgressBarColor(percentLeft);
  
  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-300">
            {percentLeft}% 剩余
            {resetTime && <span className="text-slate-500 ml-2">重置于 {resetTime}</span>}
          </span>
        </div>
      )}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${barColor} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${percentLeft}%` }}
        />
      </div>
    </div>
  );
};

export default UsageBar;
