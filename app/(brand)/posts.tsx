import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { DealLiveTimer } from '@/components/brand/DealLiveTimer';
import { PostInsightsDrawer } from '@/components/brand/PostInsightsDrawer';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { getDealInteractions } from '@/lib/activityStore';
import { getLocalBrands } from '@/lib/brandStore';
import {
  deleteLocalDeal,
  duplicateDeal,
  extendDealExpiry,
  getDealRemainingDays,
  getLocalBrandDeals,
  isDealExpired,
  saveLocalDeal,
  toggleDealPause,
  toggleDealPin,
} from '@/lib/dealStore';
import { getBrandFollowers } from '@/lib/followStore';
import { generateBrandPromoCopy, type CopyLanguage, type CopyTone } from '@/lib/gemini';
import { createNotification } from '@/lib/notificationStore';
import { compressAndUploadDealImage } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { onBrandPostsTabReset } from '@/lib/tabEvents';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';
import type { Brand, Deal } from '@/types/database.types';

const CATEGORIES = [
  'Fashion & Apparel',
  'Footwear & Accessories',
  'Electronics & Mobiles',
  'Food & Dining',
  'Beauty & Cosmetics',
  'Grocery & Supermarket',
  'Home & Living',
  'Travel & Experiences',
];

export const TARGET_PAKISTAN_CITIES = [
  'All Pakistan',
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
];

const DISCOUNT_PRESETS = [20, 30, 50, 70];

function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type SelectionMode = 'none' | 'delete' | 'edit';

