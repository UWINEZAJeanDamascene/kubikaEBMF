import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { authService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { Loader2, Eye, EyeOff, ShieldCheck, ArrowRight, KeyRound, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { AuthFrame } from './AuthFrame';

export default function PlatformAdminSetupPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [isChecking, setIsChecking] = useState(true);
  const [setupKey, setSetupKey] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const result = await authService.checkPlatformAdminStatus();
      if (result.success && !result.needsSetup) {
        navigate('/login', { replace: true });
        return;
      }
      setIsChecking(false);
    };
    checkStatus();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!setupKey || !name || !email || !password || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least one uppercase letter, one lowercase letter, and one number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.setupPlatformAdmin(setupKey, name, email, password);

      if (result.success) {
        // A first deployment should arrive in the control room without a
        // second, unnecessary sign-in step.
        const signIn = await authService.login({ email, password });
        const userResponse = signIn.user
          ? { success: true, data: signIn.user }
          : await authService.getMe();

        if (signIn.success && signIn.token && userResponse.success && userResponse.data) {
          const user = userResponse.data;
          localStorage.setItem('token', signIn.token);
          login({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            company: user.company,
            permissions: user.permissions,
            lastLogin: user.lastLogin,
            mustChangePassword: user.mustChangePassword,
          }, signIn.token, signIn.refreshToken || '', signIn.memberships || []);
          toast.success('Platform administrator created. Welcome to the control room.');
          navigate('/platform-admin', { replace: true });
        } else {
          toast.success('Platform administrator created. Please sign in to continue.');
          navigate('/login', { replace: true });
        }
      } else if (result.errorCode === 'INVALID_SETUP_KEY') {
        setError('Invalid setup key. Please check with your deployment administrator.');
      } else if (result.errorCode === 'PASSWORD_TOO_SHORT') {
        setError('Password must be at least 8 characters');
      } else if (result.errorCode === 'PASSWORD_POLICY_VIOLATION') {
        setError(result.error || 'Use at least one uppercase letter, one lowercase letter, and one number.');
      } else if (result.errorCode === 'PLATFORM_ADMIN_ALREADY_EXISTS') {
        setError('A platform administrator already exists.');
      } else {
        setError(result.error || 'Setup failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef4f6] dark:bg-[#061013]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <AuthFrame
      eyebrow="Platform Setup"
      title="Create platform administrator"
      subtitle="One-time secure setup for the platform control room. After creation, sign in at the regular login page."
      sideItems={['One-time setup only', 'Requires secret setup key', 'Full platform access']}
    >
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="setupKey" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Setup Key
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="setupKey"
              type="password"
              value={setupKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSetupKey(e.target.value)}
              disabled={isLoading}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              placeholder="Enter your PLATFORM_ADMIN_SETUP_KEY"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            This key is set in your server environment variables.
          </p>
        </div>

        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            disabled={isLoading}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
            placeholder="Platform Administrator"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            disabled={isLoading}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
            placeholder="admin@yourcompany.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              disabled={isLoading}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              placeholder="Repeat password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Creating administrator...
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Create Platform Admin
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        Already have credentials?{' '}
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="font-semibold text-cyan-700 hover:text-cyan-600 dark:text-cyan-300"
        >
          Sign in
        </button>
      </p>
    </AuthFrame>
  );
}
