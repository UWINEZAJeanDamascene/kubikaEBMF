import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { InputAdornment, RadioGroup, Stack } from '@mui/material';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { companyService } from '@/services';
import { companyApi } from '@/lib/api';
import { PUBLIC_ROUTES } from '@/config/routes';
import { AuthFrame } from './AuthFrame';
import {
  CopperActionButton,
  InlineStateNotice,
  PlanRegisterRow,
  PlanRegisterSkeleton,
  QuietActionLink,
  FolioStepIndex,
  UnderlinedField,
  type RegisterPlan,
} from '@/app/components/public/PublicPrimitives';

const registerSchema = z
  .object({
    companyName: z.string().min(2, 'Company name must be at least 2 characters'),
    companyEmail: z.string().email('Please enter a valid company email'),
    companyTin: z.string().optional(),
    companyPhone: z.string().optional(),
    subscriptionPlan: z.string().optional(),
    adminName: z.string().min(2, 'Your name must be at least 2 characters'),
    adminEmail: z.string().email('Please enter a valid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Add at least one uppercase letter.')
      .regex(/[a-z]/, 'Add at least one lowercase letter.')
      .regex(/[0-9]/, 'Add at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

type PlanResponse = RegisterPlan & {
  is_active: boolean;
  sort_order: number;
};

const formatPlanAmount = (amount: number) =>
  amount > 0
    ? `RWF ${new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 }).format(amount)}`
    : 'FREE';

export default function RegisterPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    defaultValues: { subscriptionPlan: '' },
  });

  const loadPlans = async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const response = await companyApi.getPublicSubscriptionPlans();
      if (response.success && response.data) {
        const activePlans = (response.data as PlanResponse[])
          .filter((plan) => plan.is_active)
          .sort((a, b) => a.sort_order - b.sort_order);
        setPlans(activePlans);
        if (activePlans.length > 0) {
          setSelectedPlan((current) => {
            const nextPlan = current || activePlans[0].key;
            setValue('subscriptionPlan', nextPlan);
            return nextPlan;
          });
        }
      } else {
        setPlans([]);
        setPlansError(t('auth.register.plansUnavailable'));
      }
    } catch {
      setPlans([]);
      setPlansError(t('auth.register.plansUnavailable'));
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const handleContinue = async () => {
    setError(null);
    if (await trigger(['companyName', 'companyEmail', 'companyTin', 'companyPhone'])) {
      setStep(2);
    }
  };

  const handleSelectPlan = (value: string) => {
    setSelectedPlan(value);
    setValue('subscriptionPlan', value, { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = async () => {
    const data = getValues();
    setIsLoading(true);
    setError(null);
    setEmailError(null);
    try {
      await companyService.register(
        {
          name: data.companyName,
          email: data.companyEmail,
          tin: data.companyTin || undefined,
          phone: data.companyPhone || undefined,
          subscription_plan: data.subscriptionPlan || selectedPlan || undefined,
        },
        {
          name: data.adminName,
          email: data.adminEmail,
          password: data.password,
        },
      );
      setIsSubmitted(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      if (errorMessage.toLowerCase().includes('email')) {
        setEmailError('This email is already registered. Please use a different email or contact support.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const helper = (field: keyof RegisterFormData) => errors[field]?.message as string | undefined;
  const inputIcon = (icon: React.ReactNode) => <InputAdornment position="start">{icon}</InputAdornment>;

  return (
    <AuthFrame
      eyebrow={isSubmitted ? t('auth.register.submittedEyebrow') : step === 1 ? t('auth.register.companyEyebrow') : t('auth.register.adminEyebrow')}
      title={isSubmitted ? t('auth.register.submittedTitle') : step === 1 ? t('auth.register.companyTitle') : t('auth.register.adminTitle')}
      subtitle={
        isSubmitted
          ? t('auth.register.submittedSubtitle')
          : step === 1
            ? t('auth.register.companySubtitle')
            : t('auth.register.adminSubtitle')
      }
      sideTitle={t('auth.register.sideTitle')}
      sideCopy={t('auth.register.sideCopy')}
      sideItems={[
        t('auth.register.sideItems.workspace'),
        t('auth.register.sideItems.roles'),
        t('auth.register.sideItems.history'),
      ]}
    >
      {isSubmitted ? (
        <Stack spacing={3} className="public-submitted-state">
          <span className="public-success-marker" aria-hidden="true">
            <CheckCircle2 />
          </span>
          <div>
            <h3 className="public-submitted-state__title">{t('auth.register.submittedTitle')}</h3>
            <p className="public-body mt-3 text-base leading-7 text-(--public-ink-muted)">
              {t('auth.register.submittedSubtitle')}
            </p>
          </div>
          <QuietActionLink to={PUBLIC_ROUTES.LOGIN}>
            {t('auth.register.goToSignIn')}
          </QuietActionLink>
        </Stack>
      ) : (
        <Stack spacing={3}>
          <FolioStepIndex
            currentStep={step}
            steps={[t('auth.register.companyStep'), t('auth.register.adminStep')]}
          />

          {error && <InlineStateNotice tone="danger">{error}</InlineStateNotice>}
          {emailError && <InlineStateNotice tone="danger">{emailError}</InlineStateNotice>}

          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 1 && (
              <Stack spacing={3}>
                <UnderlinedField
                  id="companyName"
                  label={t('auth.register.companyName')}
                  placeholder={t('auth.register.companyNamePlaceholder')}
                  error={Boolean(errors.companyName)}
                  helperText={helper('companyName')}
                  autoComplete="organization"
                  {...register('companyName')}
                  InputProps={{ startAdornment: inputIcon(<Building2 className="h-4 w-4" aria-hidden="true" />) }}
                />
                <UnderlinedField
                  id="companyEmail"
                  label={t('auth.register.companyEmail')}
                  placeholder={t('auth.register.companyEmailPlaceholder')}
                  error={Boolean(errors.companyEmail)}
                  helperText={helper('companyEmail')}
                  autoComplete="email"
                  {...register('companyEmail')}
                  InputProps={{ startAdornment: inputIcon(<Mail className="h-4 w-4" aria-hidden="true" />) }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                  <UnderlinedField
                    id="companyTin"
                    label={t('auth.register.tin')}
                    placeholder={t('auth.register.tinPlaceholder')}
                    fullWidth
                    {...register('companyTin')}
                    InputProps={{ startAdornment: inputIcon(<ShieldCheck className="h-4 w-4" aria-hidden="true" />) }}
                  />
                  <UnderlinedField
                    id="companyPhone"
                    label={t('auth.register.phone')}
                    placeholder={t('auth.register.phonePlaceholder')}
                    fullWidth
                    autoComplete="tel"
                    {...register('companyPhone')}
                    InputProps={{ startAdornment: inputIcon(<Phone className="h-4 w-4" aria-hidden="true" />) }}
                  />
                </Stack>

                <div>
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="public-field-label">{t('auth.register.planLabel')}</p>
                      <p className="mt-1 text-sm text-(--public-ink-muted)">{t('auth.register.planHint')}</p>
                    </div>
                    <span className="public-mono text-[0.6875rem] text-(--public-ink-muted)">
                      {plansLoading ? t('auth.register.loadingPlans') : t('auth.register.availablePlans', { count: plans.length })}
                    </span>
                  </div>

                  {plansLoading ? (
                    <PlanRegisterSkeleton />
                  ) : plansError || plans.length === 0 ? (
                    <InlineStateNotice
                      tone="danger"
                      action={
                        <button type="button" onClick={() => void loadPlans()} className="public-notice-action">
                          {t('auth.register.retryPlans')}
                        </button>
                      }
                    >
                      {plansError || t('auth.register.plansUnavailableContinue')}
                    </InlineStateNotice>
                  ) : (
                    <RadioGroup
                      name="subscription-plan"
                      value={selectedPlan}
                      onChange={(event) => handleSelectPlan(event.target.value)}
                      className="public-plan-register"
                    >
                      {plans.map((plan) => (
                        <PlanRegisterRow
                          key={plan.key}
                          plan={plan}
                          selected={selectedPlan === plan.key}
                          amountLabel={formatPlanAmount(plan.default_billing_amount)}
                        />
                      ))}
                    </RadioGroup>
                  )}
                  <input type="hidden" {...register('subscriptionPlan')} value={selectedPlan} readOnly />
                </div>

                <CopperActionButton type="button" onClick={handleContinue} fullWidth>
                  {t('auth.register.continueToAdmin')}
                </CopperActionButton>
              </Stack>
            )}

            {step === 2 && (
              <Stack spacing={3}>
                <button type="button" onClick={() => setStep(1)} className="public-back-form-link">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('auth.register.backToCompany')}
                </button>
                <UnderlinedField
                  id="adminName"
                  label={t('auth.register.adminName')}
                  placeholder={t('auth.register.adminNamePlaceholder')}
                  error={Boolean(errors.adminName)}
                  helperText={helper('adminName')}
                  autoComplete="name"
                  {...register('adminName')}
                />
                <UnderlinedField
                  id="adminEmail"
                  label={t('auth.register.adminEmail')}
                  placeholder={t('auth.register.adminEmailPlaceholder')}
                  error={Boolean(errors.adminEmail) || Boolean(emailError)}
                  helperText={helper('adminEmail') || emailError}
                  autoComplete="email"
                  {...register('adminEmail')}
                />
                <UnderlinedField
                  id="password"
                  label={t('auth.register.password')}
                  placeholder={t('auth.register.passwordPlaceholder')}
                  type={showPassword ? 'text' : 'password'}
                  error={Boolean(errors.password)}
                  helperText={helper('password')}
                  autoComplete="new-password"
                  {...register('password')}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <button type="button" onClick={() => setShowPassword((value) => !value)} className="public-password-toggle" aria-label={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}>
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </InputAdornment>
                    ),
                  }}
                />
                <UnderlinedField
                  id="confirmPassword"
                  label={t('auth.register.confirmPassword')}
                  placeholder={t('auth.register.confirmPasswordPlaceholder')}
                  type={showConfirmPassword ? 'text' : 'password'}
                  error={Boolean(errors.confirmPassword)}
                  helperText={helper('confirmPassword')}
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="public-password-toggle" aria-label={showConfirmPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}>
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </InputAdornment>
                    ),
                  }}
                />
                <CopperActionButton
                  type="submit"
                  fullWidth
                  disabled={isLoading}
                  startIcon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                  endIcon={undefined}
                >
                  {isLoading ? t('auth.register.submitting') : t('auth.register.submitApplication')}
                </CopperActionButton>
              </Stack>
            )}
          </form>

          <p className="public-form-footer text-sm text-(--public-ink-muted)">
            {t('auth.register.approvedPrompt')}{' '}
            <Link to={PUBLIC_ROUTES.LOGIN} className="public-inline-link">{t('auth.register.signIn')}</Link>
          </p>
        </Stack>
      )}
    </AuthFrame>
  );
}
