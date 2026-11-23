import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api, setAdminToken, setPlayerToken } from '../lib/api';
import { signInWithGooglePopup, syncFirebasePlayerProfile } from '../lib/firebase';
import { PlayerProfile } from '../shared/types';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: PlayerProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'register'
          ? await api.register(username, password)
          : await api.login(username, password);
      setPlayerToken(res.token);
      if (res.user.role === 'admin') {
        setAdminToken(res.token);
      }
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const idToken = await signInWithGooglePopup();
      const res = await api.firebaseAuth(idToken);
      if (res.needsUsername) {
        setPendingGoogleIdToken(idToken);
        setGoogleEmail(res.email || '');
      } else if (res.token && res.user) {
        setPlayerToken(res.token);
        if (res.user.role === 'admin') {
          setAdminToken(res.token);
        }
        onSuccess(res.user);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteGoogleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleIdToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.firebaseAuth(pendingGoogleIdToken, username);
      if (res.token && res.user) {
        await syncFirebasePlayerProfile(res.user.username);
        setPlayerToken(res.token);
        if (res.user.role === 'admin') {
          setAdminToken(res.token);
        }
        onSuccess(res.user);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-[#121821] border border-white/15 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-display font-bold text-white">
              {pendingGoogleIdToken
                ? 'Choose Unique Username'
                : mode === 'register'
                  ? 'Create B-WILL Account'
                  : 'Sign In to B-WILL'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {pendingGoogleIdToken
                ? `Signed in as ${googleEmail}. Pick a unique player handle.`
                : 'Access dual-slot betting, wallet requests, and leaderboard rankings.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!pendingGoogleIdToken ? (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F14] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'login' ? 'bg-[#1D2736] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'register' ? 'bg-[#1D2736] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleLocalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="auth-username" className="block text-xs font-medium text-slate-300">
                  Unique Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Player_One"
                  className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/25 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer"
              >
                {loading
                  ? 'Submitting...'
                  : mode === 'register'
                    ? 'Create Account'
                    : 'Sign In'}
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-white/10" />
              <span className="px-3 text-xs text-slate-500">or</span>
              <div className="flex-grow border-t border-white/10" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[44px] bg-[#0B0F14] hover:bg-[#161E29] border border-white/15 text-slate-200 font-medium text-sm rounded-lg transition-colors cursor-pointer"
            >
              Continue with Google
            </button>
          </>
        ) : (
          <form onSubmit={handleCompleteGoogleUsername} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="google-username" className="block text-xs font-medium text-slate-300">
                Username
              </label>
              <input
                id="google-username"
                type="text"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-20 alphanumeric or underscore"
                className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/25 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer"
            >
              {loading ? 'Saving Profile...' : 'Complete Registration'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
