import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, FileText, Save, Shield, Users } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { PlanConfig } from '../../types';

interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  xp: number;
  streakDays: number;
  createdAt: string;
  subscription: {
    plan: string;
    maxDocuments: number;
    maxQuizzesPerMonth: number;
  } | null;
}

interface AdminErrorLog {
  id: number;
  context: string;
  message: string;
  createdAt: string;
}

interface AdminConfig {
  plans: PlanConfig[];
  features: {
    ocrFallbackEnabled: boolean;
    strictSourceVerification: boolean;
  };
}

export const AdminView: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [docStats, setDocStats] = useState({ totalDocuments: 0, totalPages: 0 });
  const [usageStats, setUsageStats] = useState({ totalActions: 0, totalTokens: 0 });
  const [errorLogs, setErrorLogs] = useState<AdminErrorLog[]>([]);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAdmin = () => {
    setLoading(true);
    apiFetch<{
      users: AdminUserRow[];
      documentStats: { totalDocuments: number; totalPages: number };
      usageStats: { totalActions: number; totalTokens: number };
      errorLogs: AdminErrorLog[];
      config: AdminConfig;
    }>('/api/admin/overview')
      .then((res) => {
        setUsers(res.users);
        setDocStats(res.documentStats);
        setUsageStats(res.usageStats);
        setErrorLogs(res.errorLogs);
        setConfig(res.config);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Admin access required.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const updateUser = async (userId: number, updates: { role?: string; plan?: string }) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setNotice('Updated user permissions and quota.');
      loadAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/config', {
        method: 'PATCH',
        body: JSON.stringify({ config }),
      });
      setNotice('Saved system plan limits & feature toggles.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  };

  if (loading) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
        Loading admin telemetry...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-500">
          {notice}
        </div>
      )}

      {/* Platform Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Total Users</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">{users.length}</div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Uploaded Documents</span>
            <FileText className="w-4 h-4 text-violet-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {docStats.totalDocuments} ({docStats.totalPages} pg)
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>AI Usage Tokens</span>
            <Activity className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {usageStats.totalTokens.toLocaleString()}
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Error Logs</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {errorLogs.length}
          </div>
        </div>
      </div>

      {/* Users Management Table */}
      <div className="glass-surface rounded-2xl p-6 space-y-4 overflow-x-auto">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-500" />
          User Accounts &amp; Plan Quotas
        </h2>
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">XP / Streak</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2">Plan Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-4">
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="py-3 pr-4 font-mono text-xs tabular-nums">
                  {u.xp} XP · {u.streakDays}d
                </td>
                <td className="py-3 pr-4">
                  <select
                    aria-label={`Role for ${u.email}`}
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                  >
                    <option value="student">student</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-3">
                  <select
                    aria-label={`Plan for ${u.email}`}
                    value={u.subscription?.plan || 'free'}
                    onChange={(e) => updateUser(u.id, { plan: e.target.value })}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="premium">premium</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System Plans & Feature Toggles */}
      {config && (
        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Plan Limits &amp; System Features</h3>
            <button
              type="button"
              onClick={saveConfig}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Config</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.features?.ocrFallbackEnabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    features: { ...config.features, ocrFallbackEnabled: e.target.checked },
                  })
                }
              />
              <span>OCR Fallback for Scanned PDFs</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.features?.strictSourceVerification}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    features: { ...config.features, strictSourceVerification: e.target.checked },
                  })
                }
              />
              <span>Strict Source Evidence Verification</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.plans.map((plan, idx) => (
              <div key={plan.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-display font-bold text-sm">{plan.name}</div>
                <label className="block text-xs text-slate-500">
                  Max Documents
                  <input
                    type="number"
                    value={plan.maxDocuments}
                    onChange={(e) => {
                      const next = [...config.plans];
                      next[idx] = { ...plan, maxDocuments: Number(e.target.value) || 1 };
                      setConfig({ ...config, plans: next });
                    }}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs tabular-nums"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Max Quizzes / Month
                  <input
                    type="number"
                    value={plan.maxQuizzesPerMonth}
                    onChange={(e) => {
                      const next = [...config.plans];
                      next[idx] = { ...plan, maxQuizzesPerMonth: Number(e.target.value) || 1 };
                      setConfig({ ...config, plans: next });
                    }}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs tabular-nums"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Logs */}
      <div className="glass-surface rounded-2xl p-6 space-y-3">
        <h3 className="font-display text-lg font-bold">Recent Server Error Logs</h3>
        {errorLogs.length === 0 ? (
          <p className="text-xs text-slate-500">No server errors recorded.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto text-xs font-mono">
            {errorLogs.map((log) => (
              <div key={log.id} className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900/70">
                <span className="text-amber-500">[{log.context}]</span> {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
