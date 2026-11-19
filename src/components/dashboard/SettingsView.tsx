import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2,
  MailCheck,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { PlanConfig, SubscriptionInfo, UserProfile } from '../../types';

interface SettingsViewProps {
  user: UserProfile;
  subscription: SubscriptionInfo | null;
  verificationPreview?: string | null;
  onUserUpdated: (user: UserProfile) => void;
  onAccountDeleted: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  subscription,
  verificationPreview,
  onUserUpdated,
  onAccountDeleted,
}) => {
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(
    user.avatarUrl || '/src/assets/images/student_avatar_default_1795015261884.jpg'
  );
  const [language, setLanguage] = useState(user.language || 'English');
  const [theme, setTheme] = useState<'dark' | 'light'>(user.theme || 'dark');
  const [reducedMotion, setReducedMotion] = useState(Boolean(user.reducedMotion));
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(user.dailyGoalMinutes || 30);
  const [dailyGoalQuestions, setDailyGoalQuestions] = useState(user.dailyGoalQuestions || 15);
  const [notificationsEnabled, setNotificationsEnabled] = useState(Boolean(user.notificationsEnabled));
  const [privacyHideLeaderboard, setPrivacyHideLeaderboard] = useState(Boolean(user.privacyHideLeaderboard));

  const [savingProfile, setSavingProfile] = useState(false);
  const [livePreviewCode, setLivePreviewCode] = useState<string | null>(verificationPreview || null);
  const [verifyCode, setVerifyCode] = useState(verificationPreview || '');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [paymentConfigured, setPaymentConfigured] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user.name);
    setAvatarUrl(user.avatarUrl || '/src/assets/images/student_avatar_default_1795015261884.jpg');
    setLanguage(user.language || 'English');
    setTheme(user.theme || 'dark');
    setReducedMotion(Boolean(user.reducedMotion));
    setDailyGoalMinutes(user.dailyGoalMinutes || 30);
    setDailyGoalQuestions(user.dailyGoalQuestions || 15);
    setNotificationsEnabled(Boolean(user.notificationsEnabled));
    setPrivacyHideLeaderboard(Boolean(user.privacyHideLeaderboard));
  }, [user]);

  useEffect(() => {
    apiFetch<{ plans: PlanConfig[]; paymentConfigured: boolean }>('/api/plans')
      .then((res) => {
        setPlans(res.plans || []);
        setPaymentConfigured(Boolean(res.paymentConfigured));
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (name.trim().length < 2) {
      setError('Full name must be at least 2 characters.');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          avatarUrl: avatarUrl.trim() || null,
          language,
          theme,
          reducedMotion,
          dailyGoalMinutes: Math.min(480, Math.max(5, Number(dailyGoalMinutes) || 30)),
          dailyGoalQuestions: Math.min(200, Math.max(1, Number(dailyGoalQuestions) || 15)),
          notificationsEnabled,
          privacyHideLeaderboard,
        }),
      });
      onUserUpdated(res.user);
      setMessage('Profile and study preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setVerifyingEmail(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      onUserUpdated(res.user);
      setMessage('Email address verified.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification code invalid.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setMessage(null);
    setResendingCode(true);
    try {
      const res = await apiFetch<{
        alreadyVerified?: boolean;
        message: string;
        verificationCodePreview?: string;
        user?: UserProfile;
      }>('/api/auth/resend-verification', {
        method: 'POST',
      });
      if (res.alreadyVerified && res.user) {
        onUserUpdated(res.user);
      }
      if (res.verificationCodePreview) {
        setLivePreviewCode(res.verificationCodePreview);
        setVerifyCode(res.verificationCodePreview);
      }
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code.');
    } finally {
      setResendingCode(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setChangingPassword(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await apiFetch('/api/auth/account', { method: 'DELETE' });
      onAccountDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete account.');
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {message && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-300 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Email Verification */}
      {!user.emailVerified && (
        <form onSubmit={handleVerifyEmail} className="glass-surface rounded-2xl p-6 border border-amber-500/40 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300 font-display font-bold">
            <MailCheck className="w-5 h-5" />
            <span>Verify Your Email Address ({user.email})</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Enter your 6-digit verification code to confirm your account.
            {livePreviewCode && (
              <span className="font-mono font-bold text-blue-500 ml-1">
                Code: {livePreviewCode}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              required
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="6-digit code"
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={verifyingEmail}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer"
            >
              {verifyingEmail ? 'Verifying...' : 'Verify Email'}
            </button>
            <button
              type="button"
              disabled={resendingCode}
              onClick={handleResendVerification}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-sm font-semibold cursor-pointer"
            >
              {resendingCode ? 'Sending...' : 'Resend Code'}
            </button>
          </div>
        </form>
      )}

      {/* Profile & Preferences */}
      <form onSubmit={handleSaveProfile} className="glass-surface rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <img
            src={avatarUrl.trim() || '/src/assets/images/student_avatar_default_1795015261884.jpg'}
            alt={`${user.name} profile avatar`}
            className="w-12 h-12 rounded-full object-cover border border-slate-300 dark:border-slate-700"
            referrerPolicy="no-referrer"
          />
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" />
              Profile, Goals &amp; Accessibility
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.email} · {user.emailVerified ? 'Email verified' : 'Pending verification'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="settings-name" className="block text-xs font-semibold text-slate-500 mb-1">
              Full Name
            </label>
            <input
              id="settings-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div>
            <label htmlFor="settings-lang" className="block text-xs font-semibold text-slate-500 mb-1">
              Preferred Quiz Language
            </label>
            <select
              id="settings-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>

          <div>
            <label htmlFor="settings-theme" className="block text-xs font-semibold text-slate-500 mb-1">
              Appearance Theme
            </label>
            <select
              id="settings-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            >
              <option value="dark">Dark Futuristic Lab</option>
              <option value="light">Light Clean Studio</option>
            </select>
          </div>

          <div>
            <label htmlFor="settings-avatar" className="block text-xs font-semibold text-slate-500 mb-1">
              Avatar Image URL
            </label>
            <input
              id="settings-avatar"
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div>
            <label htmlFor="settings-mins" className="block text-xs font-semibold text-slate-500 mb-1">
              Daily Study Goal (Minutes)
            </label>
            <input
              id="settings-mins"
              type="number"
              min={5}
              max={480}
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(Number(e.target.value) || 30)}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="settings-qs" className="block text-xs font-semibold text-slate-500 mb-1">
              Daily Target Questions
            </label>
            <input
              id="settings-qs"
              type="number"
              min={1}
              max={200}
              value={dailyGoalQuestions}
              onChange={(e) => setDailyGoalQuestions(Number(e.target.value) || 15)}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-2.5 text-sm pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
            <span>Reduce 3D motion &amp; continuous particle animations (accessibility &amp; low-power mode)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
            <span>Enable study reminder alerts inside workspace</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={privacyHideLeaderboard}
              onChange={(e) => setPrivacyHideLeaderboard(e.target.checked)}
            />
            <span>Keep study metrics completely private from cohort leaderboards</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer"
        >
          {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Settings</span>
        </button>
      </form>

      {/* Subscription Plan & Quota */}
      <div className="glass-surface rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-500" />
            Subscription Plan &amp; Quotas
          </h3>
          <span className="font-mono text-xs uppercase font-bold text-blue-600 dark:text-cyan-400">
            Active: {subscription?.plan || 'free'}
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300">
          Current allowances: {subscription?.maxDocuments ?? 10} documents ·{' '}
          {subscription?.maxQuizzesPerMonth ?? 25} quizzes/month.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((p) => {
            const isCurrent = p.id === (subscription?.plan || 'free');
            return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-display font-bold text-sm">
                  <span>{p.name}</span>
                  <span className="font-mono">${p.priceMonthlyUsd}/mo</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {p.maxDocuments} docs · {p.maxQuizzesPerMonth} quizzes/mo
                </p>
                <div className="mt-2 text-[11px] font-semibold text-blue-600 dark:text-cyan-400">
                  {isCurrent
                    ? 'Current Plan'
                    : paymentConfigured
                      ? 'Billing active'
                      : 'Managed by Admin (No billing gateway configured)'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Password Update */}
      <form onSubmit={handleChangePassword} className="glass-surface rounded-2xl p-6 space-y-4">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-500" />
          Security &amp; Password
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password (if set)"
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (6+ characters)"
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={changingPassword}
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-sm font-semibold cursor-pointer"
        >
          {changingPassword ? 'Updating...' : 'Update Password'}
        </button>
      </form>

      {/* Danger Zone */}
      <div className="glass-surface rounded-2xl p-6 border border-red-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-red-600 dark:text-red-400">
            Delete Account &amp; Study Vault
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Permanently deletes your profile, uploaded PDFs, quizzes, and attempt history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Account</span>
        </button>
      </div>

      {confirmDeleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="glass-surface rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display text-lg font-bold text-red-500">
              Confirm Permanent Account Deletion
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This removes all uploaded documents, extracted pages, quizzes, flashcards, and progress. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
