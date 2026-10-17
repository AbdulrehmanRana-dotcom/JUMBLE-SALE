import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

const loginSchema = z.object({
  email: z.string().min(1, 'Please enter an email or username'),
  password: z.string().min(1, 'Please enter a password'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const { continueAsGuest, bypassAsAdmin, bypassAsBrand, bypassAsConsumer } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleResendFromLogin = async () => {
    if (!unconfirmedEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: unconfirmedEmail,
      });
      if (error) {
        toast.show(error.message, 'error');
      } else {
        toast.show('Confirmation email resent! Please check your Gmail inbox.', 'success');
      }
    } catch (err: any) {
      toast.show(err.message || 'Failed to resend confirmation email', 'error');
    } finally {
      setResending(false);
    }
  };

  const onFormError = (formErrors: any) => {
    if (formErrors?.email?.message) {
      toast.show(formErrors.email.message, 'error');
    } else if (formErrors?.password?.message) {
      toast.show(formErrors.password.message, 'error');
    } else {
      toast.show('Please fill in all required fields', 'error');
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    const emailClean = data.email.trim().toLowerCase();

    // 1. Admin Control Centre (exact credentials: admin / admin or admin@jumblesale.com)
    if (emailClean === 'admin' || emailClean === 'admin@jumblesale.com' || emailClean === 'admin@jumblesale.pk') {
      if (data.password.trim() === 'admin' || data.password.trim() === 'admin123') {
        toast.show('Welcome Back! Admin Login Successful', 'success');
        bypassAsAdmin();
        router.replace('/(admin)');
        return;
      } else {
        toast.show('Wrong Password for Admin! Please enter the correct password.', 'error');
        return;
      }
    }

    // 2. Shorthand keywords & Verified Brands
    if (emailClean === 'brand' || emailClean === 'contact@khaadi.com') {
      const storedPass =
        (await AsyncStorage.getItem('@user_password_contact@khaadi.com')) ||
        (await AsyncStorage.getItem('@user_password_yipiri1275@bitproy.com'));
      const passValid =
        data.password.trim() === 'brand' ||
        data.password.trim() === 'khaadi123' ||
        data.password.trim() === 'abcd 1234' ||
        (storedPass && data.password.trim() === storedPass.trim());

      if (passValid) {
        toast.show('Welcome Back! Khaadi Brand Login Successful', 'success');
        bypassAsBrand('contact@khaadi.com', 'Khaadi');
        router.replace('/(brand)');
        return;
      } else {
        toast.show('Wrong Password for Brand! Please try again.', 'error');
        return;
      }
    }

    if (emailClean === 'info@outfitters.com.pk') {
      if (data.password.trim() === 'outfitters123' || data.password.trim() === 'brand') {
        toast.show('Welcome Back! Outfitters Login Successful', 'success');
        bypassAsBrand('info@outfitters.com.pk', 'Outfitters');
        router.replace('/(brand)');
        return;
      } else {
        toast.show('Wrong Password for Outfitters!', 'error');
        return;
      }
    }

    if (emailClean === 'customercare@gulahmed.com') {
      if (data.password.trim() === 'gulahmed123' || data.password.trim() === 'brand') {
        toast.show('Welcome Back! Gul Ahmed Ideas Login Successful', 'success');
        bypassAsBrand('customercare@gulahmed.com', 'Gul Ahmed');
        router.replace('/(brand)');
        return;
      } else {
        toast.show('Wrong Password for Gul Ahmed!', 'error');
        return;
      }
    }

    if (emailClean === 'user' || emailClean === 'consumer' || emailClean === 'zara.khan@gmail.com') {
      const storedPass =
        (await AsyncStorage.getItem('@user_password_zara.khan@gmail.com')) ||
        (await AsyncStorage.getItem('@user_password_lilolam582@deertees.com')) ||
        (await AsyncStorage.getItem('@user_password_consumer_user'));
      const passValid =
        data.password.trim() === 'user' ||
        data.password.trim() === 'abcd 1234' ||
        data.password.trim() === 'consumer' ||
        (storedPass && data.password.trim() === storedPass.trim());

      if (passValid) {
        toast.show('Welcome Back! Shopper Login Successful', 'success');
        bypassAsConsumer('zara.khan@gmail.com', 'Zara Khan');
        router.replace('/(consumer)');
        return;
      } else {
        toast.show('Wrong Password for Shopper User!', 'error');
        return;
      }
    }

    setLoading(true);
    setUnconfirmedEmail(null);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password: data.password,
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          setUnconfirmedEmail(emailClean);
          toast.show('Email verification pending! Please check your Gmail inbox.', 'warning');
        } else if (
          msg.includes('invalid login credentials') ||
          msg.includes('invalid credentials') ||
          msg.includes('invalid email or password')
        ) {
          toast.show('Wrong Email or Password! Please verify your credentials.', 'error');
        } else {
          toast.show(error.message, 'error');
        }
        return;
      }

      if (authData?.user) {
        // Query user's profile to find their role
        let role = 'consumer';
        try {
          const { data: prof } = await (supabase.from('profiles') as any)
            .select('role')
            .eq('id', authData.user.id)
            .maybeSingle();

          role = (prof as any)?.role || authData.user.user_metadata?.role || 'consumer';
        } catch {
          role = authData.user.user_metadata?.role || 'consumer';
        }

        toast.show('Welcome Back! Login Successful', 'success');

        if (role === 'admin') {
          router.replace('/(admin)');
        } else if (role === 'brand') {
          try {
            const { data: bData } = await (supabase.from('brands') as any)
              .select('status, is_verified')
              .eq('owner_id', authData.user.id)
              .maybeSingle();

            if (bData && (bData as any).status === 'active' && (bData as any).is_verified) {
              router.replace('/(brand)');
            } else if (bData && (bData as any).status === 'rejected') {
              router.replace('/(brand)/rejected' as any);
            } else {
              router.replace('/(brand)/pending');
            }
          } catch {
            router.replace('/(brand)/pending');
          }
        } else {
          router.replace('/(consumer)');
        }
      }
    } catch (err: any) {
      toast.show(err.message || 'Wrong Email or Password! Please check your credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestBrowse = () => {
    toast.show('Continuing as Guest...', 'info');
    continueAsGuest();
    router.replace('/(consumer)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Brand Header */}
        <View style={styles.headerContainer}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Ionicons name="pricetag" size={26} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.brandTitle}>
            Jumble <Text style={styles.brandTitleAccent}>Sale</Text>
          </Text>
          <Text style={styles.brandSubtitle}>
            Discover the best deals around you
          </Text>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeSubtitle}>Sign in to your account</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {unconfirmedEmail ? (
            <View style={styles.unconfirmedBanner}>
              <View style={styles.unconfirmedHeader}>
                <Ionicons name="alert-circle" size={18} color={colors.warning} />
                <Text style={styles.unconfirmedTitle}>Email Verification Pending</Text>
              </View>
              <Text style={styles.unconfirmedText}>
                We sent a confirmation link to{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {unconfirmedEmail}
                </Text>
                . Please click the link in your Gmail to activate your password and portal access.
              </Text>
              <View style={styles.unconfirmedActions}>
                <Pressable
                  style={styles.unconfirmedBtn}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open('https://mail.google.com', '_blank');
                    } else {
                      Linking.openURL('https://mail.google.com');
                    }
                  }}>
                  <Text style={styles.unconfirmedBtnText}>Open Gmail</Text>
                </Pressable>
                <Pressable
                  style={styles.unconfirmedBtnOutline}
                  disabled={resending}
                  onPress={handleResendFromLogin}>
                  <Text style={styles.unconfirmedBtnOutlineText}>
                    {resending ? 'Sending...' : 'Resend Link'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Controller

            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="EMAIL ADDRESS"
                placeholder="abdulrehman@email.com"
                leftIcon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View style={{ gap: spacing[1] }}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.fieldLabel}>PASSWORD</Text>
                  <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
                    Forgot password?
                  </Link>
                </View>
                <Input
                  placeholder="••••••••"
                  leftIcon="lock-closed-outline"
                  secureTextEntry
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.password?.message}
                />
              </View>
            )}
          />

          {/* Remember Me Checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setRememberMe(!rememberMe)}>
            <View style={[styles.checkboxBox, rememberMe && styles.checkboxBoxChecked]}>
              {rememberMe && <Ionicons name="checkmark" size={13} color="#0D1117" />}
            </View>
            <Text style={styles.checkboxLabel}>Remember me on this device</Text>
          </Pressable>

          {/* Quick Portal Switcher */}
          <View style={styles.demoRow}>
            <Pressable
              style={styles.demoChip}
              onPress={() => {
                setValue('email', 'zara.khan@gmail.com');
                setValue('password', 'consumer');
                toast.show('Selected Shopper (zara.khan@gmail.com)', 'info');
              }}>
              <Ionicons name="cart" size={13} color={colors.primary} />
              <Text style={styles.demoChipText}>Shopper</Text>
            </Pressable>

            <Pressable
              style={styles.demoChip}
              onPress={() => {
                setValue('email', 'contact@khaadi.com');
                setValue('password', 'khaadi123');
                toast.show('Selected Khaadi Brand (contact@khaadi.com)', 'info');
              }}>
              <Ionicons name="business" size={13} color={colors.primary} />
              <Text style={styles.demoChipText}>Brand</Text>
            </Pressable>

            <Pressable
              style={styles.demoChip}
              onPress={() => {
                setValue('email', 'admin@jumblesale.com');
                setValue('password', 'admin');
                toast.show('Selected Master Admin (admin@jumblesale.com)', 'info');
              }}>
              <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
              <Text style={styles.demoChipText}>Admin</Text>
            </Pressable>
          </View>

          {/* Primary Action Button */}
          <Button
            label="Sign In"
            onPress={handleSubmit(onSubmit, onFormError)}
            loading={loading}
            fullWidth
            style={styles.submitBtn}
          />

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Buttons */}
          <View style={styles.socialRow}>
            <Pressable
              style={styles.socialBtn}
              onPress={() => toast.show('Google login coming soon', 'info')}>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={styles.socialBtnText}>Google</Text>
            </Pressable>
            <Pressable
              style={styles.socialBtn}
              onPress={() => toast.show('Facebook login coming soon', 'info')}>
              <Ionicons name="logo-facebook" size={18} color="#1877F2" />
              <Text style={styles.socialBtnText}>Facebook</Text>
            </Pressable>
          </View>

          {/* Guest Mode Option */}
          <Pressable style={styles.guestLink} onPress={handleGuestBrowse}>
            <Text style={styles.guestLinkText}>Continue as Guest</Text>
          </Pressable>
        </View>

        {/* Bottom Switcher */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Link href="/(auth)/register" style={styles.registerLink}>
            Sign up
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    borderWidth: 2.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  avatarInner: {
    width: 62,
    height: 62,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    ...typography.h2,
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  brandTitleAccent: {
    color: colors.primary,
    fontWeight: '800',
  },
  brandSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[1],
  },
  welcomeSection: {
    marginBottom: spacing[4],
  },
  welcomeTitle: {
    ...typography.h3,
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[5],
    gap: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
  },
  forgotLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginVertical: 2,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
  },
  submitBtn: {
    marginTop: spacing[1],
    borderRadius: radii.md,
    minHeight: 50,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginVertical: spacing[1],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialBtnText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  guestLink: {
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  guestLinkText: {
    ...typography.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  unconfirmedBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    padding: spacing[3],
    gap: spacing[2],
  },
  unconfirmedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  unconfirmedTitle: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
  },
  unconfirmedText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  unconfirmedActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: 2,
  },
  unconfirmedBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  unconfirmedBtnText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textInverse,
  },
  unconfirmedBtnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  unconfirmedBtnOutlineText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textPrimary,
  },
  footer: {

    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[6],
  },
  footerText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  registerLink: {
    ...typography.bodyMedium,
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
  },
  demoRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginVertical: spacing[1],
  },
  demoChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: radii.md,
    paddingVertical: spacing[2],
  },
  demoChipText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});

