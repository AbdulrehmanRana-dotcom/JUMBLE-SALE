import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { getLocalBrands, getSavedBrandIdentity } from '@/lib/brandStore';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Brand, Profile, UserRole } from '@/types/database.types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  brand: Brand | null;
  role: UserRole | null;
  isLoading: boolean;
  isGuest: boolean;
  continueAsGuest: () => void;
  bypassAsAdmin: () => void;
  bypassAsBrand: (email?: string, name?: string) => void;
  bypassAsConsumer: (email?: string, name?: string, customUserId?: string) => void;
  updateProfile: (data: Partial<Profile>) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  brand: null,
  role: null,
  isLoading: true,
  isGuest: false,
  continueAsGuest: () => {},
  bypassAsAdmin: () => {},
  bypassAsBrand: () => {},
  bypassAsConsumer: () => {},
  updateProfile: async () => ({ success: false }),
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGuest, setIsGuest] = useState<boolean>(false);

  const syncBrandForUser = async (uId: string, email?: string | null, bName?: string | null) => {
    try {
      const isUUID = (val?: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');

      // 1. Try persistent saved brand identity first (Guaranteed across project restarts)
      const savedIdentity = await getSavedBrandIdentity(uId || email || undefined);
      const savedName =
        savedIdentity?.name && savedIdentity.name !== 'Official Brand Partner'
          ? savedIdentity.name.trim()
          : null;

      // 2. Try finding brand by owner_id in Supabase
      const { data: brandData, error: brandError } = await (supabase
        .from('brands') as any)
        .select('*')
        .eq('owner_id', uId)
        .maybeSingle();

      const bData = brandData as any;
      if (!brandError && bData && bData.name && bData.name !== 'Official Brand Partner') {
        // If saved identity has newer name, prioritize saved identity
        const finalName = savedName || bData.name;
        setBrand({ ...(bData as Brand), name: finalName });
        return;
      }

      // 3. Try finding brand by business_email in Supabase
      if (email) {
        const { data: brandByEmail } = await (supabase
          .from('brands') as any)
          .select('*')
          .ilike('business_email', email)
          .maybeSingle();

        const bEmail = brandByEmail as any;
        if (bEmail && bEmail.name && bEmail.name !== 'Official Brand Partner') {
          const finalName = savedName || bEmail.name;
          setBrand({ ...(bEmail as Brand), name: finalName });
          return;
        }
      }

      // 4. Fallback to local brands store
      const localBrands = await getLocalBrands();
      const localMatch =
        localBrands.find(
          (b) =>
            b.owner_id === uId ||
            (email && b.business_email?.toLowerCase() === email.toLowerCase())
        ) || localBrands[0] || null;

      const brandUUID =
        localMatch?.id && isUUID(localMatch.id)
          ? localMatch.id
          : isUUID(uId)
          ? uId
          : 'b1111111-1111-1111-1111-111111111111';

      const effectiveBrandName =
        savedName ||
        (bName && bName !== 'Official Brand Partner' ? bName.trim() : null) ||
        (localMatch?.name && localMatch.name !== 'Official Brand Partner' ? localMatch.name : null) ||
        'My Brand';

      const resolvedBrand: Brand = {
        id: brandUUID,
        owner_id: isUUID(uId) ? uId : 'b0000000-0000-0000-0000-000000000001',
        name: effectiveBrandName,
        business_email: email || savedIdentity?.business_email || localMatch?.business_email || 'partner@brand.com',
        contact_number: savedIdentity?.contact_number || localMatch?.contact_number || '+92 42 111 222 333',
        category: savedIdentity?.category || localMatch?.category || 'Fashion & Apparel',
        status: 'active',
        is_verified: true,
        logo_url: savedIdentity?.logo_url || localMatch?.logo_url || 'https://images.unsplash.com/photo-1544441893-675973e31985',
        social_links: savedIdentity?.social_links || localMatch?.social_links || { website: 'https://pk.khaadi.com' },
        verification_doc_urls: localMatch?.verification_doc_urls || [],
        rejection_reason: null,
        created_at: new Date().toISOString(),
      };

      // Upsert to Supabase with real name so foreign key references to brand_id always succeed
      try {
        await (supabase.from('brands') as any).upsert({
          id: resolvedBrand.id,
          owner_id: resolvedBrand.owner_id,
          name: resolvedBrand.name,
          business_email: resolvedBrand.business_email,
          contact_number: resolvedBrand.contact_number,
          category: resolvedBrand.category,
          status: 'active',
          is_verified: true,
          logo_url: resolvedBrand.logo_url,
          social_links: resolvedBrand.social_links,
        }, { onConflict: 'id' });
      } catch (upsertErr) {
        console.warn('[AuthProvider] Brand record sync note:', upsertErr);
      }

      setBrand(resolvedBrand);
    } catch (bErr) {
      console.warn('[AuthProvider] syncBrandForUser notice:', bErr);
    }
  };

  const fetchProfile = async (userId: string, currentUser?: User | null) => {
    try {
      const savedBrand = await getSavedBrandIdentity(userId);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[AuthProvider] Notice fetching profile (falling back to user session metadata):', error.message);
        let u = currentUser || user;
        if (!u) {
          const { data: userData } = await supabase.auth.getUser();
          u = userData?.user ?? null;
        }
        if (u) {
          const fallbackRole = (u.user_metadata?.role as UserRole) || 'consumer';
          const resolvedDisplayName =
            (fallbackRole === 'brand' && savedBrand?.name && savedBrand.name !== 'Official Brand Partner' ? savedBrand.name : null) ||
            u.user_metadata?.brand_name ||
            u.user_metadata?.display_name ||
            u.user_metadata?.full_name ||
            u.email?.split('@')[0] ||
            'User';

          setProfile({
            id: u.id,
            email: u.email || '',
            display_name: resolvedDisplayName,
            avatar_url: u.user_metadata?.avatar_url || null,
            role: fallbackRole,
            push_token: null,
            is_active: true,
            preferences: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Profile);

          if (fallbackRole === 'brand') {
            await syncBrandForUser(u.id, u.email, resolvedDisplayName);
          } else {
            setBrand(null);
          }
        }
      } else if (data) {
        const profileData = data as Profile;
        if (profileData.role === 'brand' && savedBrand?.name && savedBrand.name !== 'Official Brand Partner') {
          profileData.display_name = savedBrand.name;
        }
        setProfile(profileData);

        // If this is a brand user, also fetch their brand record
        if (profileData.role === 'brand') {
          await syncBrandForUser(userId, profileData.email, profileData.display_name);
        } else {
          setBrand(null);
        }
      } else {
        const u = currentUser || user;
        if (u) {
          const fallbackRole = (u.user_metadata?.role as UserRole) || 'consumer';
          const resolvedDisplayName =
            (fallbackRole === 'brand' && savedBrand?.name && savedBrand.name !== 'Official Brand Partner' ? savedBrand.name : null) ||
            u.user_metadata?.brand_name ||
            u.user_metadata?.display_name ||
            u.user_metadata?.full_name ||
            'User';

          setProfile({
            id: u.id,
            email: u.email || '',
            display_name: resolvedDisplayName,
            avatar_url: u.user_metadata?.avatar_url || null,
            role: fallbackRole,
            push_token: null,
            is_active: true,
            preferences: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Profile);

          if (fallbackRole === 'brand') {
            await syncBrandForUser(u.id, u.email, resolvedDisplayName);
          } else {
            setBrand(null);
          }
        }
      }
    } catch (err) {
      console.error('[AuthProvider] Unexpected error fetching profile:', err);
    }
  };


  const savePushToken = async (userId: string) => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await (supabase.from('profiles') as any)
          .update({ push_token: token })
          .eq('id', userId);
      }
    } catch (err) {
      console.log('[AuthProvider] Failed to save push token:', err);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };

    try {
      const { error } = await (supabase.from('profiles') as any)
        .update(data)
        .eq('id', user.id);

      if (error) {
        return { success: false, error: error.message };
      }

      await fetchProfile(user.id);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Update failed' };
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    setIsLoading(false);
  };

  const bypassAsAdmin = () => {
    const adminId = 'a0000000-0000-0000-0000-000000000001';
    const userObj = { id: adminId, email: 'admin@jumblesale.com' } as any;
    const profileObj = {
      id: adminId,
      email: 'admin@jumblesale.com',
      display_name: 'System Admin',
      role: 'admin' as const,
      is_active: true,
      created_at: new Date().toISOString(),
    } as any;
    const sessionObj = { access_token: 'admin-bypass-token', user: userObj } as any;

    setSession(sessionObj);
    setUser(userObj);
    setProfile(profileObj);
    setBrand(null);
    setIsGuest(false);
    setIsLoading(false);

    AsyncStorage.setItem(
      '@jumble_sale_active_auth',
      JSON.stringify({ user: userObj, profile: profileObj, brand: null })
    ).catch(() => {});
  };

  const bypassAsBrand = (
    brandEmail: string = 'contact@khaadi.com',
    brandName: string = 'Khaadi'
  ) => {
    let brandId = 'b1111111-1111-1111-1111-111111111111';
    let userId = 'b0000000-0000-0000-0000-000000000001';

    const bLower = brandEmail.toLowerCase();
    if (bLower.includes('outfitter')) {
      brandId = 'b2222222-2222-2222-2222-222222222222';
      userId = 'b0000000-0000-0000-0000-000000000002';
    } else if (bLower.includes('gulahmed') || bLower.includes('gul_ahmed')) {
      brandId = 'b3333333-3333-3333-3333-333333333333';
      userId = 'b0000000-0000-0000-0000-000000000003';
    } else {
      userId = 'b0000000-0000-0000-0000-' + Math.abs(bLower.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(16).padStart(12, '0');
      brandId = 'b1111111-1111-1111-1111-' + Math.abs(bLower.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(16).padStart(12, '0');
    }

    const userObj = { id: userId, email: brandEmail } as any;
    const profileObj = {
      id: userId,
      email: brandEmail,
      display_name: brandName,
      role: 'brand' as const,
      is_active: true,
      created_at: new Date().toISOString(),
    } as any;
    const sessionObj = { access_token: 'brand-bypass-token', user: userObj } as any;

    setSession(sessionObj);
    setUser(userObj);
    setProfile(profileObj);

    const initialBrand: Brand = {
      id: brandId,
      owner_id: userId,
      name: brandName,
      business_email: brandEmail,
      contact_number: '+92 42 111 542 234',
      category: 'Fashion & Apparel',
      status: 'active',
      is_verified: true,
      logo_url: 'https://images.unsplash.com/photo-1544441893-675973e31985',
      social_links: {
        website: 'https://pk.khaadi.com',
      },
      verification_doc_urls: ['NTN_Verified.pdf'],
      rejection_reason: null,
      created_at: new Date().toISOString(),
    };
    setBrand(initialBrand as any);
    setIsGuest(false);
    setIsLoading(false);

    AsyncStorage.setItem(
      '@jumble_sale_active_auth',
      JSON.stringify({ user: userObj, profile: profileObj, brand: initialBrand })
    ).catch(() => {});

    // Sync from local store so if admin approved or altered it, the brand gets active status!
    getLocalBrands()
      .then((brands) => {
        const match = brands.find(
          (b) =>
            b.business_email?.toLowerCase() === brandEmail.toLowerCase() ||
            b.name?.toLowerCase() === brandName.toLowerCase() ||
            b.id === brandId ||
            b.owner_id === userId
        );
        if (match) {
          setBrand(match as any);
          setProfile((prev) =>
            prev ? { ...prev, display_name: match.name } : prev
          );
          AsyncStorage.setItem(
            '@jumble_sale_active_auth',
            JSON.stringify({ user: userObj, profile: { ...profileObj, display_name: match.name }, brand: match })
          ).catch(() => {});
        }
      })
      .catch((err) => console.warn('[AuthProvider] bypassAsBrand local sync notice:', err));
  };

  const bypassAsConsumer = (
    userEmail: string = 'zara.khan@gmail.com',
    userName: string = 'Zara Khan',
    customUserId?: string
  ) => {
    let userId = customUserId;
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      const emailLower = userEmail.toLowerCase();
      if (emailLower.includes('zara')) userId = 'c1111111-1111-1111-1111-111111111111';
      else if (emailLower.includes('ahmed')) userId = 'c2222222-2222-2222-2222-222222222222';
      else if (emailLower.includes('sara')) userId = 'c3333333-3333-3333-3333-333333333333';
      else if (emailLower.includes('abdul')) userId = 'c4444444-4444-4444-4444-444444444444';
      else {
        const hex = Math.abs(emailLower.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(16).padStart(12, '0');
        userId = `c0000000-0000-0000-0000-${hex.slice(0, 12)}`;
      }
    }

    const userObj = { id: userId, email: userEmail } as any;
    const profileObj = {
      id: userId,
      email: userEmail,
      display_name: userName,
      role: 'consumer' as const,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any;
    const sessionObj = { access_token: 'consumer-bypass-token', user: userObj } as any;

    setSession(sessionObj);
    setUser(userObj);
    setProfile(profileObj);
    setBrand(null);
    setIsGuest(false);
    setIsLoading(false);

    AsyncStorage.setItem(
      '@jumble_sale_active_auth',
      JSON.stringify({ user: userObj, profile: profileObj, brand: null })
    ).catch(() => {});
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          setIsGuest(false);
          await fetchProfile(currentSession.user.id, currentSession.user);
          savePushToken(currentSession.user.id);
        } else {
          // Restore local session if active
          try {
            const rawAuth = await AsyncStorage.getItem('@jumble_sale_active_auth');
            if (rawAuth) {
              const parsed = JSON.parse(rawAuth);
              if (parsed?.profile && parsed?.user) {
                setSession({ access_token: 'local-active-session', user: parsed.user } as any);
                setUser(parsed.user);
                setProfile(parsed.profile);
                setBrand(parsed.brand || null);
                setIsGuest(false);
              }
            }
          } catch (storageErr) {
            console.warn('[AuthProvider] Local auth restoration note:', storageErr);
          }
        }
      } catch (err) {
        console.error('[AuthProvider] Auth initialization failed:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        setIsGuest(false);
        await fetchProfile(currentSession.user.id, currentSession.user);
        savePushToken(currentSession.user.id);
      } else {
        setProfile(null);
        setBrand(null);
      }

      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      await AsyncStorage.removeItem('@jumble_sale_active_auth');
    } catch {}
    setSession(null);
    setUser(null);
    setProfile(null);
    setBrand(null);
    setIsGuest(false);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        brand,
        role: profile?.role ?? null,
        isLoading,
        isGuest,
        continueAsGuest,
        bypassAsAdmin,
        bypassAsBrand,
        bypassAsConsumer,
        updateProfile,
        refreshProfile,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
