import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, profile, brand, isLoading, isGuest } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const segList = segments as string[];
    const currentGroup = segList[0];

    // 1. Block Suspended Accounts (is_active = false)
    if (session && profile && profile.is_active === false) {
      if (currentGroup !== 'suspended') {
        router.replace('/suspended');
      }
      return;
    }

    // 2. Guest Mode Navigation (Visitors can browse consumer tabs)
    if (isGuest) {
      if (currentGroup !== '(consumer)' && currentGroup !== '(auth)') {
        router.replace('/(consumer)');
      }
      return;
    }

    // 3. Unauthenticated Visitors (Redirect to Login unless already in auth)
    if (!session) {
      if (currentGroup !== '(auth)') {
        router.replace('/(auth)/login');
      }
      return;
    }

    // 4. Authenticated Users Role-Based Navigation
    if (profile) {
      if (profile.role === 'admin') {
        if (currentGroup !== '(admin)') {
          router.replace('/(admin)');
        }
      } else if (profile.role === 'brand') {
        const brandStatus = brand?.status ?? 'pending';
        const isBrandRoute =
          currentGroup === '(brand)' ||
          ['posts', 'explore', 'profile', 'agent', 'create-deal', 'deal'].includes(currentGroup);

        if (brandStatus === 'rejected') {
          if (!isBrandRoute || segList[1] !== 'rejected') {
            router.replace('/(brand)/rejected' as any);
          }
        } else if (brandStatus === 'active' && brand?.is_verified === true) {
          if (
            !isBrandRoute ||
            segList[1] === 'pending' ||
            segList[1] === 'rejected'
          ) {
            router.replace('/(brand)');
          }
        } else {
          // Status is pending or not yet verified
          if (!isBrandRoute || segList[1] !== 'pending') {
            router.replace('/(brand)/pending');
          }
        }
      } else {
        const isConsumerRoute =
          currentGroup === '(consumer)' ||
          ['deal', 'category', 'assistant', 'saved', 'search', 'onboarding'].includes(currentGroup);

        if (!isConsumerRoute) {
          router.replace('/(consumer)');
        }
      }
    }
  }, [session, profile, brand, isLoading, isGuest, segments, router]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(consumer)" />
      <Stack.Screen name="(brand)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="suspended" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppProviders>
      <StatusBar style="light" />
      <RootLayoutNav />
    </AppProviders>
  );

}
