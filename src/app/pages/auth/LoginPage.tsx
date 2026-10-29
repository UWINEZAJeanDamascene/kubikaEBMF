import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, InputAdornment, Stack } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services';
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AuthFrame } from './AuthFrame';
import {
  CopperActionButton,
  InlineStateNotice,
  QuietActionLink,
  UnderlinedField,
} from '@/app/components/public/PublicPrimitives';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lockedMinutes, setLockedMinutes] = useState<number | null>(null);
  const [needsPlatformAdminSetup, setNeedsPlatformAdminSetup] = useState(false);

  useEffect(() => {
    void authService.checkPlatformAdminStatus().then((result) => {
      setNeedsPlatformAdminSetup(result.success && result.needsSetup === true);
    });
  }, []);

  const finishLogin = async (response: Awaited<ReturnType<typeof authService.login>>) => {
    const token = response.token || '';
    const refreshToken = response.refreshToken || '';
    if (!token) throw new Error('LOGIN_FAILED');
    useAuthStore.getState().setAccessToken(token);
    useAuthStore.getState().setRefreshToken(refreshToken || null);
    const userResponse = response.user
      ? { success: true, data: response.user }
      : await authService.getMe();
    if (!userResponse.success || !userResponse.data) throw new Error('USER_DETAILS_FAILED');
    const user = userResponse.data;
    const memberships = response.memberships || [];
    login({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
      permissions: user.permissions,
      lastLogin: user.lastLogin,
      mustChangePassword: user.mustChangePassword,
    }, token, refreshToken, memberships);
    toast.success(t('auth.login.welcomeBack'));
    if (user.mustChangePassword) navigate('/security', { replace: true });
    else if (user.role === 'platform_admin') navigate('/platform-admin', { replace: true });
    else if (memberships.length > 1) navigate('/company', { replace: true });
    else navigate('/launcher', { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setErrorCode('MISSING_CREDENTIALS');
      toast.error(t('auth.login.enterCredentials'));
      return;
    }

    setIsLoading(true);
    setErrorCode(null);
    setLockedMinutes(null);

    try {
      const response = await authService.login({ email, password });
      if (response.success) {
        if (response.requiresTwoFA && response.challengeToken) {
          setTwoFactorChallenge(response.challengeToken);
          setTwoFactorCode('');
          setErrorCode(null);
          return;
        }
        await finishLogin(response);
      } else if (response.errorCode === 'INVALID_CREDENTIALS') {
        setErrorCode('INVALID_CREDENTIALS');
        toast.error(t('auth.login.invalidCredentials'));
      } else if (response.errorCode === 'ACCOUNT_LOCKED') {
        const minutes = response.lockedUntil
          ? Math.max(1, Math.ceil((response.lockedUntil - Date.now()) / 60000))
          : 30;
        setLockedMinutes(minutes);
        setErrorCode('ACCOUNT_LOCKED');
        toast.error(t('auth.login.accountLockedToast', { minutes }));
      } else if (response.errorCode === 'REQUEST_TIMEOUT') {
        setErrorCode('REQUEST_TIMEOUT');
        toast.error(t('auth.login.loginTimeout'));
      } else {
        setErrorCode('LOGIN_FAILED');
        toast.error(response.error || t('auth.login.loginFailed'));
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorCode('LOGIN_FAILED');
      toast.error(t('auth.login.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!twoFactorChallenge || !/^\d{6}$/.test(twoFactorCode)) {
      setErrorCode('INVALID_TWO_FACTOR_CODE');
      return;
    }
    setIsLoading(true);
    setErrorCode(null);
    try {
      const verified = await authService.verifyLoginTwoFactor(twoFactorChallenge, twoFactorCode);
      if (!verified.success) {
        setErrorCode(verified.errorCode || 'INVALID_TWO_FACTOR_CODE');
        if (verified.errorCode === 'INVALID_TWO_FACTOR_CHALLENGE') setTwoFactorChallenge(null);
        return;
      }
      await finishLogin(verified as Awaited<ReturnType<typeof authService.login>>);
    } catch (error) {
      setErrorCode(error instanceof Error && error.message === 'USER_DETAILS_FAILED' ? 'USER_DETAILS_FAILED' : 'LOGIN_FAILED');
    } finally {
      setIsLoading(false);
    }
  };

  const errorMessage =
    errorCode === 'ACCOUNT_LOCKED'
      ? t('auth.login.accountLockedWithTime', { minutes: lockedMinutes ?? 30 })
      : errorCode === 'REQUEST_TIMEOUT'
        ? t('auth.login.loginTimeoutInline')
        : errorCode === 'MISSING_CREDENTIALS'
          ? t('auth.login.enterCredentials')
          : errorCode === 'USER_DETAILS_FAILED'
            ? t('auth.login.userDetailsFailed')
            : errorCode === 'TWO_FACTOR_CHALLENGE_UNAVAILABLE'
              ? 'Two-factor sign-in is temporarily unavailable. Please try again shortly.'
            : errorCode === 'INVALID_TWO_FACTOR_CODE'
              ? 'That code is incorrect. Check your authenticator app and try again.'
              : errorCode === 'INVALID_TWO_FACTOR_CHALLENGE'
                ? 'This sign-in challenge expired. Sign in with your password again.'
            : t('auth.login.invalidCredentialsInline');

  return (
    <AuthFrame
      eyebrow={t('auth.login.eyebrow')}
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      sideTitle={t('auth.login.sideTitle')}
      sideCopy={t('auth.login.sideCopy')}
      sideItems={[
        t('auth.login.sideItems.workspace'),
        t('auth.login.sideItems.roles'),
        t('auth.login.sideItems.history'),
      ]}
    >
      <Stack component="form" onSubmit={twoFactorChallenge ? handleTwoFactorSubmit : handleSubmit} spacing={3}>
        {errorCode && (
          <InlineStateNotice tone="danger">
            {errorMessage}
          </InlineStateNotice>
        )}

        {twoFactorChallenge ? (
          <>
            <p className="text-sm text-(--public-ink-muted)">Enter the 6-digit code from your authenticator app to finish signing in.</p>
            <UnderlinedField
              id="two-factor-code"
              type="text"
              label="Authenticator code"
              placeholder="000000"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={isLoading}
              autoComplete="one-time-code"
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></InputAdornment> }}
            />
            <Button type="button" variant="text" onClick={() => { setTwoFactorChallenge(null); setTwoFactorCode(''); setErrorCode(null); }} disabled={isLoading}>
              Back to password
            </Button>
          </>
        ) : <>
        <UnderlinedField
          id="email"
          type="email"
          label={t('auth.login.emailLabel')}
          placeholder={t('auth.login.emailPlaceholder')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isLoading}
          autoComplete="email"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Mail className="h-4 w-4" aria-hidden="true" />
              </InputAdornment>
            ),
          }}
        />

        <UnderlinedField
          id="password"
          type={showPassword ? 'text' : 'password'}
          label={t('auth.login.passwordLabel')}
          action={
            <Link to="/forgot-password" className="public-field-action">
              {t('auth.login.forgotPassword')}
            </Link>
          }
          placeholder={t('auth.login.passwordPlaceholder')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
                  onClick={() => setShowPassword((value) => !value)}
                  edge="end"
                  className="public-password-toggle"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        </>}

        <CopperActionButton
          type="submit"
          fullWidth
          disabled={isLoading}
          endIcon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}
          className="!mt-2"
        >
          {isLoading ? (twoFactorChallenge ? 'Verifying…' : t('auth.login.signingIn')) : (twoFactorChallenge ? 'Verify and sign in' : t('auth.login.signIn'))}
        </CopperActionButton>

        {!twoFactorChallenge && <div className="public-form-footer">
          <p className="text-sm text-(--public-ink-muted)">
            {t('auth.login.newWorkspace')}{' '}
            <QuietActionLink to="/register" endIcon={null}>
              {t('auth.login.createAccount')}
            </QuietActionLink>
          </p>
          {needsPlatformAdminSetup && (
            <p className="mt-3 text-xs text-(--public-ink-muted)">
              {t('auth.login.platformSetupPrompt')}{' '}
              <Button
                component={Link}
                to="/setup-platform-admin"
                variant="text"
                color="inherit"
                className="public-inline-link !min-h-0 !p-0"
              >
                {t('auth.login.platformSetupLink')}
              </Button>
            </p>
          )}
        </div>}
      </Stack>
    </AuthFrame>
  );
}
