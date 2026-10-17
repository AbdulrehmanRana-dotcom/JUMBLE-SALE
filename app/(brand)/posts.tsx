import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
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
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { getDealInteractions } from '@/lib/activityStore';
import { getLocalBrands } from '@/lib/brandStore';
import { deleteLocalDeal, getLocalBrandDeals, saveLocalDeal } from '@/lib/dealStore';
import { generateBrandPromoCopy, type CopyLanguage, type CopyTone } from '@/lib/gemini';
import { compressAndUploadDealImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';
import type { Brand, Deal } from '@/types/database.types';

const CATEGORIES = [
  'Fashion',
  'Shoes',
  'Electronics',
  'Beauty',
  'Accessories',
  'Food',
];

const PRESET_IMAGES = [
  {
    label: 'Lawn Suit',
    url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80',
  },
  {
    label: 'Dinner Suit',
    url: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=1000&q=80',
  },
  {
    label: 'Casual Shirt',
    url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&q=80',
  },
  {
    label: 'Footwear',
    url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1000&q=80',
  },
  {
    label: 'Watch',
    url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1000&q=80',
  },
  {
    label: 'Accessories',
    url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1000&q=80',
  },
];

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

  // Selection Mode State (Delete or Edit selection mode)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);

  // Modal State for Create / Edit Form
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Deal | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Form Fields matching Screenshot 2
  const [productName, setProductName] = useState('');
  const [brandNameInput, setBrandNameInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Fashion');
  const [saleLastDate, setSaleLastDate] = useState('2026-10-31');
  const [storeAvailability, setStoreAvailability] = useState<'in_store' | 'physical'>('in_store');
  const [discountType, setDiscountType] = useState<'flat' | 'upto' | 'percentage'>('percentage');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [postStatus, setPostStatus] = useState<'active' | 'expired'>('active');
  const [buyUrl, setBuyUrl] = useState('');

  // Gemini AI Copywriter State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTone, setAiTone] = useState<CopyTone>('exciting');
  const [aiLanguage, setAiLanguage] = useState<CopyLanguage>('english');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResults, setAiResults] = useState<{ titles: string[]; descriptions: string[] } | null>(null);

  // 1. Fetch Brand Profile
  const { data: brand, refetch: refetchBrand } = useQuery<Brand | null>({
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
      try {
        if (!user?.id) return localMatch || authBrand;
        const { data } = await supabase
          .from('brands')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle();
        return (data as unknown as Brand) ?? localMatch ?? authBrand;
      } catch {
        return localMatch || authBrand;
      }
    },
  });

  const activeBrandId =
    (brand?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brand.id) ? brand.id : null) ||
    (authBrand?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authBrand.id) ? authBrand.id : null) ||
    'b1111111-1111-1111-1111-111111111111';

  // 2. Fetch Real Posts from Database / Local Store
  const {
    data: deals = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Deal[]>({
    queryKey: ['brand-deals-posts', activeBrandId],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals(activeBrandId);
      try {
        if (!activeBrandId) return localDeals;
        const { data, error } = await (supabase.from('deals') as any)
          .select('*, brand:brands(*)')
          .eq('brand_id', activeBrandId)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[posts] Supabase fetch notice:', error.message);
          return localDeals;
        }

        const serverDeals = (data as Deal[]) ?? [];
        if (serverDeals.length > 0) {
          for (const sd of serverDeals) {
            await saveLocalDeal(sd);
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
  });

  const dealIdsKey = deals.map((d) => d.id).sort().join(',');

  const { data: postStats = {}, refetch: refetchStats } = useQuery<
    Record<string, { likes: number; comments: number; shares: number }>
  >({
    queryKey: ['brand-post-stats', dealIdsKey],
    queryFn: async () => {
      const statsMap: Record<string, { likes: number; comments: number; shares: number }> = {};
      for (const d of deals) {
        statsMap[d.id] = await getDealInteractions(d.id);
      }
      return statsMap;
    },
    enabled: deals.length > 0,
  });

  useFocusEffect(
    useCallback(() => {
      refetchBrand();
      refetch();
      refetchStats();
    }, [refetchBrand, refetch, refetchStats])
  );

  // Exclusively show real deals (NO dummy/mock posts)
  const displayPosts = useMemo(() => {
    return deals;
  }, [deals]);

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
      refetch();
    },
    onError: (err: any) => {
      toast.show(err.message || 'Failed to delete posts', 'error');
    },
  });

  // Single Post Delete with Confirmation
  const handleDeleteSingle = (post: Deal) => {
    Alert.alert(
      'Delete Post',
      `Are you sure you want to delete "${post.title}"? This will remove it from the database.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
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
              refetch();
            } catch (err: any) {
              toast.show(err.message || 'Failed to delete post', 'error');
            }
          },
        },
      ]
    );
  };

  // Open Create / Edit Modal
  const handleOpenCreateModal = (postToEdit?: Deal) => {
    setSelectionMode('none');
    if (postToEdit) {
      setEditingPost(postToEdit);
      setProductName(postToEdit.title);
      setBrandNameInput(brandDisplayName);
      setSelectedCategory(postToEdit.brand?.category || 'Fashion');
      setSaleLastDate(
        postToEdit.end_date ? postToEdit.end_date.split('T')[0] : '2026-10-31'
      );
      setStoreAvailability(postToEdit.deal_type === 'online' ? 'in_store' : 'physical');
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
      setImageUrl(postToEdit.image_urls?.[0] || '');
      setPostStatus(postToEdit.status === 'expired' ? 'expired' : 'active');
      setBuyUrl(postToEdit.buy_url || (postToEdit as any).website_url || '');
    } else {
      setEditingPost(null);
      setProductName('');
      setBrandNameInput(brandDisplayName);
      setSelectedCategory('Fashion');
      setSaleLastDate('2026-10-31');
      setStoreAvailability('in_store');
      setDiscountType('percentage');
      setOriginalPrice('');
      setDiscountPct('20');
      setDealDescription('');
      setImageUrl('');
      setPostStatus('active');
      setBuyUrl('');
    }
    setCreateModalOpen(true);
  };

  // Pick Image from Device Gallery with Permission Request
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Gallery Permission Required',
          'Please allow access to your photos/gallery in device settings to select and upload product images.',
          [{ text: 'OK' }]
        );
        toast.show('Please grant gallery permission in settings', 'warning');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedAsset = result.assets[0];
        setUploadingImage(true);
        // Instant visual feedback with local URI
        setImageUrl(pickedAsset.uri);

        try {
          if (activeBrandId) {
            const uploadedUrl = await compressAndUploadDealImage(activeBrandId, pickedAsset.uri);
            if (uploadedUrl) {
              setImageUrl(uploadedUrl);
            }
          }
        } catch (uploadErr) {
          console.warn('[Posts] Supabase storage upload fallback:', uploadErr);
        }
        toast.show('Photo selected from gallery! 📸', 'success');
      }
    } catch (err: any) {
      toast.show(err.message || 'Could not open gallery', 'error');
    } finally {
      setUploadingImage(false);
    }
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

    const origPriceNum = parseFloat(originalPrice) || 10000;
    const pctNum = parseFloat(discountPct) || 20;
    const calcDiscountPrice = Math.round(origPriceNum * (1 - pctNum / 100));

    setPublishing(true);
    try {
      const isUUID = (val?: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');

      const CATEGORY_MAP: Record<string, string> = {
        Fashion: '11111111-1111-1111-1111-111111111111',
        Shoes: '77777777-7777-7777-7777-777777777777',
        Electronics: '22222222-2222-2222-2222-222222222222',
        Beauty: '55555555-5555-5555-5555-555555555555',
        Accessories: '77777777-7777-7777-7777-777777777777',
        Food: '33333333-3333-3333-3333-333333333333',
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
        end_date: saleLastDate ? new Date(saleLastDate).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
        deal_type: storeAvailability === 'in_store' ? 'online' : 'in_store',
        image_urls: [
          imageUrl ||
            'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80',
        ],
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
        deal_type: payload.deal_type,
        image_urls: payload.image_urls,
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

      {/* ─── POSTS FEED LIST ─── */}
      {isLoading ? (
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
              title="No Promotions Posted"
              description="No promotions found in your brand account. Tap 'Create New Post' from the top right menu to publish an offer."
              icon="documents-outline"
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedPostIds.includes(item.id);
            const isEnded = item.status === 'expired';
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

                  {/* SALE ENDED Translucent Overlay (Screenshot 1) */}
                  {isEnded && (
                    <View style={styles.saleEndedOverlay}>
                      <View style={styles.saleEndedBadge}>
                        <Ionicons name="time-outline" size={14} color="#EF4444" />
                        <Text style={styles.saleEndedText}>SALE ENDED</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* 3. Post Details Body */}
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.postTitle}>{item.title}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isEnded ? styles.statusBadgeEnded : styles.statusBadgeActive,
                      ]}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isEnded ? { color: '#EF4444' } : { color: '#00FF66' },
                        ]}>
                        {isEnded ? 'ENDED' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.postDescription} numberOfLines={2}>
                    {item.description}
                  </Text>

                  {/* Price Row with Strikethrough */}
                  <Text style={styles.postPriceText}>{origPriceFormatted}</Text>

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
            {/* 1. Product Image with Live Preview + URL input + Presets */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Product Image (Pic)</Text>
            </View>

            {imageUrl ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
                {uploadingImage && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#00FF66" />
                    <Text style={styles.uploadingText}>Saving photo...</Text>
                  </View>
                )}
                <View style={styles.imageActionButtons}>
                  <Pressable
                    style={styles.changeImageBtn}
                    onPress={handlePickImage}
                    disabled={uploadingImage}>
                    <Ionicons name="images-outline" size={14} color="#00FF66" />
                    <Text style={styles.changeImageText}>Gallery</Text>
                  </Pressable>
                  <Pressable
                    style={styles.clearImageBtn}
                    onPress={() => setImageUrl('')}>
                    <Ionicons name="close-circle" size={14} color="#FF4D4D" />
                    <Text style={styles.clearImageText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.uploadDropzone}
                onPress={handlePickImage}
                disabled={uploadingImage}>
                {uploadingImage ? (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#00FF66" />
                    <Text style={styles.uploadDropzoneText}>Opening gallery...</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.uploadIconBadge}>
                      <Ionicons name="images" size={24} color="#00FF66" />
                    </View>
                    <Text style={styles.uploadDropzoneTitle}>Tap to pick from device gallery</Text>
                    <Text style={styles.uploadDropzoneText}>Tap here to select product picture from your phone</Text>
                  </>
                )}
              </Pressable>
            )}

            {/* Custom Image URL TextInput */}
            <View style={styles.urlInputRow}>
              <Ionicons name="image-outline" size={16} color="#64748B" />
              <TextInput
                style={styles.urlInput}
                placeholder="Or paste direct image URL (https://...)"
                placeholderTextColor="#64748B"
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
              />
            </View>

            {/* Quick Preset Images Selector */}
            <Text style={styles.formSubLabel}>Or choose from preset product images:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {PRESET_IMAGES.map((img, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.presetThumb,
                    imageUrl === img.url && styles.presetThumbSelected,
                  ]}
                  onPress={() => setImageUrl(img.url)}>
                  <Image source={{ uri: img.url }} style={styles.presetThumbImg} />
                  <Text
                    style={[
                      styles.presetThumbLabel,
                      imageUrl === img.url && styles.presetThumbLabelSelected,
                    ]}
                    numberOfLines={1}>
                    {img.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

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

            {/* 8. Store Availability */}
            <View style={styles.labelRow}>
              <View style={styles.greenDot} />
              <Text style={styles.formSectionLabel}>Store Availability</Text>
            </View>
            <View style={styles.segmentContainer}>
              <Pressable
                style={[
                  styles.segmentTab,
                  storeAvailability === 'in_store' && styles.segmentTabActive,
                ]}
                onPress={() => setStoreAvailability('in_store')}>
                <Ionicons
                  name="storefront-outline"
                  size={14}
                  color={storeAvailability === 'in_store' ? '#090A0E' : '#64748B'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    storeAvailability === 'in_store' && styles.segmentTabTextActive,
                  ]}>
                  In-Store
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentTab,
                  storeAvailability === 'physical' && styles.segmentTabActive,
                ]}
                onPress={() => setStoreAvailability('physical')}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={storeAvailability === 'physical' ? '#090A0E' : '#64748B'}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    storeAvailability === 'physical' && styles.segmentTabTextActive,
                  ]}>
                  Physical
                </Text>
              </Pressable>
            </View>
            <Text style={styles.helpText}>Product available for online ordering & physical stores</Text>

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
  statusBadgeEnded: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
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
    shadowColor: '#00FF66',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  fabBtnOpen: {
    backgroundColor: '#202432',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
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
  imageActionButtons: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 10, 14, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.4)',
  },
  changeImageText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '700',
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
