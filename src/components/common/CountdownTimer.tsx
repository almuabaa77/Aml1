import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Timer } from 'lucide-react';

interface CountdownTimerProps {
  expiresAt: any; // Firebase Timestamp
  onExpire?: () => void;
  className?: string;
  showIcon?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ expiresAt, onExpire, className, showIcon = true }) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const expires = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
      const now = new Date();
      const diff = expires.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft(null);
        setIsExpired(true);
        if (onExpire) onExpire();
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        let timeString = '';
        if (h > 0) timeString += `${h}:`;
        timeString += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        setTimeLeft(timeString);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (isExpired || !timeLeft) return null;

  return (
    <div className={cn("inline-flex items-center gap-1.5 font-mono tabular-nums leading-none transition-all", className)}>
      {showIcon && <Timer className="h-3 w-3 animate-pulse" />}
      <span>{timeLeft}</span>
    </div>
  );
};
