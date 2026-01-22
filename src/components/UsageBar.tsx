import React from 'react';

interface UsageBarProps {
  label: string;
  percentLeft: number;
  resetTime?: string;
  showLabel?: boolean;
}

const getBarColor = (percent: number): string => {
  if (percent >= 50) return 'bg-emerald-500';
  if (percent >= 25) return 'bg-amber-500';
  return 'bg-red-500';
};

export const UsageBar: React.FC<UsageBarProps> = ({ 
  label, 
  percentLeft, 
  resetTime,
  showLabel = true 
}) => {
  const barColor = getBarColor(percentLeft);
  
  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-[#B3B3B3]">{label}</span>
          <span className="text-[#B3B3B3]">
            {percentLeft}% 剩余
            {resetTime && <span className="text-[#606060] ml-2">重置于 {resetTime}</span>}
          </span>
        </div>
      )}
      <div className="h-1.5 bg-[#404040] rounded-sm overflow-hidden">
        <div 
          className={`h-full ${barColor} transition-all duration-300 ease-out`}
          style={{ width: `${percentLeft}%` }}
        />
      </div>
    </div>
  );
};

export default UsageBar;
