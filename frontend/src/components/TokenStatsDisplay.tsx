import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { TokenStats } from '@/types';

interface TokenStatsDisplayProps {
  sessionId: string | null;
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatTime(ms: number): string {
  if (ms === 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

export function TokenStatsDisplay({ sessionId }: TokenStatsDisplayProps) {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStats(null);
      setIsInitialLoad(true);
      return;
    }

    const fetchStats = async (isFirst: boolean) => {
      if (isFirst) {
        setIsInitialLoad(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const data = await api.getSessionTokenStats(sessionId);
        setStats(data);
        if (isFirst) {
          setIsInitialLoad(false);
        }
      } catch (err) {
        console.error('Failed to fetch session token stats:', err);
        if (isFirst) {
          setIsInitialLoad(false);
        }
      } finally {
        setIsRefreshing(false);
      }
    };

    // Initial fetch
    fetchStats(true);

    // Refresh every 10 seconds while on the page
    const interval = setInterval(() => fetchStats(false), 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Hide only if no sessionId OR still on initial load with no data
  if (!sessionId || (isInitialLoad && !stats)) {
    return null;
  }

  // Don't show if we have no tokens yet
  if (stats && stats.totalTokens === 0) {
    return null;
  }

  return (
    <div className="card border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Usage Statistics
          </h3>
          {isRefreshing && (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" title="Updating..." />
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Tokens
            </span>
            <span className="font-mono text-sm font-medium text-slate-700">
              {formatNumber(stats.totalTokens)}
            </span>
            <span className="text-[10px] text-slate-400">
              {formatNumber(stats.totalInputTokens)} in / {formatNumber(stats.totalOutputTokens)} out
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Cost
            </span>
            <span className="font-mono text-lg font-semibold text-indigo-600">
              {formatCost(stats.totalCost)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Total Time
            </span>
            <span className="font-mono text-sm font-medium text-slate-700">
              {formatTime(stats.totalExecutionMs)}
            </span>
          </div>
          {stats.runCount > 1 && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Interactions
              </span>
              <span className="font-mono text-sm font-medium text-slate-700">
                {stats.runCount}
              </span>
              <span className="text-[10px] text-slate-400">
                Initial run + {stats.runCount - 1} Q&A
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
