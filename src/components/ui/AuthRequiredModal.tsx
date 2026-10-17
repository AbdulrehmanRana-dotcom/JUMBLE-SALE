import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { colors, radii, spacing, typography } from '@/theme';

export type AuthRequiredModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
};

export function AuthRequiredModal({
  visible,
  onClose,
  title = 'Sign in to Continue',
  description = 'Create an account or sign in to save deals, like promotions, and follow your favorite Pakistani brands.',
}: AuthRequiredModalProps) {
  const router = useRouter();

  const handleLogin = () => {
    onClose();
    router.push('/(auth)/login');
  };

  const handleRegister = () => {
    onClose();
    router.push('/(auth)/register');
  };

  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={36} color={colors.primary} />
        </View>

        <Text style={styles.description}>{description}</Text>

        <View style={styles.buttonStack}>
          <Button
            label="Sign In"
            variant="primary"
            fullWidth
            onPress={handleLogin}
          />
          <Button
            label="Create New Account"
            variant="outline"
            fullWidth
            onPress={handleRegister}
          />
          <Button
            label="Maybe Later"
            variant="ghost"
            fullWidth
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[4],
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonStack: {
    width: '100%',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
