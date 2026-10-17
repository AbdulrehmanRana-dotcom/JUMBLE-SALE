import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { colors, radii, spacing, typography } from '@/theme';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid registered email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: 'jumblesale://reset-password',
      });

      if (error) {
        toast.show(error.message, 'error');
      } else {
        setSubmitted(true);
        toast.show('Password reset link sent to your email!', 'success');
      }
    } catch (err: any) {
      toast.show(err.message || 'Request failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <Header title="Reset Password" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your registered email address and we will send you instructions to reset your password.
          </Text>

          {submitted ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Check Your Inbox</Text>
              <Text style={styles.successText}>
                We have emailed a password reset link to your address. Follow the link in your email to create a new password.
              </Text>
              <Button
                label="Back to Login"
                variant="primary"
                fullWidth
                onPress={() => router.replace('/(auth)/login')}
                style={{ marginTop: spacing[3] }}
              />
            </View>
          ) : (
            <>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Registered Email Address"
                    placeholder="name@example.com"
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

              <Button
                label="Send Reset Link"
                onPress={handleSubmit(onSubmit)}
                loading={loading}
                fullWidth
                style={{ marginTop: spacing[2] }}
              />
            </>
          )}
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    gap: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  successBox: {
    backgroundColor: colors.successBg,
    borderRadius: radii.lg,
    padding: spacing[4],
    gap: spacing[2],
    marginVertical: spacing[2],
  },
  successTitle: {
    ...typography.h3,
    color: colors.success,
  },
  successText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