export default function BrandPostsScreen() {
  const router = useRouter();
  const { user, profile, brand: authBrand } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Speed Dial FAB State
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  // Instagram-style: Tapping Posts in bottom nav resets back to initial view
  useEffect(() => {
    const unsubscribe = onBrandPostsTabReset(() => {
      setCreateModalOpen(false);
      setEditingPost(null);
      setSelectionMode('none');
      setSelectedPostIds([]);
      setShowMenuDropdown(false);
      setSpeedDialOpen(false);
      setAiModalOpen(false);
      setPostFilterTab('all');
    });
    return unsubscribe;
  }, []);

  // Selection Mode State (Delete or Edit selection mode)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);

  // Modal State for Create / Edit Form
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Deal | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Form Fields matching User Filter & Preferences
  const [productName, setProductName] = useState('');
  const [brandNameInput, setBrandNameInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Fashion');
  const [saleLastDate, setSaleLastDate] = useState('2026-10-31');
  const [dealType, setDealType] = useState<'online' | 'in_store'>('online');
  const [selectedCity, setSelectedCity] = useState<string>('All Pakistan');
  const [discountType, setDiscountType] = useState<'flat' | 'upto' | 'percentage'>('percentage');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPct, setDiscountPct] = useState('20');
  const [dealDescription, setDealDescription] = useState('');
  // 1. Cover Photo (Compulsory / Lazmi)
  const [coverPhoto, setCoverPhoto] = useState('');
  const [coverPhotoInputUrl, setCoverPhotoInputUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);

  // 2. Extra Product Photos (Different option - up to 5 photos)
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [extraPhotoInputUrl, setExtraPhotoInputUrl] = useState('');
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [postStatus, setPostStatus] = useState<'active' | 'expired'>('active');
  const [buyUrl, setBuyUrl] = useState('');

  // Gemini AI Copywriter State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTone, setAiTone] = useState<CopyTone>('exciting');
  const [aiLanguage, setAiLanguage] = useState<CopyLanguage>('english');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResults, setAiResults] = useState<{ titles: string[]; descriptions: string[] } | null>(null);

  // 1. Fetch Brand Profile (cached with 5-minute staleTime and fast network race)
  const { data: brand } = useQuery<Brand | null>({
    queryKey: ['my-brand', user?.id],
    queryFn: async () => {
      const localBrands = await getLocalBrands();
      const localMatch =
        localBrands.find(
          (b) =>
            (user?.id && b.owner_id === user?.id) ||
            (user?.email &&
              b.business_email?.toLowerCase() === user.email.toLowerCase())
        ) || localBrands[0] || null;

      if (!user?.id || !isSupabaseConfigured) return localMatch || authBrand;

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1000)
        );
        const dbPromise = supabase
          .from('brands')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle();

        const res: any = await Promise.race([dbPromise, timeoutPromise]);
        return (res?.data as unknown as Brand) ?? localMatch ?? authBrand;
      } catch {
        return localMatch || authBrand;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeBrandId =
    (brand?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brand.id) ? brand.id : null) ||
    (authBrand?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authBrand.id) ? authBrand.id : null) ||
    'b1111111-1111-1111-1111-111111111111';

  // 2. Fetch Real Posts (Instant 0ms memory cache + fast 1.2s timeout network race)
  const {
    data: deals = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Deal[]>({
    queryKey: ['brand-deals-posts', activeBrandId],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals(activeBrandId);
      if (!isSupabaseConfigured || !activeBrandId) {
        return localDeals;
      }

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1200)
        );
        const queryPromise = (supabase.from('deals') as any)
          .select('*, brand:brands(*)')
          .eq('brand_id', activeBrandId)
          .order('created_at', { ascending: false });

        const res: any = await Promise.race([queryPromise, timeoutPromise]);
        if (res?.data && res.data.length > 0) {
          const serverDeals = res.data as Deal[];
          for (const sd of serverDeals) {
            saveLocalDeal(sd).catch(() => {});
          }
          const merged = [...serverDeals];
          for (const ld of localDeals) {
            if (!merged.some((m) => m.id === ld.id)) {
              merged.push(ld);
            }
          }
          return merged;
        }
        return localDeals;
      } catch {
        return localDeals;
      }
    },
    staleTime: 60 * 1000,
  });

  const dealIdsKey = deals.map((d) => d.id).sort().join(',');

  // 3. Post interaction stats (parallelized with Promise.all and cached)
  const { data: postStats = {} } = useQuery<
    Record<string, { likes: number; comments: number; shares: number }>
  >({
    queryKey: ['brand-post-stats', dealIdsKey],
    queryFn: async () => {
      const statsMap: Record<string, { likes: number; comments: number; shares: number }> = {};
      await Promise.all(
        deals.map(async (d) => {
          try {
            statsMap[d.id] = await getDealInteractions(d.id);
          } catch {
            statsMap[d.id] = { likes: 0, comments: 0, shares: 0 };
          }
        })
      );
      return statsMap;
    },
    staleTime: 60 * 1000,
    enabled: deals.length > 0,
  });

  // Drawer state for Real Database Post Insights
  const [insightsDeal, setInsightsDeal] = useState<Deal | null>(null);

  // Filter Tabs: All, Active, Paused, Expired
  const [postFilterTab, setPostFilterTab] = useState<'all' | 'active' | 'paused' | 'expired'>('all');

  const activeCount = useMemo(
    () => deals.filter((d) => d.status === 'active' && !isDealExpired(d)).length,
    [deals]
  );
  const pausedCount = useMemo(
    () => deals.filter((d) => d.status === 'paused').length,
    [deals]
  );
  const expiredCount = useMemo(
    () => deals.filter((d) => isDealExpired(d) || d.status === 'expired').length,
    [deals]
  );

  // Dynamic filter according to active tab + Pinned promotions always at top
  const displayPosts = useMemo(() => {
    let filtered = deals;
    if (postFilterTab === 'active') {
      filtered = deals.filter((d) => d.status === 'active' && !isDealExpired(d));
    } else if (postFilterTab === 'paused') {
      filtered = deals.filter((d) => d.status === 'paused');
    } else if (postFilterTab === 'expired') {
      filtered = deals.filter((d) => isDealExpired(d) || d.status === 'expired');
    }

    return [...filtered].sort((a, b) => {
      // 1. Pinned to top
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
        return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
      }
      // 2. Newest first
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [deals, postFilterTab]);

  // ─── Real Database Post Management Handlers ───
  const handleTogglePin = async (deal: Deal) => {
    try {
      const isPinned = await toggleDealPin(deal.id);
      toast.show(
        isPinned ? `📌 "${deal.title}" pinned to top of promotions!` : `Unpinned "${deal.title}"`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
      queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
    } catch {
      toast.show('Failed to update pin status', 'error');
    }
  };

  const handleTogglePause = async (deal: Deal) => {
    try {
      const newStatus = await toggleDealPause(deal.id);
      const isNowPaused = newStatus === 'paused';
      toast.show(
        isNowPaused
          ? `⏸️ Promotion paused (Marked Out of Stock)`
          : `▶️ Promotion resumed and live!`,
        isNowPaused ? 'info' : 'success'
      );
      queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
      queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
      if (insightsDeal && insightsDeal.id === deal.id) {
        setInsightsDeal((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch {
      toast.show('Failed to update deal status', 'error');
    }
  };

  const handleQuickExtend = async (dealId: string, days: number) => {
    try {
      const updated = await extendDealExpiry(dealId, days);
      if (updated) {
        toast.show(`⏳ Deal extended by ${days} days and reactivated!`, 'success');
        queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
        if (insightsDeal && insightsDeal.id === dealId) {
          setInsightsDeal(updated);
        }
      }
    } catch {
      toast.show('Failed to extend deal', 'error');
    }
  };

  const handleDuplicate = async (dealId: string) => {
    try {
      const cloned = await duplicateDeal(dealId);
      if (cloned) {
        toast.show('📋 Promotion duplicated successfully!', 'success');
        queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
      }
    } catch {
      toast.show('Failed to clone promotion', 'error');
    }
  };

  const brandDisplayName = brand?.name || authBrand?.name || profile?.display_name || 'My Brand';
  const brandHandle = `@${brandDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '')}_official`;

  // Handlers for Selection Mode
  const toggleSelectPost = (id: string) => {
    if (selectedPostIds.includes(id)) {
      setSelectedPostIds(selectedPostIds.filter((item) => item !== id));
    } else {
      setSelectedPostIds([...selectedPostIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedPostIds.length === displayPosts.length) {
      setSelectedPostIds([]);
    } else {
      setSelectedPostIds(displayPosts.map((p) => p.id));
    }
  };

  // Delete Mutation
  const deleteSelectedMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteLocalDeal(id);
        try {
          await supabase.from('deals').delete().eq('id', id);
        } catch {
          // offline handled
        }
      }
    },
    onSuccess: () => {
      toast.show(`${selectedPostIds.length} posts deleted successfully! 🗑️`, 'info');
      setSelectedPostIds([]);
      setSelectionMode('none');
      queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
      queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-profile-deals'] });
      queryClient.invalidateQueries({ queryKey: ['featured-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
      refetch();
    },
    onError: (err: any) => {
      toast.show(err.message || 'Failed to delete posts', 'error');
    },
  });

  // Single Post Delete with Confirmation (Safe for Web + Native)
  const handleDeleteSingle = (post: Deal) => {
    const doDelete = async () => {
      try {
        await deleteLocalDeal(post.id);
        try {
          await supabase.from('deals').delete().eq('id', post.id);
        } catch (dbErr) {
          console.warn('[posts] Supabase delete warning:', dbErr);
        }
        toast.show('Post deleted from database! 🗑️', 'info');
        queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
        queryClient.invalidateQueries({ queryKey: ['brand-profile-deals'] });
        queryClient.invalidateQueries({ queryKey: ['featured-deals'] });
        queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
        refetch();
      } catch (err: any) {
        toast.show(err.message || 'Failed to delete post', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${post.title}"? This will remove it from the database.`
        );
        if (confirmed) {
          doDelete();
        }
      } else {
        doDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Post',
      `Are you sure you want to delete "${post.title}"? This will remove it from the database.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: doDelete,
        },
      ]
    );
  };

  // Open Create / Edit Modal (supports extending expired deals)
  const handleOpenCreateModal = (postToEdit?: Deal, isExtending: boolean = false) => {
    setSelectionMode('none');
    if (postToEdit) {
      setEditingPost(postToEdit);
      setProductName(postToEdit.title);
      setBrandNameInput(brandDisplayName);
      setSelectedCategory(postToEdit.brand?.category || 'Fashion');
      
      const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const existingDate = postToEdit.end_date ? postToEdit.end_date.split('T')[0] : futureDate;

      setSaleLastDate(isExtending ? futureDate : existingDate);
      setDealType(postToEdit.deal_type === 'in_store' ? 'in_store' : 'online');
      setSelectedCity(postToEdit.city || 'All Pakistan');
      setDiscountType('percentage');
      setOriginalPrice(
        postToEdit.original_price
          ? String(postToEdit.original_price)
          : postToEdit.discount_price
          ? String(Math.round(postToEdit.discount_price / 0.8))
          : '10000'
      );
      setDiscountPct(String(postToEdit.discount_pct || '20'));
      setDealDescription(postToEdit.description || '');

      const loadedCover = postToEdit.banner_url || postToEdit.image_urls?.[0] || '';
      const loadedExtras = Array.isArray(postToEdit.image_urls) && postToEdit.image_urls.length > 1
        ? postToEdit.image_urls.slice(1, 6)
        : [];
      setCoverPhoto(loadedCover);
      setCoverPhotoInputUrl('');
      setExtraPhotos(loadedExtras);
      setExtraPhotoInputUrl('');
      setPostStatus(isExtending ? 'active' : postToEdit.status === 'expired' ? 'expired' : 'active');
      setBuyUrl(postToEdit.buy_url || (postToEdit as any).website_url || '');
    } else {
      setEditingPost(null);
      setProductName('');
      setBrandNameInput(brandDisplayName);
      setSelectedCategory('Fashion');
      setSaleLastDate('2026-10-31');
      setDealType('online');
      setSelectedCity('All Pakistan');
      setDiscountType('percentage');
      setOriginalPrice('');
      setDiscountPct('20');
      setDealDescription('');
      setCoverPhoto('');
      setCoverPhotoInputUrl('');
      setExtraPhotos([]);
      setExtraPhotoInputUrl('');
      setPostStatus('active');
      setBuyUrl('');
    }
    setCreateModalOpen(true);
  };

  // 1. Cover Photo Handlers (Compulsory)
  const handlePickCoverPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to upload cover photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingCover(true);
        try {
          const finalUri = await compressAndUploadDealImage(
            activeBrandId || 'brand-generic',
            result.assets[0].uri
          );
          setCoverPhoto(finalUri || result.assets[0].uri);
          toast.show('Main Cover photo uploaded! ⭐', 'success');
        } catch {
          setCoverPhoto(result.assets[0].uri);
        } finally {
          setUploadingCover(false);
        }
      }
    } catch (err: any) {
      toast.show(err.message || 'Could not pick cover photo', 'error');
      setUploadingCover(false);
    }
  };

  const handleSetCoverPhotoUrl = () => {
    const trimmed = coverPhotoInputUrl.trim();
    if (!trimmed) {
      toast.show('Please enter a valid image URL for cover', 'warning');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:')) {
      toast.show('URL must start with http:// or https://', 'warning');
      return;
    }
    setCoverPhoto(trimmed);
    setCoverPhotoInputUrl('');
    toast.show('Main Cover photo set! ⭐', 'success');
  };

  const handleRemoveCoverPhoto = () => {
    setCoverPhoto('');
    toast.show('Cover photo removed', 'info');
  };

  // 2. Extra Photos Handlers (Optional - up to 5)
  const handlePickExtraPhotos = async () => {
    if (extraPhotos.length >= 5) {
      toast.show('Maximum 5 extra photos allowed.', 'warning');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to upload extra photos.');
        return;
      }

      const remainingLimit = 5 - extraPhotos.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingLimit,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingExtra(true);
        const uploaded: string[] = [];

        for (const asset of result.assets) {
          try {
            const finalUri = await compressAndUploadDealImage(
              activeBrandId || 'brand-generic',
              asset.uri
            );
            if (finalUri) uploaded.push(finalUri);
          } catch {
            uploaded.push(asset.uri);
          }
        }

        if (uploaded.length > 0) {
          setExtraPhotos((prev) => [...prev, ...uploaded].slice(0, 5));
          toast.show(`${uploaded.length} extra photo(s) added! 📸`, 'success');
        }
      }
    } catch (err: any) {
      toast.show(err.message || 'Could not pick extra photos', 'error');
    } finally {
      setUploadingExtra(false);
    }
  };

  const handleAddExtraPhotoUrl = () => {
    const trimmed = extraPhotoInputUrl.trim();
    if (!trimmed) {
      toast.show('Please enter a valid extra photo URL', 'warning');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:')) {
      toast.show('URL must start with http:// or https://', 'warning');
      return;
    }
    if (extraPhotos.length >= 5) {
      toast.show('Maximum 5 extra photos allowed', 'warning');
      return;
    }
    setExtraPhotos((prev) => [...prev, trimmed]);
    setExtraPhotoInputUrl('');
    toast.show('Extra angle photo added! 🖼️', 'success');
  };

  const handleMoveExtraPhoto = (fromIndex: number, direction: 'left' | 'right') => {
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= extraPhotos.length) return;
    setExtraPhotos((prev) => {
      const copy = [...prev];
      const temp = copy[fromIndex];
      copy[fromIndex] = copy[toIndex];
      copy[toIndex] = temp;
      return copy;
    });
  };

  const handleRemoveExtraPhoto = (index: number) => {
    setExtraPhotos((prev) => prev.filter((_, i) => i !== index));
    toast.show('Extra photo removed', 'info');
  };

  // AI Promotional Copy Generator Handler (Gemini)
  const handleGenerateAi = async () => {
    setAiGenerating(true);
    try {
      const res = await generateBrandPromoCopy({
        product_or_category: productName.trim() || selectedCategory,
        brand_name: brandNameInput.trim() || brand?.name || 'Our Brand',
        discount_pct: parseFloat(discountPct) || 30,
        tone: aiTone,
        language: aiLanguage,
      });

      setAiResults({
        titles: res.titles,
        descriptions: res.descriptions,
      });
      toast.show('Gemini AI headlines & descriptions generated! ✨', 'success');
    } catch (err: any) {
      toast.show(err.message || 'AI copy generation error', 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  // Submit Post (CRUD Create & Update linked to Supabase database with zero post disappearance)
  const handlePublishPost = async () => {
    if (!productName.trim()) {
      toast.show('Please enter a product name', 'error');
      return;
    }

    if (!coverPhoto.trim()) {
      toast.show('Main Cover Photo lazmi (compulsory) hai! Baraye meharbani cover photo upload ya enter karein.', 'error');
      return;
    }

    const finalImageUrls = [
      coverPhoto.trim(),
      ...extraPhotos.map((p) => p.trim()).filter(Boolean),
    ];

    const origPriceNum = parseFloat(originalPrice) || 10000;
    const pctNum = parseFloat(discountPct) || 20;
    const calcDiscountPrice = Math.round(origPriceNum * (1 - pctNum / 100));

    setPublishing(true);
    try {
      const isUUID = (val?: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');

      const CATEGORY_MAP: Record<string, string> = {
        'Fashion & Apparel': '11111111-1111-1111-1111-111111111111',
        Fashion: '11111111-1111-1111-1111-111111111111',
        'Footwear & Accessories': '77777777-7777-7777-7777-777777777777',
        Footwear: '77777777-7777-7777-7777-777777777777',
        Shoes: '77777777-7777-7777-7777-777777777777',
        Accessories: '77777777-7777-7777-7777-777777777777',
        'Electronics & Mobiles': '22222222-2222-2222-2222-222222222222',
        Electronics: '22222222-2222-2222-2222-222222222222',
        'Food & Dining': '33333333-3333-3333-3333-333333333333',
        Food: '33333333-3333-3333-3333-333333333333',
        'Beauty & Cosmetics': '55555555-5555-5555-5555-555555555555',
        Beauty: '55555555-5555-5555-5555-555555555555',
        'Grocery & Supermarket': '44444444-4444-4444-4444-444444444444',
        Grocery: '44444444-4444-4444-4444-444444444444',
        'Home & Living': '66666666-6666-6666-6666-666666666666',
        Home: '66666666-6666-6666-6666-666666666666',
        'Travel & Experiences': '88888888-8888-8888-8888-888888888888',
        Travel: '88888888-8888-8888-8888-888888888888',
      };
      const categoryId = CATEGORY_MAP[selectedCategory] || '11111111-1111-1111-1111-111111111111';

      const targetBrandId =
        activeBrandId && isUUID(activeBrandId)
          ? activeBrandId
          : 'b1111111-1111-1111-1111-111111111111';

      const dealId = editingPost ? editingPost.id : generateUUID();
      const payload: Partial<Deal> = {
        id: dealId,
        title: productName.trim(),
        description: dealDescription.trim() || 'Special discount campaign.',
        discount_pct: pctNum,
        original_price: origPriceNum,
        discount_price: calcDiscountPrice,
        status: postStatus,
        start_date: new Date().toISOString(),
        end_date: saleLastDate
          ? (/^\d{4}-\d{2}-\d{2}$/.test(saleLastDate)
              ? new Date(`${saleLastDate}T23:59:59.999Z`).toISOString()
              : new Date(saleLastDate).toISOString())
          : new Date(Date.now() + 14 * 86400000).toISOString(),
        deal_type: dealType,
        city: selectedCity || 'All Pakistan',
        image_urls: finalImageUrls,
        banner_url: coverPhoto.trim(),
        brand_id: targetBrandId,
        category_id: categoryId,
        buy_url: buyUrl.trim() || null,
        website_url: buyUrl.trim() || null,
      };

      // 1. Always update local store immediately for instant UI responsiveness
      await saveLocalDeal(payload);

      // 2. Sync to Supabase database
      const dbRow: any = {
        id: dealId,
        brand_id: targetBrandId,
        category_id: categoryId,
        title: payload.title,
        description: payload.description,
        discount_pct: payload.discount_pct,
        original_price: origPriceNum,
        discount_price: calcDiscountPrice,
        status: postStatus,
        start_date: payload.start_date,
        end_date: payload.end_date,
        deal_type: dealType,
        city: selectedCity || 'All Pakistan',
        image_urls: payload.image_urls,
        banner_url: payload.banner_url,
        buy_url: payload.buy_url,
        website_url: payload.website_url,
      };

      if (editingPost) {
        if (isUUID(editingPost.id)) {
          const { error: updErr } = await (supabase.from('deals') as any)
            .update(dbRow)
            .eq('id', editingPost.id);
          if (updErr) console.warn('[posts] Supabase update warning:', updErr);
        }
        toast.show(`Post "${payload.title}" updated successfully! ✅`, 'success');
      } else {
        const { error: insErr } = await (supabase.from('deals') as any).insert(dbRow);
        if (insErr) {
          console.warn('[posts] Supabase insert note, attempting upsert:', insErr.message);
          await (supabase.from('deals') as any).upsert(dbRow, { onConflict: 'id' });
        }
        toast.show('New post published live to database! 🚀', 'success');

        // Genuine notifications for: Brand, Admin, and Brand Followers
        try {
          // 1. Notify Brand
          await createNotification({
            role: 'brand',
            userId: targetBrandId,
            brand_id: targetBrandId,
            deal_id: dealId,
            category: 'deal',
            title: 'Deal Published! 🚀',
            body: `Aapki deal "${payload.title}" successfully live publish ho chuki hai.`,
            action_url: '/(brand)/posts',
          });

          // 2. Notify Admin
          await createNotification({
            role: 'admin',
            userId: 'admin',
            deal_id: dealId,
            category: 'moderation',
            title: 'New Deal Moderation Queue',
            body: `${brand?.name || 'Brand'} ne new promotion "${payload.title}" publish ki hai review ke liye.`,
            action_url: 'deals_queue',
          });

          // 3. Notify all followers of this brand
          const followerIds = await getBrandFollowers(targetBrandId);
          for (const followerId of followerIds) {
            await createNotification({
              role: 'consumer',
              userId: followerId,
              brand_id: targetBrandId,
              deal_id: dealId,
              category: 'deal',
              title: `${brand?.name || 'Followed Brand'}: New Deal Live! 🔥`,
              body: `${brand?.name || 'Brand'} ne new deal "${payload.title}" (${payload.discount_pct}% OFF) live kar di hai!`,
              action_url: `/(consumer)/deal/${dealId}`,
            });
          }
        } catch (notifErr) {
          console.warn('[posts] Notification dispatch notice:', notifErr);
        }
      }

      setCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
      queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
      queryClient.invalidateQueries({ queryKey: ['consumer-explore-deals'] });
      refetch();
    } catch (err: any) {
      toast.show(err.message || 'Failed to publish post', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── SELECTION MODE TOP BANNER ─── */}
      {selectionMode !== 'none' ? (
        <View
          style={[
            styles.selectionBanner,
            selectionMode === 'edit' && styles.selectionBannerEdit,
          ]}>
          <View style={styles.selectionBannerLeft}>
            <View
              style={[
                styles.selectionIconBox,
                selectionMode === 'edit' && styles.selectionIconBoxEdit,
              ]}>
              <Ionicons
                name={selectionMode === 'delete' ? 'trash' : 'create'}
                size={18}
                color={selectionMode === 'delete' ? '#EF4444' : '#38BDF8'}
              />
            </View>
            <View>
              <Text
                style={[
                  styles.selectionBannerTitle,
                  selectionMode === 'edit' && { color: '#38BDF8' },
                ]}>
                {selectionMode === 'delete'
                  ? 'Select Posts to Delete'
                  : 'Select Post to Edit'}
              </Text>
              <Text style={styles.selectionBannerSubtitle}>
                {selectionMode === 'delete'
                  ? 'Select posts to remove from database'
                  : 'Tap any post below to edit its price, pic & details'}
              </Text>
            </View>
          </View>

          <View style={styles.selectionBannerRight}>
            {selectionMode === 'delete' && (
              <Pressable
                style={styles.selectAllBtn}
                onPress={handleSelectAll}
                hitSlop={6}>
                <Ionicons
                  name={
                    selectedPostIds.length === displayPosts.length
                      ? 'checkbox'
                      : 'square-outline'
                  }
                  size={18}
                  color="#00FF66"
                />
                <Text style={styles.selectAllText}>Select All</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelSelectionBtn}
              onPress={() => {
                setSelectionMode('none');
                setSelectedPostIds([]);
              }}>
              <Text style={styles.cancelSelectionText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ─── REGULAR TOP BAR (Screenshot 1) ─── */
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.headerTitle}>My Posts</Text>
            <Text style={styles.headerSubtitle}>
              {displayPosts.length} published • {brandDisplayName} Brand
            </Text>
          </View>

          {/* Action Menu Dropdown Icon Button */}
          <Pressable
            style={styles.actionMenuBtn}
            onPress={() => setShowMenuDropdown(!showMenuDropdown)}
            hitSlop={8}>
            <Ionicons name="menu-outline" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {/* Action Menu Dropdown Drawer */}
      {showMenuDropdown && selectionMode === 'none' && (
        <View style={styles.menuDropdown}>
          <Pressable
            style={styles.dropdownItem}
            onPress={() => {
              setShowMenuDropdown(false);
              handleOpenCreateModal();
            }}>
            <Ionicons name="add-circle-outline" size={18} color="#00FF66" />
            <Text style={styles.dropdownText}>Create New Post</Text>
          </Pressable>

          <View style={styles.dropdownDivider} />

          <Pressable
            style={styles.dropdownItem}
            onPress={() => {
              setShowMenuDropdown(false);
              setSelectionMode('edit');
            }}>
            <Ionicons name="create-outline" size={18} color="#00FF66" />
            <Text style={styles.dropdownText}>Select Posts to Edit</Text>
          </Pressable>

          <View style={styles.dropdownDivider} />

          <Pressable
            style={styles.dropdownItem}
            onPress={() => {
              setShowMenuDropdown(false);
              setSelectionMode('delete');
            }}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={[styles.dropdownText, { color: '#EF4444' }]}>
              Select Posts to Delete
            </Text>
          </Pressable>
        </View>
      )}

      {/* ─── STATUS FILTER TABS (All / Active / Paused / Expired) ─── */}
      {selectionMode === 'none' && (
        <View style={styles.filterTabsRow}>
          <Pressable
            style={[styles.filterTab, postFilterTab === 'all' && styles.filterTabActive]}
            onPress={() => setPostFilterTab('all')}>
            <Text
              style={[
                styles.filterTabText,
                postFilterTab === 'all' && styles.filterTabTextActive,
              ]}>
              All ({deals.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, postFilterTab === 'active' && styles.filterTabActive]}
            onPress={() => setPostFilterTab('active')}>
            <View style={styles.tabDotActive} />
            <Text
              style={[
                styles.filterTabText,
                postFilterTab === 'active' && styles.filterTabTextActive,
              ]}>
              Active ({activeCount})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, postFilterTab === 'paused' && styles.filterTabActive]}
            onPress={() => setPostFilterTab('paused')}>
            <View style={[styles.tabDotActive, { backgroundColor: '#F59E0B' }]} />
            <Text
              style={[
                styles.filterTabText,
                postFilterTab === 'paused' && styles.filterTabTextActive,
              ]}>
              Paused ({pausedCount})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, postFilterTab === 'expired' && styles.filterTabActive]}
            onPress={() => setPostFilterTab('expired')}>
            <View style={styles.tabDotExpired} />
            <Text
              style={[
                styles.filterTabText,
                postFilterTab === 'expired' && styles.filterTabTextActive,
              ]}>
              Expired ({expiredCount})
            </Text>
          </Pressable>
        </View>
      )}

      {/* ─── POSTS FEED LIST ─── */}
      {isLoading && displayPosts.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#00FF66" />
        </View>
      ) : (
        <FlatList
          data={displayPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#00FF66"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                postFilterTab === 'expired'
                  ? 'No Expired Deals'
                  : postFilterTab === 'active'
                  ? 'No Active Deals'
                  : 'No Promotions Posted'
              }
              description={
                postFilterTab === 'expired'
                  ? 'None of your promotions have expired. All running promotions are currently active!'
                  : postFilterTab === 'active'
                  ? 'You currently have no active promotions running. Tap "Create New Post" to launch a sale.'
                  : "No promotions found in your brand account. Tap 'Create New Post' from the top right menu to publish an offer."
              }
              icon="documents-outline"
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedPostIds.includes(item.id);
            const isEnded = isDealExpired(item);
            const daysLeft = getDealRemainingDays(item);
            const bannerUri =
              item.image_urls?.[0] ||
              'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80';
            const origPriceFormatted = item.original_price
              ? `Rs. ${item.original_price.toLocaleString()}`
              : (item.discount_price ? `Rs. ${item.discount_price.toLocaleString()}` : '');

            return (
              <Pressable
                style={[
                  styles.postCard,
                  selectionMode === 'edit' && styles.postCardEditMode,
                  selectionMode === 'delete' && isSelected && styles.postCardSelected,
                ]}
                onPress={() => {
                  if (selectionMode === 'delete') {
                    toggleSelectPost(item.id);
                  } else if (selectionMode === 'edit') {
                    handleOpenCreateModal(item);
                  } else {
                    router.push({
                      pathname: '/(brand)/deal/[id]',
                      params: { id: item.id, fromPosts: '1' },
                    });
                  }
                }}>
                {/* 0. Pinned / Featured Ribbon */}
                {Boolean(item.is_pinned) && (
                  <View style={styles.pinnedRibbon}>
                    <Ionicons name="pin" size={11} color="#090A0E" />
                    <Text style={styles.pinnedRibbonText}>PINNED / FEATURED PROMOTION</Text>
                  </View>
                )}

                {/* 1. Post Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.brandAvatarRing}>
                    <Text style={styles.avatarInitial}>
                      {brandDisplayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardBrandName}>{brandDisplayName}</Text>
                    <Text style={styles.cardBrandHandle}>{brandHandle}</Text>
                  </View>

                  {selectionMode === 'edit' ? (
                    <View style={styles.editModeBadge}>
                      <Ionicons name="create" size={13} color="#090A0E" />
                      <Text style={styles.editModeBadgeText}>SELECT TO EDIT</Text>
                    </View>
                  ) : selectionMode === 'delete' ? (
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={isSelected ? '#00FF66' : '#64748B'}
                    />
                  ) : (
                    <View style={styles.cardHeaderRight}>
                      <Text style={styles.cardTimestamp}>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Active'}
                      </Text>
                      <Pressable
                        style={styles.cardActionIconBtn}
                        hitSlop={6}
                        onPress={() => handleOpenCreateModal(item)}>
                        <Ionicons name="create-outline" size={16} color="#38BDF8" />
                      </Pressable>
                      <Pressable
                        style={styles.cardActionIconBtn}
                        hitSlop={6}
                        onPress={() => handleDeleteSingle(item)}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* 2. Media Image Banner */}
                <View style={styles.mediaContainer}>
                  <Image source={{ uri: bannerUri }} style={styles.mediaImage} />

                  {/* Real Live Urgency Countdown Timer Overlay */}
                  <View style={styles.timerMediaOverlay}>
                    <DealLiveTimer
                      dealId={item.id}
                      endDate={item.end_date}
                      status={item.status}
                      onExpire={() => {
                        queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
                      }}
                      compact
                    />
                  </View>

                  {/* SALE ENDED Translucent Overlay (Screenshot 1) */}
                  {isEnded && (
                    <View style={styles.saleEndedOverlay}>
                      <View style={styles.saleEndedBadge}>
                        <Ionicons name="time-outline" size={14} color="#EF4444" />
                        <Text style={styles.saleEndedText}>SALE ENDED</Text>
                      </View>
                    </View>
                  )}

                  {/* PAUSED Translucent Overlay */}
                  {item.status === 'paused' && !isEnded && (
                    <View style={styles.saleEndedOverlay}>
                      <View style={[styles.saleEndedBadge, { backgroundColor: '#F59E0B25', borderColor: '#F59E0B' }]}>
                        <Ionicons name="pause-circle" size={14} color="#F59E0B" />
                        <Text style={[styles.saleEndedText, { color: '#F59E0B' }]}>PAUSED (OUT OF STOCK)</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* 3. Post Details Body */}
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.postTitle}>
                      {(item.title || '').replace(/\s*\((?:copy|nakal)\)/gi, '').trim()}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isEnded
                          ? styles.statusBadgeEnded
                          : item.status === 'paused'
                          ? styles.statusBadgePaused
                          : styles.statusBadgeActive,
                      ]}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isEnded
                            ? { color: '#EF4444' }
                            : item.status === 'paused'
                            ? { color: '#F59E0B' }
                            : { color: '#00FF66' },
                        ]}>
                        {isEnded
                          ? 'ENDED'
                          : item.status === 'paused'
                          ? 'PAUSED'
                          : daysLeft !== null && daysLeft <= 2
                          ? `ENDING SOON (${daysLeft}d)`
                          : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.postDescription} numberOfLines={2}>
                    {item.description}
                  </Text>

                  {/* Quick Extend / Reactivate Button for Ended Deals */}
                  {isEnded && selectionMode === 'none' && (
                    <Pressable
                      style={styles.extendDealBtn}
                      hitSlop={6}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenCreateModal(item, true);
                      }}>
                      <Ionicons name="refresh" size={13} color="#38BDF8" />
                      <Text style={styles.extendDealBtnText}>Extend Deal / Reactivate</Text>
                    </Pressable>
                  )}

                  {/* Price Row with Strikethrough */}
                  <Text style={styles.postPriceText}>{origPriceFormatted}</Text>

                  {/* Matching User Preferences Tags (City & Deal Type) */}
                  <View style={styles.preferenceTagsRow}>
                    <View style={styles.prefTag}>
                      <Ionicons name="location-outline" size={11} color="#00FF66" />
                      <Text style={styles.prefTagText}>{item.city || 'All Pakistan'}</Text>
                    </View>
                    <View style={styles.prefTag}>
                      <Ionicons
                        name={item.deal_type === 'in_store' ? 'storefront-outline' : 'globe-outline'}
                        size={11}
                        color="#38BDF8"
                      />
                      <Text style={[styles.prefTagText, { color: '#38BDF8' }]}>
                        {item.deal_type === 'in_store' ? 'In-Store Outlets' : 'Online Only'}
                      </Text>
                    </View>
                    {Boolean(item.discount_pct) && (
                      <View style={styles.prefTag}>
                        <Ionicons name="pricetag-outline" size={11} color="#F59E0B" />
                        <Text style={[styles.prefTagText, { color: '#F59E0B' }]}>
                          {item.discount_pct}% OFF
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Buy Link Badge */}
                  {Boolean(item.buy_url || (item as any).website_url) && (
                    <Pressable
                      style={styles.postLinkBadge}
                      onPress={(e) => {
                        e.stopPropagation();
                        let target = (item.buy_url || (item as any).website_url).trim();
                        if (!target.startsWith('http://') && !target.startsWith('https://')) {
                          target = `https://${target}`;
                        }
                        Linking.openURL(target).catch(() => {});
                      }}>
                      <Ionicons name="link-outline" size={13} color="#00FF66" />
                      <Text style={styles.postLinkText} numberOfLines={1}>
                        {item.buy_url || (item as any).website_url}
                      </Text>
                      <Ionicons name="open-outline" size={11} color="#00FF66" />
                    </Pressable>
                  )}

                  {/* 4. Interaction Footer Bar (Real, live counts - no dummy data) */}
                  {(() => {
                    const stats = postStats[item.id] || { likes: 0, comments: 0, shares: 0 };
                    const realLikes = stats.likes ?? 0;
                    const realComments = stats.comments ?? 0;
                    const realShares = stats.shares ?? 0;

                    return (
                      <View style={styles.interactionRow}>
                        <Pressable
                          style={styles.interactionItem}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: '/(brand)/deal/[id]',
                              params: { id: item.id, fromPosts: '1' },
                            });
                          }}>
                          <Ionicons
                            name={realLikes > 0 ? 'heart' : 'heart-outline'}
                            size={16}
                            color={realLikes > 0 ? '#FF4500' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.interactionCount,
                              realLikes > 0 && { color: '#FF4500', fontWeight: '700' },
                            ]}>
                            {realLikes}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={styles.interactionItem}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: '/(brand)/deal/[id]',
                              params: { id: item.id, fromPosts: '1' },
                            });
                          }}>
                          <Ionicons
                            name="chatbubble-outline"
                            size={16}
                            color={realComments > 0 ? '#00FF66' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.interactionCount,
                              realComments > 0 && { color: '#00FF66', fontWeight: '700' },
                            ]}>
                            {realComments}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={styles.interactionItem}
                          onPress={async (e) => {
                            e.stopPropagation();
                            try {
                              await Share.share({
                                title: item.title,
                                message: `Check out ${item.title} on Jumble Sale! ${
                                  item.buy_url ? '\nBuy Link: ' + item.buy_url : ''
                                }`,
                              });
                            } catch {
                              //
                            }
                          }}>
                          <Ionicons name="share-outline" size={16} color="#94A3B8" />
                          <Text style={styles.interactionCount}>
                            {realShares > 0 ? realShares : 'Share'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                </View>

                {/* 5. Quick Actions Row (Pin, Pause, +3d, +7d, Clone, Insights) */}
                {selectionMode === 'none' && (
                  <View style={styles.cardQuickActionsBar}>
                    {/* Pin / Unpin */}
                    <Pressable
                      style={[
                        styles.quickActionChip,
                        item.is_pinned && styles.quickActionChipPinned,
                      ]}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleTogglePin(item);
                      }}>
                      <Ionicons
                        name={item.is_pinned ? 'pin' : 'pin-outline'}
                        size={12}
                        color={item.is_pinned ? '#090A0E' : '#94A3B8'}
                      />
                      <Text
                        style={[
                          styles.quickActionChipText,
                          item.is_pinned && styles.quickActionChipTextPinned,
                        ]}>
                        {item.is_pinned ? 'Pinned' : 'Pin'}
                      </Text>
                    </Pressable>

                    {/* Pause / Resume */}
                    <Pressable
                      style={[
                        styles.quickActionChip,
                        item.status === 'paused' && styles.quickActionChipPaused,
                      ]}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleTogglePause(item);
                      }}>
                      <Ionicons
                        name={item.status === 'paused' ? 'play-outline' : 'pause-outline'}
                        size={12}
                        color={item.status === 'paused' ? '#00FF66' : '#F59E0B'}
                      />
                      <Text
                        style={[
                          styles.quickActionChipText,
                          item.status === 'paused' && { color: '#00FF66' },
                          item.status !== 'paused' && { color: '#F59E0B' },
                        ]}>
                        {item.status === 'paused' ? 'Resume' : 'Pause'}
                      </Text>
                    </Pressable>

                    {/* +3d */}
                    <Pressable
                      style={styles.quickActionChip}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleQuickExtend(item.id, 3);
                      }}>
                      <Ionicons name="add-circle-outline" size={12} color="#38BDF8" />
                      <Text style={[styles.quickActionChipText, { color: '#38BDF8' }]}>+3d</Text>
                    </Pressable>

                    {/* +7d */}
                    <Pressable
                      style={styles.quickActionChip}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleQuickExtend(item.id, 7);
                      }}>
                      <Ionicons name="calendar-outline" size={12} color="#38BDF8" />
                      <Text style={[styles.quickActionChipText, { color: '#38BDF8' }]}>+7d</Text>
                    </Pressable>

                    {/* Clone */}
                    <Pressable
                      style={styles.quickActionChip}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDuplicate(item.id);
                      }}>
                      <Ionicons name="copy-outline" size={12} color="#A78BFA" />
                      <Text style={[styles.quickActionChipText, { color: '#A78BFA' }]}>Clone</Text>
                    </Pressable>

                    {/* Insights */}
                    <Pressable
                      style={[styles.quickActionChip, styles.insightsActionChip]}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        setInsightsDeal(item);
                      }}>
                      <Ionicons name="bar-chart-outline" size={12} color="#00FF66" />
                      <Text style={[styles.quickActionChipText, { color: '#00FF66' }]}>Insights</Text>
                    </Pressable>
                  </View>
                )}

                {/* Edit Mode Interactive Bar */}
                {selectionMode === 'edit' && (
                  <View style={styles.editCardActionBanner}>
                    <Ionicons name="pencil" size={14} color="#090A0E" />
                    <Text style={styles.editCardActionText}>
                      TAP TO EDIT THIS POST (PRICE, PIC, DETAILS)
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="#090A0E" />
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* ─── BOTTOM ACTION BAR IN SELECTION MODE ─── */}
      {selectionMode === 'delete' && selectedPostIds.length > 0 && (
        <View style={styles.selectionBottomBar}>
          <Button
            label={`Delete Selected (${selectedPostIds.length})`}
            variant="danger"
            fullWidth
            onPress={() => deleteSelectedMut.mutate(selectedPostIds)}
          />
        </View>
      )}

      {/* ─── SPEED DIAL BACKDROP ─── */}
      {selectionMode === 'none' && speedDialOpen && (
        <Pressable
          style={styles.speedDialBackdrop}
          onPress={() => setSpeedDialOpen(false)}
        />
      )}

      {/* ─── SPEED DIAL 3 OPTIONS (CREATE, EDIT, DELETE) ─── */}
      {selectionMode === 'none' && speedDialOpen && (
        <View style={styles.speedDialMenu}>
          {/* 1. Create Post Option */}
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setSpeedDialOpen(false);
              handleOpenCreateModal();
            }}>
            <View style={styles.speedDialLabelContainer}>
              <Text style={styles.speedDialLabelText}>Create Post</Text>
            </View>
            <View style={[styles.speedDialIconCircle, { backgroundColor: '#00FF66' }]}>
              <Ionicons name="add" size={24} color="#090A0E" />
            </View>
          </Pressable>

          {/* 2. Edit Post Option */}
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setSpeedDialOpen(false);
              if (displayPosts.length === 0) {
                toast.show('No posts available to edit', 'info');
              } else {
                setSelectionMode('edit');
                toast.show('Select a post below to edit its price, pic & details ✏️', 'info');
              }
            }}>
            <View style={styles.speedDialLabelContainer}>
              <Text style={styles.speedDialLabelText}>Edit Post</Text>
            </View>
            <View style={[styles.speedDialIconCircle, { backgroundColor: '#38BDF8' }]}>
              <Ionicons name="create-outline" size={20} color="#090A0E" />
            </View>
          </Pressable>

          {/* 3. Delete Post Option */}
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setSpeedDialOpen(false);
              if (displayPosts.length === 0) {
                toast.show('No posts available to delete', 'info');
              } else if (displayPosts.length === 1) {
                handleDeleteSingle(displayPosts[0]);
              } else {
                setSelectionMode('delete');
                toast.show('Select posts to delete 🗑️', 'info');
              }
            }}>
            <View style={styles.speedDialLabelContainer}>
              <Text style={[styles.speedDialLabelText, { color: '#EF4444' }]}>Delete Post</Text>
            </View>
            <View style={[styles.speedDialIconCircle, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      )}

      {/* ─── FLOATING ACTION BUTTON (FAB) ─── */}
      {selectionMode === 'none' && (
        <Pressable
          style={[styles.fabBtn, speedDialOpen && styles.fabBtnOpen]}
          onPress={() => setSpeedDialOpen(!speedDialOpen)}
          accessibilityLabel="Open Actions Menu"
          hitSlop={8}>
          <Ionicons
            name={speedDialOpen ? 'close' : 'add'}
            size={speedDialOpen ? 26 : 28}
            color={speedDialOpen ? '#FFFFFF' : '#090A0E'}
          />
        </Pressable>
      )}

      {/* ─── MODAL: CREATE NEW POST (Screenshot 2) ─── */}
      <Modal visible={createModalOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.createModalOverlay}>
          {/* Modal Header */}
          <View style={styles.createModalHeader}>
            <Pressable
              onPress={() => setCreateModalOpen(false)}
              hitSlop={8}
              style={styles.closeModalBtn}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.createModalTitle}>
              {editingPost ? 'Edit Post' : 'Create New Post'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.createModalForm} showsVerticalScrollIndicator={false}>
            {/* ─── SECTION 1: MAIN COVER PHOTO (COMPULSORY / LAZMI) ─── */}
            <View style={styles.sectionCardBox}>
              <View style={styles.photosHeaderRow}>
                <View style={styles.labelRow}>
                  <View style={styles.greenDot} />
                  <Text style={styles.formSectionLabel}>Main Cover Photo</Text>
                  <Text style={styles.requiredStar}>*</Text>
                </View>
                <View style={[styles.compulsoryBadge, !coverPhoto && styles.compulsoryBadgePending]}>
                  <Ionicons
                    name={coverPhoto ? 'checkmark-circle' : 'alert-circle'}
                    size={12}
                    color={coverPhoto ? '#00FF66' : '#FF4D4D'}
                  />
                  <Text style={[styles.compulsoryBadgeText, !coverPhoto && { color: '#FF4D4D' }]}>
                    {coverPhoto ? 'Cover Set' : 'Required / Lazmi'}
                  </Text>
                </View>
              </View>
              <Text style={styles.helpText}>
                Yeh main banner photo hai jo Home Feed, Explore aur cards par laazmi show hogi.
              </Text>

              {coverPhoto ? (
                <View style={styles.coverPreviewCard}>
                  <Image source={{ uri: coverPhoto }} style={styles.coverPreviewImage} />
                  <View style={styles.coverPhotoTopBadge}>
                    <Ionicons name="star" size={11} color="#090A0E" />
                    <Text style={styles.coverPhotoTopBadgeText}>MAIN COVER PHOTO</Text>
                  </View>
                  <View style={styles.coverActionButtons}>
                    <Pressable
                      style={styles.changeCoverBtn}
                      onPress={handlePickCoverPhoto}
                      disabled={uploadingCover}>
                      <Ionicons name="camera-outline" size={13} color="#00FF66" />
                      <Text style={styles.changeCoverText}>Change</Text>
                    </Pressable>
                    <Pressable
                      style={styles.removeCoverBtn}
                      onPress={handleRemoveCoverPhoto}
                      hitSlop={6}>
                      <Ionicons name="trash-outline" size={13} color="#FF4D4D" />
                      <Text style={styles.removeCoverText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyCoverContainer}>
                  <Pressable
                    style={[styles.uploadDropzone, styles.coverDropzone]}
                    onPress={handlePickCoverPhoto}
                    disabled={uploadingCover}>
                    {uploadingCover ? (
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color="#00FF66" />
                        <Text style={styles.uploadDropzoneText}>Saving cover photo...</Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.uploadIconBadge}>
                          <Ionicons name="camera" size={24} color="#00FF66" />
                        </View>
                        <Text style={styles.uploadDropzoneTitle}>Upload Main Cover Photo *</Text>
                        <Text style={styles.uploadDropzoneText}>
                          Tap to select primary banner photo from phone gallery or files
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {/* Direct Cover URL input */}
                  <View style={styles.urlAddRow}>
                    <Ionicons name="link-outline" size={16} color="#64748B" />
                    <TextInput
                      style={styles.urlInput}
                      placeholder="Or paste direct Cover Photo URL (https://...)"
                      placeholderTextColor="#64748B"
                      value={coverPhotoInputUrl}
                      onChangeText={setCoverPhotoInputUrl}
                      autoCapitalize="none"
                    />
                    <Pressable
                      style={[styles.addUrlBtn, !coverPhotoInputUrl.trim() && { opacity: 0.5 }]}
                      onPress={handleSetCoverPhotoUrl}
                      disabled={!coverPhotoInputUrl.trim()}>
                      <Ionicons name="checkmark" size={14} color="#090A0E" />
                      <Text style={styles.addUrlBtnText}>Set Cover</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* ─── SECTION 2: ADDITIONAL PRODUCT PHOTOS (DIFFERENT OPTION - UP TO 5) ─── */}
            <View style={[styles.sectionCardBox, { marginTop: 4 }]}>
              <View style={styles.photosHeaderRow}>
                <View style={styles.labelRow}>
                  <View style={[styles.greenDot, { backgroundColor: '#38BDF8' }]} />
                  <Text style={styles.formSectionLabel}>Additional Photos ({extraPhotos.length}/5)</Text>
                  <Text style={styles.optionalBadgeText}>(Optional)</Text>
                </View>
                <View style={[styles.photoCounterBadge, extraPhotos.length > 0 && styles.photoCounterBadgeActive]}>
                  <Text style={[styles.photoCounterText, extraPhotos.length > 0 && styles.photoCounterTextActive]}>
                    {extraPhotos.length === 0 ? '0 of 5 added' : `${extraPhotos.length} of 5 added`}
                  </Text>
                </View>
              </View>
              <Text style={styles.helpText}>
                Amazon-style swipe gallery ke liye mazeed 5 mukhtalif angles ya pics add karein (Side, Back, Model, Detail view).
              </Text>

              {/* Extra Photos Thumbnails Row */}
              {extraPhotos.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.uploadedPhotosRow}>
                  {extraPhotos.map((url, idx) => (
                    <View key={url + idx} style={styles.photoCardWrap}>
                      <Image source={{ uri: url }} style={styles.photoCardThumb} />
                      <View style={[styles.photoBadge, styles.photoBadgeExtra]}>
                        <Ionicons name="images" size={10} color="#FFFFFF" />
                        <Text style={styles.photoBadgeText}>Angle #{idx + 1}</Text>
                      </View>
                      <View style={styles.photoCardActions}>
                        <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
                          {idx > 0 && (
                            <Pressable
                              style={styles.orderArrowBtn}
                              onPress={() => handleMoveExtraPhoto(idx, 'left')}
                              hitSlop={4}>
                              <Ionicons name="chevron-back" size={12} color="#FFFFFF" />
                            </Pressable>
                          )}
                          {idx < extraPhotos.length - 1 && (
                            <Pressable
                              style={styles.orderArrowBtn}
                              onPress={() => handleMoveExtraPhoto(idx, 'right')}
                              hitSlop={4}>
                              <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
                            </Pressable>
                          )}
                          <Pressable
                            style={styles.removePhotoBtn}
                            onPress={() => handleRemoveExtraPhoto(idx)}
                            hitSlop={4}>
                            <Ionicons name="trash-outline" size={12} color="#FF4D4D" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              {/* Add Extra Photos Controls */}
              {extraPhotos.length < 5 ? (
                <View style={styles.addPhotosContainer}>
                  <Pressable
                    style={styles.addExtraPhotoBox}
                    onPress={handlePickExtraPhotos}
                    disabled={uploadingExtra}>
                    {uploadingExtra ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color="#38BDF8" />
                        <Text style={[styles.uploadDropzoneText, { color: '#38BDF8' }]}>Adding extra angles...</Text>
                      </View>
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={20} color="#38BDF8" />
                        <Text style={styles.addExtraPhotoText}>
                          {extraPhotos.length === 0
                            ? '+ Add Extra Photos from Device (up to 5)'
                            : `+ Add More Angles (${5 - extraPhotos.length} remaining)`}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {/* Direct Extra URL input */}
                  <View style={styles.urlAddRow}>
                    <Ionicons name="link-outline" size={16} color="#64748B" />
                    <TextInput
                      style={styles.urlInput}
                      placeholder="Or paste extra photo URL (https://...)"
                      placeholderTextColor="#64748B"
                      value={extraPhotoInputUrl}
                      onChangeText={setExtraPhotoInputUrl}
                      autoCapitalize="none"
                    />
                    <Pressable
                      style={[styles.addUrlBtn, !extraPhotoInputUrl.trim() && { opacity: 0.5 }, { backgroundColor: '#38BDF8' }]}
                      onPress={handleAddExtraPhotoUrl}
                      disabled={!extraPhotoInputUrl.trim()}>
                      <Ionicons name="add" size={14} color="#090A0E" />
                      <Text style={styles.addUrlBtnText}>Add</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>

            {/* 2. Product Name with AI Generator Trigger */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <View style={styles.labelRow}>
                <View style={styles.greenDot} />
                <Text style={styles.formSectionLabel}>Product Name (Title)</Text>
              </View>
              <Pressable
                style={styles.aiCopywriterBtn}
                onPress={() => setAiModalOpen(true)}>
                <Ionicons name="sparkles" size={13} color="#000000" />
                <Text style={styles.aiCopywriterBtnText}>AI Copywriter</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Slim Fit Dinner Jacket"
              placeholderTextColor="#64748B"
              value={productName}
              onChangeText={setProductName}
            />

            {/* 3. Brand Name */}
            <Text style={styles.formSectionLabel}>Brand Name</Text>
            <TextInput
              style={styles.formInput}
              value={brandNameInput}
              onChangeText={setBrandNameInput}
              editable={false}
            />

            {/* 4. Category Pills */}
            <Text style={styles.formSectionLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryPill,
                      isSelected && styles.categoryPillSelected,
                    ]}
                    onPress={() => setSelectedCategory(cat)}>
                    <Text
                      style={[
                        styles.categoryPillText,
                        isSelected && styles.categoryPillTextSelected,
                      ]}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 5. Pricing & Discounts */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Pricing & Discounts</Text>
            </View>
            <View style={styles.segmentContainer}>
              {(['percentage', 'flat', 'upto'] as const).map((type) => {
                const isSelected = discountType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.segmentTab, isSelected && styles.segmentTabActive]}
                    onPress={() => setDiscountType(type)}>
                    <Text
                      style={[
                        styles.segmentTabText,
                        isSelected && styles.segmentTabTextActive,
                      ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formSubLabel}>Original Price (Rs.)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 10000"
                  placeholderTextColor="#64748B"
                  value={originalPrice}
                  onChangeText={setOriginalPrice}
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.formSubLabel}>Discount (%)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 20"
                  placeholderTextColor="#64748B"
                  value={discountPct}
                  onChangeText={setDiscountPct}
                  keyboardType="numeric"
                />
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                  {DISCOUNT_PRESETS.map((pct) => (
                    <Pressable
                      key={pct}
                      style={[
                        styles.discountPresetChip,
                        discountPct === String(pct) && styles.discountPresetChipActive,
                      ]}
                      onPress={() => setDiscountPct(String(pct))}>
                      <Text
                        style={[
                          styles.discountPresetChipText,
                          discountPct === String(pct) && styles.discountPresetChipTextActive,
                        ]}>
                        {pct}%
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Calculated Discount Price Summary Box */}
            {originalPrice ? (
              <View style={styles.calculatedPriceBox}>
                <View style={styles.calculatedPriceRow}>
                  <Text style={styles.calculatedPriceLabel}>Discounted Price:</Text>
                  <Text style={styles.calculatedPriceValue}>
                    Rs.{' '}
                    {Math.round(
                      (parseFloat(originalPrice) || 0) *
                        (1 - (parseFloat(discountPct) || 0) / 100)
                    ).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.calculatedSavingsLabel}>
                  Shoppers will save Rs.{' '}
                  {Math.round(
                    (parseFloat(originalPrice) || 0) *
                      ((parseFloat(discountPct) || 0) / 100)
                  ).toLocaleString()}
                </Text>
              </View>
            ) : null}

            {/* 6. Post Status (Active / Ended) */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Post Status</Text>
            </View>
            <View style={styles.segmentContainer}>
              <Pressable
                style={[
                  styles.segmentTab,
                  postStatus === 'active' && styles.segmentTabActive,
                ]}
                onPress={() => setPostStatus('active')}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={postStatus === 'active' ? '#090A0E' : '#00FF66'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    postStatus === 'active' && styles.segmentTabTextActive,
                  ]}>
                  Active Deal
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentTab,
                  postStatus === 'expired' && [
                    styles.segmentTabActive,
                    { backgroundColor: '#EF4444' },
                  ],
                ]}
                onPress={() => setPostStatus('expired')}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={postStatus === 'expired' ? '#FFFFFF' : '#EF4444'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    postStatus === 'expired' && [
                      styles.segmentTabTextActive,
                      { color: '#FFFFFF' },
                    ],
                  ]}>
                  Sale Ended
                </Text>
              </Pressable>
            </View>

            {/* 7. Sale Last Date */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Sale Last Date (YYYY-MM-DD)</Text>
            </View>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 2026-10-31"
              placeholderTextColor="#64748B"
              value={saleLastDate}
              onChangeText={setSaleLastDate}
            />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              {[
                { label: '+7 Days', days: 7 },
                { label: '+14 Days', days: 14 },
                { label: '+30 Days', days: 30 },
              ].map((preset) => (
                <Pressable
                  key={preset.label}
                  style={styles.datePresetBtn}
                  onPress={() => {
                    const d = new Date(Date.now() + preset.days * 86400000);
                    setSaleLastDate(d.toISOString().split('T')[0]);
                  }}>
                  <Text style={styles.datePresetText}>{preset.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* 8. Deal Type (Matches User Filter) */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Deal Type (User Preference Match)</Text>
            </View>
            <View style={styles.segmentContainer}>
              <Pressable
                style={[
                  styles.segmentTab,
                  dealType === 'online' && styles.segmentTabActive,
                ]}
                onPress={() => setDealType('online')}>
                <Ionicons
                  name="globe-outline"
                  size={15}
                  color={dealType === 'online' ? '#090A0E' : '#00FF66'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    dealType === 'online' && styles.segmentTabTextActive,
                  ]}>
                  Online Only
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentTab,
                  dealType === 'in_store' && styles.segmentTabActive,
                ]}
                onPress={() => setDealType('in_store')}>
                <Ionicons
                  name="storefront-outline"
                  size={15}
                  color={dealType === 'in_store' ? '#090A0E' : '#00FF66'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    dealType === 'in_store' && styles.segmentTabTextActive,
                  ]}>
                  In-Store Outlets
                </Text>
              </Pressable>
            </View>
            <Text style={styles.helpText}>
              {dealType === 'online'
                ? 'User portal me "Online Only" filter karne walay shoppers ko show hogi.'
                : 'User portal me "In-Store Outlets" filter karne walay shoppers ko show hogi.'}
            </Text>

            {/* 9. City Location (Matches User Filter) */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>City Location (User Preference Match)</Text>
            </View>
            <View style={styles.cityChipsGrid}>
              {TARGET_PAKISTAN_CITIES.map((c) => {
                const isSelected = selectedCity === c;
                return (
                  <Pressable
                    key={c}
                    style={[
                      styles.cityChip,
                      isSelected && styles.cityChipActive,
                    ]}
                    onPress={() => setSelectedCity(c)}>
                    <Ionicons
                      name="location-sharp"
                      size={13}
                      color={isSelected ? '#090A0E' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.cityChipText,
                        isSelected && styles.cityChipTextActive,
                      ]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.helpText}>
              Shopper jab apne shahar ka filter select kare ga to ossay yeh post priority se dikhe gi ("All Pakistan" deals sab ko show hoti hain).
            </Text>

            {/* 9. Item Buy Page Link (Website URL) */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Item Buy Page Link (Website URL)</Text>
            </View>
            <Text style={styles.helpText}>
              Brand website par is item ke buy page ka direct link dalein taake user asani se website par ja kar buy kar sakay:
            </Text>
            <View style={[styles.urlInputRow, { marginTop: 6, marginBottom: 4 }]}>
              <Ionicons name="link-outline" size={16} color="#00FF66" />
              <TextInput
                style={styles.urlInput}
                placeholder="e.g. https://yourbrand.com/products/item-buy-page"
                placeholderTextColor="#64748B"
                value={buyUrl}
                onChangeText={setBuyUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {buyUrl ? (
                <Pressable
                  onPress={() => {
                    let testUrl = buyUrl.trim();
                    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
                      testUrl = `https://${testUrl}`;
                    }
                    Linking.openURL(testUrl).catch(() => {
                      toast.show('Could not open preview link', 'error');
                    });
                  }}
                  hitSlop={6}
                  style={styles.testLinkBtn}>
                  <Ionicons name="open-outline" size={13} color="#00FF66" />
                  <Text style={styles.testLinkText}>Test Link</Text>
                </Pressable>
              ) : null}
            </View>

            {/* 10. Deal Details & Description */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Deal Details & Description</Text>
            </View>
            <TextInput
              style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Describe the product details, fabric, valid branches, terms..."
              placeholderTextColor="#64748B"
              value={dealDescription}
              onChangeText={setDealDescription}
              multiline
            />

            {/* Publish / Update Post Button */}
            <Pressable
              style={[
                styles.publishBtn,
                editingPost && { backgroundColor: '#38BDF8' },
              ]}
              onPress={handlePublishPost}
              disabled={publishing}>
              {publishing ? (
                <ActivityIndicator color="#090A0E" />
              ) : (
                <>
                  <Ionicons
                    name={editingPost ? 'save-outline' : 'rocket-outline'}
                    size={18}
                    color="#090A0E"
                  />
                  <Text style={styles.publishBtnText}>
                    {editingPost ? 'UPDATE POST & SAVE' : 'PUBLISH POST'}
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ─── GEMINI AI COPYWRITER MODAL ─── */}
      <Modal visible={aiModalOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.aiModalOverlay}>
          <View style={styles.aiModalCard}>
            <View style={styles.aiModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.aiSparkleBox}>
                  <Ionicons name="sparkles" size={18} color="#00FF66" />
                </View>
                <View>
                  <Text style={styles.aiModalTitle}>Gemini AI Copywriter</Text>
                  <Text style={styles.aiModalSub}>Generate viral titles & descriptions</Text>
                </View>
              </View>
              <Pressable onPress={() => setAiModalOpen(false)} hitSlop={8}>
                <Ionicons name="close-circle" size={24} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing[4], gap: spacing[3] }} showsVerticalScrollIndicator={false}>
              {/* Marketing Tone */}
              <Text style={styles.aiSectionLabel}>Marketing Tone</Text>
              <View style={styles.aiToneRow}>
                {(['exciting', 'luxury', 'urgent', 'casual'] as CopyTone[]).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.aiTonePill, aiTone === t && styles.aiTonePillActive]}
                    onPress={() => setAiTone(t)}>
                    <Text style={[styles.aiTonePillText, aiTone === t && styles.aiTonePillTextActive]}>
                      {t === 'exciting' ? '🔥 Exciting' : t === 'luxury' ? '✨ Luxury' : t === 'urgent' ? '⏰ Urgent' : '💬 Casual'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Language Switcher */}
              <Text style={styles.aiSectionLabel}>Copy Language</Text>
              <View style={styles.aiToneRow}>
                {[
                  { id: 'english', label: '🇬🇧 English' },
                  { id: 'roman_urdu', label: '🇵🇰 Roman Urdu' },
                ].map((l) => (
                  <Pressable
                    key={l.id}
                    style={[styles.aiTonePill, aiLanguage === l.id && styles.aiTonePillActive]}
                    onPress={() => setAiLanguage(l.id as CopyLanguage)}>
                    <Text style={[styles.aiTonePillText, aiLanguage === l.id && styles.aiTonePillTextActive]}>
                      {l.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Generate Button */}
              <Pressable
                style={styles.aiGenerateActionBtn}
                onPress={handleGenerateAi}
                disabled={aiGenerating}>
                {aiGenerating ? (
                  <ActivityIndicator size="small" color="#090A0E" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#090A0E" />
                    <Text style={styles.aiGenerateActionBtnText}>Generate with Google Gemini</Text>
                  </>
                )}
              </Pressable>

              {/* Generated Titles */}
              {aiResults && (
                <View style={{ gap: spacing[3], marginTop: spacing[1] }}>
                  <Text style={styles.aiSectionLabel}>Suggested Headlines (Tap to Apply):</Text>
                  {aiResults.titles.map((t, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.aiResultItem}
                      onPress={() => {
                        setProductName(t);
                        toast.show('Applied as Product Name! 🎯', 'success');
                      }}>
                      <Text style={styles.aiResultTitle}>{t}</Text>
                      <View style={styles.aiApplyBadge}>
                        <Text style={styles.aiApplyBadgeText}>Apply</Text>
                      </View>
                    </Pressable>
                  ))}

                  <Text style={styles.aiSectionLabel}>Suggested Descriptions (Tap to Apply):</Text>
                  {aiResults.descriptions.map((d, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.aiResultItem}
                      onPress={() => {
                        setDealDescription(d);
                        toast.show('Applied as Deal Description! 📝', 'success');
                      }}>
                      <Text style={styles.aiResultDesc}>{d}</Text>
                      <View style={styles.aiApplyBadge}>
                        <Text style={styles.aiApplyBadgeText}>Apply</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ─── REAL POST INSIGHTS DRAWER ─── */}
      <PostInsightsDrawer
        deal={insightsDeal}
        visible={Boolean(insightsDeal)}
        onClose={() => setInsightsDeal(null)}
        onExtend={handleQuickExtend}
        onTogglePause={(id) => {
          const d = deals.find((deal) => deal.id === id);
          if (d) handleTogglePause(d);
        }}
        onDuplicate={handleDuplicate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    backgroundColor: '#090A0E',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDropdown: {
    backgroundColor: '#141721',
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#202432',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dropdownText: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#1C202E',
  },
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    backgroundColor: '#090A0E',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
  },
  filterTabActive: {
    backgroundColor: '#16281D',
    borderColor: '#00FF66',
  },
  filterTabText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  filterTabTextActive: {
    color: '#00FF66',
    fontWeight: '800',
  },
  tabDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00FF66',
  },
  tabDotExpired: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  extendDealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
  },
  extendDealBtnText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
  cityChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: 6,
    marginBottom: 4,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  cityChipActive: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  cityChipText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  cityChipTextActive: {
    color: '#090A0E',
    fontWeight: '900',
  },
  discountPresetChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
  },
  discountPresetChipActive: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  discountPresetChipText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  discountPresetChipTextActive: {
    color: '#090A0E',
    fontWeight: '900',
  },
  preferenceTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  prefTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  prefTagText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#00FF66',
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#00FF66',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    borderRadius: radii.lg,
  },
  selectionBannerEdit: {
    backgroundColor: '#0B1526',
    borderColor: '#38BDF8',
  },
  selectionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  selectionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#12251A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIconBoxEdit: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  selectionBannerTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '800',
    color: '#00FF66',
  },
  selectionBannerSubtitle: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  selectionBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectAllText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#00FF66',
  },
  cancelSelectionBtn: {
    backgroundColor: '#141721',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#202432',
  },
  cancelSelectionText: {
    ...typography.caption,
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: 90,
    gap: spacing[4],
  },
  postCard: {
    backgroundColor: '#141721',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#202432',
    overflow: 'hidden',
  },
  postCardSelected: {
    borderColor: '#00FF66',
    borderWidth: 2,
  },
  postCardEditMode: {
    borderColor: '#38BDF8',
    borderWidth: 2,
    backgroundColor: '#0D1524',
  },
  editModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#38BDF8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  editModeBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '900',
    color: '#090A0E',
    letterSpacing: 0.5,
  },
  editCardActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#38BDF8',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editCardActionText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '900',
    color: '#090A0E',
    letterSpacing: 0.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    gap: spacing[3],
  },
  brandAvatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#00FF66',
    backgroundColor: '#12251A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...typography.caption,
    fontSize: 15,
    fontWeight: '800',
    color: '#00FF66',
  },
  cardBrandName: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardBrandHandle: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
  },
  cardTimestamp: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
    backgroundColor: '#0D1018',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  saleEndedOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 10, 14, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saleEndedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saleEndedText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '900',
    color: '#FF4D4D',
    letterSpacing: 1,
  },
  cardBody: {
    padding: spacing[3],
    gap: spacing[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  postTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginLeft: spacing[2],
  },
  statusBadgeActive: {
    backgroundColor: '#12251A',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  statusBadgePaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  statusBadgeEnded: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  pinnedRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#00FF66',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pinnedRibbonText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '900',
    color: '#090A0E',
    letterSpacing: 0.8,
  },
  timerMediaOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
  },
  cardQuickActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
  },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F121C',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
  quickActionChipPinned: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  quickActionChipPaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  quickActionChipText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  quickActionChipTextPinned: {
    color: '#090A0E',
    fontWeight: '900',
  },
  insightsActionChip: {
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
    borderColor: 'rgba(0, 255, 102, 0.3)',
    marginLeft: 'auto',
  },
  statusBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  postDescription: {
    ...typography.body,
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginTop: 2,
  },
  postPriceText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
    textDecorationLine: 'line-through',
    marginTop: 4,
  },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginTop: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
  },
  interactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  interactionCount: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedDialBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 10, 14, 0.72)',
    zIndex: 90,
  },
  speedDialMenu: {
    position: 'absolute',
    bottom: spacing[4] + 62,
    right: spacing[4],
    alignItems: 'flex-end',
    gap: 12,
    zIndex: 95,
  },
  speedDialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  speedDialLabelContainer: {
    backgroundColor: '#141721',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#202432',
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.35)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
  },
  speedDialLabelText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  speedDialIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 3px 6px rgba(0,0,0,0.35)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 6,
      },
    }),
  },
  fabBtn: {
    position: 'absolute',
    bottom: spacing[4],
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 4px 10px rgba(0,255,102,0.45)' },
      default: {
        shadowColor: '#00FF66',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
        elevation: 8,
      },
    }),
    zIndex: 100,
  },
  fabBtnOpen: {
    backgroundColor: '#202432',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    ...Platform.select({
      web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.45)' },
      default: {
        shadowColor: '#000',
      },
    }),
  },
  selectionBottomBar: {
    position: 'absolute',
    bottom: spacing[4],
    left: spacing[4],
    right: spacing[4],
  },
  createModalOverlay: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  createModalHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#1A1E2B',
  },
  closeModalBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModalTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  createModalForm: {
    padding: spacing[4],
    gap: spacing[3],
  },
  formSectionLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing[2],
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF66',
  },
  uploadDropzone: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    borderStyle: 'dashed',
    backgroundColor: '#0D1018',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  uploadIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  uploadDropzoneTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  uploadDropzoneText: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 10, 14, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadingText: {
    ...typography.caption,
    fontSize: 12,
    color: '#00FF66',
    fontWeight: '700',
  },
  sectionCardBox: {
    backgroundColor: '#0D1018',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#1E2333',
    padding: spacing[3],
    gap: spacing[2],
  },
  requiredStar: {
    color: '#FF4D4D',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 2,
  },
  compulsoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  compulsoryBadgePending: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  compulsoryBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#00FF66',
    letterSpacing: 0.3,
  },
  optionalBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginLeft: 4,
  },
  coverPreviewCard: {
    width: '100%',
    height: 180,
    borderRadius: radii.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#00FF66',
    backgroundColor: '#090A0E',
  },
  coverPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPhotoTopBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00FF66',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  coverPhotoTopBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '900',
    color: '#090A0E',
    letterSpacing: 0.5,
  },
  coverActionButtons: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  changeCoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 10, 14, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.4)',
  },
  changeCoverText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#00FF66',
  },
  removeCoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 10, 14, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  removeCoverText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#FF4D4D',
  },
  emptyCoverContainer: {
    gap: 8,
  },
  coverDropzone: {
    height: 110,
    borderColor: 'rgba(0, 255, 102, 0.4)',
  },
  addExtraPhotoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  addExtraPhotoText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  photosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  photoCounterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#141721',
  },
  photoCounterBadgeActive: {
    borderColor: 'rgba(0, 255, 102, 0.4)',
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
  },
  photoCounterText: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  photoCounterTextActive: {
    color: '#00FF66',
  },
  uploadedPhotosRow: {
    gap: 12,
    paddingVertical: 4,
  },
  photoCardWrap: {
    width: 140,
    borderRadius: 12,
    backgroundColor: '#141721',
    borderWidth: 1.5,
    borderColor: '#202432',
    overflow: 'hidden',
    position: 'relative',
  },
  photoCardCoverWrap: {
    borderColor: '#00FF66',
    backgroundColor: '#0D1A12',
  },
  photoCardThumb: {
    width: '100%',
    height: 110,
    backgroundColor: '#0A0C12',
    resizeMode: 'cover',
  },
  photoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  photoBadgeCover: {
    backgroundColor: '#00FF66',
  },
  photoBadgeExtra: {
    backgroundColor: 'rgba(9, 10, 14, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  photoCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    backgroundColor: '#141721',
    borderTopWidth: 1,
    borderTopColor: '#202432',
  },
  makeCoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  makeCoverText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#00FF66',
  },
  orderArrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#202432',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotosContainer: {
    gap: 10,
    marginTop: 4,
  },
  urlAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  addUrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00FF66',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addUrlBtnText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#090A0E',
  },
  formInput: {
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    color: '#FFFFFF',
    fontSize: 14,
  },
  formSubLabel: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
  },
  categoryPillSelected: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  categoryPillText: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  categoryPillTextSelected: {
    color: '#090A0E',
    fontWeight: '800',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: '#202432',
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  segmentTabActive: {
    backgroundColor: '#00FF66',
  },
  segmentTabText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  segmentTabTextActive: {
    color: '#090A0E',
    fontWeight: '800',
  },
  helpText: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginTop: -4,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00FF66',
    borderRadius: radii.xl,
    paddingVertical: 14,
    marginTop: spacing[4],
  },
  publishBtnText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '900',
    color: '#090A0E',
    letterSpacing: 0.5,
  },
  imagePreviewWrap: {
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0D1018',
    borderWidth: 1,
    borderColor: '#202432',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  clearImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 10, 14, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202432',
  },
  clearImageText: {
    ...typography.caption,
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    gap: 8,
  },
  urlInput: {
    flex: 1,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
  },
  presetThumb: {
    width: 76,
    borderRadius: 8,
    backgroundColor: '#141721',
    borderWidth: 1.5,
    borderColor: '#202432',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 4,
  },
  presetThumbSelected: {
    borderColor: '#00FF66',
  },
  presetThumbImg: {
    width: '100%',
    height: 50,
  },
  presetThumbLabel: {
    ...typography.caption,
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  presetThumbLabelSelected: {
    color: '#00FF66',
    fontWeight: '800',
  },
  calculatedPriceBox: {
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    borderRadius: radii.md,
    padding: 10,
    gap: 2,
  },
  calculatedPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calculatedPriceLabel: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  calculatedPriceValue: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '900',
    color: '#00FF66',
  },
  calculatedSavingsLabel: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
  },
  datePresetBtn: {
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  datePresetText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '700',
  },
  testLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.35)',
  },
  testLinkText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '700',
  },
  postLinkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.22)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  postLinkText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '600',
    flexShrink: 1,
  },
  aiCopywriterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00FF66',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  aiCopywriterBtnText: {
    color: '#090A0E',
    fontWeight: '800',
    fontSize: 11,
  },
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  aiModalCard: {
    backgroundColor: '#0F121A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#202432',
    maxHeight: '88%',
  },
  aiModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderColor: '#1C202E',
  },
  aiSparkleBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  aiModalTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  aiModalSub: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
  },
  aiSectionLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  aiToneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiTonePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#222838',
  },
  aiTonePillActive: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  aiTonePillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  aiTonePillTextActive: {
    color: '#090A0E',
    fontWeight: '800',
  },
  aiGenerateActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00FF66',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: spacing[2],
  },
  aiGenerateActionBtnText: {
    color: '#090A0E',
    fontWeight: '800',
    fontSize: 14,
  },
  aiResultItem: {
    backgroundColor: '#141721',
    borderRadius: 12,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiResultTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  aiResultDesc: {
    ...typography.body,
    fontSize: 12,
    color: '#CBD5E1',
    flex: 1,
    lineHeight: 18,
  },
  aiApplyBadge: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderColor: '#00FF66',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  aiApplyBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '800',
    color: '#00FF66',
  },
});
