import React, { useState, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setShowAuthModal,
  setIsAuthenticated,
  setAuthModalContext,
  hydrateSession,
  setLoading,
} from '../../store/slices/appSlice';
import { authRegister, authLogin, toUserState } from '../../services/api';
import { X, Mail, Lock, User, BookOpen, Eye, EyeOff, Loader2, GraduationCap } from 'lucide-react';

const CLASS_OPTIONS = [
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12',
];

type Tab = 'signin' | 'signup';

const CONTEXT_LABEL: Record<string, string> = {
  scan: 'Scan Homework',
  quiz: 'Daily Quiz',
  studyplan: 'Study Plan',
  timer: 'full features',
};

export const AuthModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showAuthModal, authModalContext } = useAppSelector((s) => s.app);

  const [tab, setTab] = useState<Tab>('signup');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  // Sign-up fields
  const [name, setName] = useState('');
  const [className, setClassName] = useState('Class 8');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Sign-in fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  // Reset error on tab change
  useEffect(() => { setError(''); }, [tab]);

  // ── Reset ALL form fields whenever the modal closes ──────────────────────
  useEffect(() => {
    if (!showAuthModal) {
      setError('');
      setName('');
      setClassName('Class 8');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLoginEmail('');
      setLoginPassword('');
      setShowPassword(false);
      setShowConfirm(false);
      setTab('signup');
    }
  }, [showAuthModal]);
  // ─────────────────────────────────────────────────────────────────────────

  const close = () => {
    dispatch(setShowAuthModal(false));
    dispatch(setAuthModalContext(null));
  };

  if (!showAuthModal) return null;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your name.');
    if (!email.trim()) return setError('Please enter your email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setFormLoading(true);
    try {
      const res = await authRegister({ name, className, email, password });
      dispatch(hydrateSession({
        loggedIn: res.session.loggedIn,
        activeScreen: 0,
        language: res.session.language,
        selectedSubjectId: res.session.selectedSubjectId,
        user: toUserState(res.user),
      }));
      dispatch(setIsAuthenticated(true));
      dispatch(setShowAuthModal(false));
      dispatch(setAuthModalContext(null));
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!loginEmail.trim()) return setError('Please enter your email.');
    if (!loginPassword) return setError('Please enter your password.');

    setFormLoading(true);
    try {
      const res = await authLogin({ email: loginEmail, password: loginPassword });
      dispatch(hydrateSession({
        loggedIn: res.session.loggedIn,
        activeScreen: 0,
        language: res.session.language,
        selectedSubjectId: res.session.selectedSubjectId,
        user: toUserState(res.user),
      }));
      dispatch(setIsAuthenticated(true));
      dispatch(setShowAuthModal(false));
      dispatch(setAuthModalContext(null));
    } catch (err: any) {
      setError(err?.message ?? 'Sign in failed. Please check your credentials.');
    } finally {
      setFormLoading(false);
    }
  };

  const contextLabel = authModalContext ? CONTEXT_LABEL[authModalContext] : null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-[slideUp_0.25s_ease-out]"
      >
        {/* ── Top gradient header ── */}
        <div className="relative bg-gradient-to-br from-brand-orange via-[#FF8C5A] to-[#FFB347] px-8 pt-8 pb-16">
          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors cursor-pointer border-none outline-none"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
              🎓
            </div>
            <div>
              <h1 className="text-white font-black text-xl leading-none">Vidya AI</h1>
              <p className="text-white/80 text-xs font-semibold">Your Personal Study Buddy</p>
            </div>
          </div>

          {contextLabel && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-[11px] font-black text-white">
              🔒 Sign in to access {contextLabel}
            </div>
          )}
          {!contextLabel && (
            <p className="mt-2 text-white/90 text-sm font-semibold">
              Create your free account to save progress, earn XP & more!
            </p>
          )}
        </div>

        {/* ── Tab switcher card overlapping header ── */}
        <div className="relative -mt-8 mx-6 bg-white rounded-2xl shadow-lg p-1 flex gap-1 border border-gray-100">
          {(['signup', 'signin'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all cursor-pointer border-none outline-none ${
                tab === t
                  ? 'bg-brand-orange text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t === 'signup' ? '✨ Sign Up' : '🔐 Sign In'}
            </button>
          ))}
        </div>

        {/* ── Form body ── */}
        <div className="px-6 pb-6 pt-4">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-xs font-bold px-3 py-2.5 rounded-xl flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
              {error.toLowerCase().includes('already exists') && (
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail(email);
                    setTab('signin');
                    setError('');
                  }}
                  className="mt-1.5 self-start text-xs font-black text-brand-orange hover:underline cursor-pointer border-none bg-transparent outline-none p-0"
                >
                  👉 Switch to Sign In Tab now
                </button>
              )}
            </div>
          )}

          {/* ── Sign-Up Form ── */}
          {tab === 'signup' && (
            <form onSubmit={handleRegister} className="space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Your Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Arjun Kumar"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* Class */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Class</label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white appearance-none cursor-pointer"
                  >
                    {CLASS_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent outline-none p-0"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent outline-none p-0"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 bg-brand-orange hover:bg-brand-orangeHover text-white font-black py-3 rounded-2xl text-sm transition-all shadow-[0_4px_0_#C84B1E] active:shadow-none active:translate-y-1 cursor-pointer border-none outline-none flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account...</>
                ) : '🚀 Create Free Account'}
              </button>

              <p className="text-center text-[11px] text-gray-400 font-semibold">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="text-brand-orange font-black hover:underline cursor-pointer border-none bg-transparent outline-none p-0"
                >
                  Sign In
                </button>
              </p>
            </form>
          )}

          {/* ── Sign-In Form ── */}
          {tab === 'signin' && (
            <form onSubmit={handleLogin} className="space-y-3">
              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border-2 border-gray-100 focus:border-brand-orange text-sm font-semibold text-gray-800 outline-none transition-colors bg-gray-50 focus:bg-white"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent outline-none p-0"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 bg-brand-orange hover:bg-brand-orangeHover text-white font-black py-3 rounded-2xl text-sm transition-all shadow-[0_4px_0_#C84B1E] active:shadow-none active:translate-y-1 cursor-pointer border-none outline-none flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing In...</>
                ) : '🔐 Sign In'}
              </button>

              <p className="text-center text-[11px] text-gray-400 font-semibold">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => setTab('signup')}
                  className="text-brand-orange font-black hover:underline cursor-pointer border-none bg-transparent outline-none p-0"
                >
                  Create Account
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
