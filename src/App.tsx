import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { apiFetch, setClientSessionToken } from './lib/api';
import { auth } from './lib/firebase';
import { LandingPage } from './components/LandingPage';
import { AuthView } from './components/AuthView';
import { DashboardLayout } from './components/DashboardLayout';
import type { SubscriptionInfo, UserProfile } from './types';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authScreen, setAuthScreen] = useState<'signup' | 'login' | null>(null);
  const [verificationPreview, setVerificationPreview] = useState<string | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const autoStart = params.get('autostart') === '1';

    apiFetch<{
      authenticated: boolean;
      user: UserProfile | null;
      sessionToken?: string;
      subscription: SubscriptionInfo | null;
    }>('/api/auth/session')
      .then((res) => {
        if (!active) return;
        if (res.authenticated && res.user) {
          if (res.sessionToken) setClientSessionToken(res.sessionToken);
          setUser(res.user);
          setSubscription(res.subscription);
          setTheme(res.user.theme || 'dark');
          setReducedMotion(Boolean(res.user.reducedMotion));
        } else if (autoStart) {
          setAuthScreen('signup');
        }
      })
      .catch(() => {
        if (!active) return;
        if (autoStart) {
          setAuthScreen('signup');
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAuthSuccess = (loggedInUser: UserProfile, verPreview?: string) => {
    setUser(loggedInUser);
    setTheme(loggedInUser.theme || 'dark');
    setReducedMotion(Boolean(loggedInUser.reducedMotion));
    if (verPreview) setVerificationPreview(verPreview);
    setAuthScreen(null);
    apiFetch<{ subscription: SubscriptionInfo }>('/api/auth/me')
      .then((res) => setSubscription(res.subscription))
      .catch(() => {
        // ignore
      });
  };

  const handleDemoLogin = async () => {
    setCheckingSession(true);
    try {
      const res = await apiFetch<{ user: UserProfile; sessionToken?: string }>('/api/auth/demo', {
        method: 'POST',
      });
      if (res.sessionToken) setClientSessionToken(res.sessionToken);
      handleAuthSuccess(res.user);
    } catch {
      setAuthScreen('login');
    } finally {
      setCheckingSession(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setClientSessionToken(null);
    setUser(null);
    setSubscription(null);
    setVerificationPreview(null);
    setAuthScreen(null);
  };

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (user) {
      apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ theme: next }),
      })
        .then((res) => setUser(res.user))
        .catch(() => {
          // ignore
        });
    }
  };

  const handleToggleReducedMotion = () => {
    const next = !reducedMotion;
    setReducedMotion(next);
    if (user) {
      apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ reducedMotion: next }),
      })
        .then((res) => setUser(res.user))
        .catch(() => {
          // ignore
        });
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#050814] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        <span className="font-display text-sm text-slate-300">Initializing AI QUIZ MASTER...</span>
      </div>
    );
  }

  if (user) {
    return (
      <DashboardLayout
        user={user}
        subscription={subscription}
        verificationPreview={verificationPreview}
        theme={theme}
        reducedMotion={reducedMotion}
        onToggleTheme={handleToggleTheme}
        onToggleReducedMotion={handleToggleReducedMotion}
        onUserUpdated={(updated) => {
          setUser(updated);
          setTheme(updated.theme || 'dark');
          setReducedMotion(Boolean(updated.reducedMotion));
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (authScreen) {
    return (
      <AuthView
        initialMode={authScreen}
        onBack={() => setAuthScreen(null)}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  return (
    <LandingPage
      onStartAuth={(mode = 'signup') => setAuthScreen(mode)}
      onDemoLogin={handleDemoLogin}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      reducedMotion={reducedMotion}
      onToggleReducedMotion={handleToggleReducedMotion}
    />
  );
}
