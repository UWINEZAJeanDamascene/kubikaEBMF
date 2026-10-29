import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { InputAdornment, Stack } from '@mui/material';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { authService } from '@/services';
import { PUBLIC_ROUTES } from '@/config/routes';
import { AuthFrame } from './AuthFrame';
import {
  CopperActionButton,
  InlineStateNotice,
  QuietActionLink,
  UnderlinedField,
} from '@/app/components/public/PublicPrimitives';

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Use at least 8 characters for your password.')
    .regex(/[A-Z]/, 'Add at least one uppercase letter.')
    .regex(/[a-z]/, 'Add at least one lowercase letter.')
    .regex(/[0-9]/, 'Add at least one number.'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token: pathToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || pathToken;

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    if (!token) setInvalidToken(true);
  }, [token]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setError('This password reset link is missing or invalid.');
      setInvalidToken(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.resetPassword(token, data.password);
      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate(PUBLIC_ROUTES.LOGIN, {
            state: { message: 'Password reset successful! Please log in.' },
          });
        }, 3000);
      } else if (response.errorCode === 'INVALID_OR_EXPIRED_TOKEN') {
        setInvalidToken(true);
        setError(response.error || 'This reset link has expired. Request a new link to continue.');
      } else if (response.errorCode === 'PASSWORD_TOO_SHORT') {
        setError(response.error || 'Use at least 8 characters for your password.');
      } else if (response.errorCode === 'PASSWORD_POLICY_VIOLATION') {
        setError(response.error || 'Use at least one uppercase letter, one lowercase letter, and one number.');
      } else {
        setError(response.error || 'We could not update your password. Please try again.');
      }
    } catch {
      setError('We could not reach the service. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const status = invalidToken ? 'invalid' : success ? 'success' : 'form';

  return (
    <AuthFrame
      eyebrow="ACCOUNT SECURITY"
      title={status === 'invalid' ? 'Request a fresh reset link' : status === 'success' ? 'Password updated' : 'Choose a new password'}
      subtitle={status === 'invalid'
        ? 'Reset links expire to help protect your account. Request a new link and use it to set a password.'
        : status === 'success'
          ? 'Your password has been changed. You can now sign in with your new credentials.'
          : 'Create a password you have not used before to restore secure access to your workspace.'}
      sideTitle="Get back to work, securely."
      sideCopy="A reset link gives you a private way to regain access to your Stock Tenancy workspace. Your existing account and business data stay protected."
      sideItems={[
        'Use the one-time link sent to your email',
        'Use at least 8 characters, including uppercase, lowercase, and a number',
        'Sign in again with your updated credentials',
      ]}
      mobilePromise="Password reset links are private and expire for your security."
    >
      {status === 'invalid' && (
        <Stack spacing={3}>
          <InlineStateNotice tone="danger">
            <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error || 'This reset link is invalid, missing, or expired.'}</span>
          </InlineStateNotice>
          <QuietActionLink to={PUBLIC_ROUTES.FORGOT_PASSWORD}>Request a new reset link</QuietActionLink>
          <p className="public-form-footer text-sm text-(--public-ink-muted)">
            Remember your password? <Link to={PUBLIC_ROUTES.LOGIN} className="public-inline-link">Sign in</Link>
          </p>
        </Stack>
      )}

      {status === 'success' && (
        <Stack spacing={3} className="public-submitted-state">
          <span className="public-success-marker" aria-hidden="true"><CheckCircle2 /></span>
          <div>
            <h3 className="public-submitted-state__title">You’re ready to sign in</h3>
            <p className="public-body mt-3 text-base leading-7 text-(--public-ink-muted)">
              Your new password is active. We’ll take you to sign in shortly.
            </p>
          </div>
          <QuietActionLink to={PUBLIC_ROUTES.LOGIN}>Continue to sign in</QuietActionLink>
        </Stack>
      )}

      {status === 'form' && (
        <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={3}>
          {error && <InlineStateNotice tone="danger">{error}</InlineStateNotice>}

          <UnderlinedField
            id="password"
            type={showPassword ? 'text' : 'password'}
            label="New password"
            placeholder="At least 8 characters"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            autoComplete="new-password"
            {...register('password')}
            InputProps={{
              startAdornment: <InputAdornment position="start"><KeyRound className="h-4 w-4" aria-hidden="true" /></InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="public-inline-link">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </InputAdornment>
              ),
            }}
          />

          <UnderlinedField
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            label="Confirm new password"
            placeholder="Enter the new password again"
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
            autoComplete="new-password"
            {...register('confirmPassword')}
            InputProps={{
              startAdornment: <InputAdornment position="start"><KeyRound className="h-4 w-4" aria-hidden="true" /></InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} className="public-inline-link">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </InputAdornment>
              ),
            }}
          />

          <CopperActionButton type="submit" fullWidth disabled={isLoading} endIcon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}>
            {isLoading ? 'Updating password…' : 'Update password'}
          </CopperActionButton>

          <p className="public-form-footer text-sm text-(--public-ink-muted)">
            Need a new reset email? <Link to={PUBLIC_ROUTES.FORGOT_PASSWORD} className="public-inline-link">Request another link</Link>
          </p>
        </Stack>
      )}
    </AuthFrame>
  );
}
