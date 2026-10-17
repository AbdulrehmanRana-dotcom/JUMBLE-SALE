import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { getLocalBrandDeals, saveLocalDeal } from '@/lib/dealStore';
import { generateBrandPromoCopy } from '@/lib/gemini';
import { compressAndUploadDealImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Category, Deal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

const PAKISTANI_CITIES = [
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
];

const dealSchema = z
  .object({
    title: z.string().min(5, 'Title must be at least 5 characters'),
    description: z
      .string()
      .min(10, 'Description must be at least 10 characters'),
    discount_pct: z
      .string()
      .min(1, 'Discount percentage is required')
      .refine((v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n >= 0.01 && n <= 100;
      }, 'Discount must be between 0.01% and 100%'),
    category_id: z.string().min(1, 'Category is required'),
    deal_type: z.enum(['online', 'in_store']),
    city: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    terms: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.deal_type === 'in_store' && (!data.city || !data.city.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'City is required for in-store promotions',
        path: ['city'],
      });
    }

    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End date must be after the start date',
          path: ['end_date'],
        });
      }
    }
  });

type DealFormData = z.infer<typeof dealSchema>;

export default function CreateOrEditDealScreen() {
  const router = useRouter();
  const { dealId } = useLocalSearchParams<{ dealId?: string }>();
  const { brand } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [lastSavedDraftAt, setLastSavedDraftAt] = useState<string | null>(null);
  const [currentDealId, setCurrentDealId] = useState<string | null>(
    dealId || null
  );
  const [originalDeal, setOriginalDeal] = useState<Deal | null>(null);

  // Default dates: start today, end 30 days later
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: '',
      description: '',
      discount_pct: '',
      category_id: '',
      deal_type: 'online',
      city: '',
      start_date: todayStr,
      end_date: thirtyDaysLater,
      terms: '',
    },
  });

  const watchedType = watch('deal_type');
  const watchedCategory = watch('category_id');
  const watchedCity = watch('city');
  const watchedTitle = watch('title');
  const watchedDiscount = watch('discount_pct');

  // AI Copy Generator State
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [aiTone, setAiTone] = useState<'exciting' | 'luxury' | 'urgent' | 'casual'>('exciting');
  const [aiLanguage, setAiLanguage] = useState<'english' | 'roman_urdu'>('english');
  const [aiCopyResults, setAiCopyResults] = useState<{ titles: string[]; descriptions: string[] } | null>(null);

  const handleGenerateAiCopy = async () => {
    const currentCategory = categories.find((c) => c.id === watchedCategory)?.name || 'Retail Product';
    const currentTitle = watchedTitle?.trim();
    const currentDiscount = watchedDiscount ? parseFloat(watchedDiscount) : 40;

    setGeneratingCopy(true);
    try {
      const res = await generateBrandPromoCopy({
        product_or_category: currentTitle || currentCategory,
        brand_name: brand?.name || 'Official Brand',
        discount_pct: currentDiscount,
        tone: aiTone,
        language: aiLanguage,
      });

      setAiCopyResults({
        titles: res.titles,
        descriptions: res.descriptions,
      });
      toast.show('Gemini AI promotional headlines generated! ✨', 'success');
    } catch (err: any) {
      toast.show(err.message || 'AI copy generation error', 'error');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const applyAiTitle = (title: string) => {
    setValue('title', title, { shouldValidate: true, shouldDirty: true });
    toast.show('Headline updated! You can edit it below.', 'success');
  };

  const applyAiDescription = (desc: string) => {
    setValue('description', desc, { shouldValidate: true, shouldDirty: true });
    toast.show('Description updated! You can edit it below.', 'success');
  };

  // 1. Fetch Categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch Existing Deal if Editing
  useEffect(() => {
    if (!dealId) return;

    async function loadDeal() {
      try {
        // 1. Try local deal store first
        const localDeals = await getLocalBrandDeals();
        const localMatch = localDeals.find((d) => d.id === dealId);
        if (localMatch) {
          setOriginalDeal(localMatch);
          setCurrentDealId(localMatch.id);
          setImageUrls(localMatch.image_urls || []);
          reset({
            title: localMatch.title,
            description: localMatch.description,
            discount_pct: localMatch.discount_pct ? String(localMatch.discount_pct) : '',
            category_id: localMatch.category_id || '',
            deal_type: localMatch.deal_type,
            city: localMatch.city || '',
            start_date: localMatch.start_date ? localMatch.start_date.split('T')[0] : todayStr,
            end_date: localMatch.end_date ? localMatch.end_date.split('T')[0] : thirtyDaysLater,
            terms: localMatch.terms || '',
          });
          return;
        }

        // 2. Try Supabase
        const { data, error } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId as string)
          .maybeSingle();

        if (error) {
          console.warn('[create-deal] Supabase load warning:', error);
          return;
        }

        if (data) {
          const d = data as Deal;
          setOriginalDeal(d);
          setCurrentDealId(d.id);
          setImageUrls(d.image_urls || []);
          reset({
            title: d.title,
            description: d.description,
            discount_pct: d.discount_pct ? String(d.discount_pct) : '',
            category_id: d.category_id || '',
            deal_type: d.deal_type,
            city: d.city || '',
            start_date: d.start_date ? d.start_date.split('T')[0] : todayStr,
            end_date: d.end_date ? d.end_date.split('T')[0] : thirtyDaysLater,
            terms: d.terms || '',
          });
        }
      } catch (err) {
        console.warn('[create-deal] Error loading deal:', err);
      }
    }

    loadDeal();
  }, [dealId, reset, todayStr, thirtyDaysLater]);

  // 3. Auto-Save as Draft Every 30 Seconds
  const autoSaveRef = useRef<() => void>(() => {});

  autoSaveRef.current = async () => {
    if (!brand?.id) return;
    const values = getValues();
    // Only auto-save if user entered a title
    if (!values.title || values.title.trim().length < 3) return;

    try {
      setSavingDraft(true);
      const discountNum = parseFloat(values.discount_pct);
      const payload: any = {
        brand_id: brand.id,
        title: values.title.trim(),
        description: values.description?.trim() || '',
        discount_pct:
          !isNaN(discountNum) && discountNum > 0 ? discountNum : 10.0,
        category_id: values.category_id || null,
        deal_type: values.deal_type,
        city: values.deal_type === 'in_store' ? values.city || null : null,
        start_date: values.start_date
          ? new Date(values.start_date).toISOString()
          : new Date().toISOString(),
        end_date: values.end_date
          ? new Date(values.end_date).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        terms: values.terms?.trim() || null,
        image_urls: imageUrls,
        updated_at: new Date().toISOString(),
      };

      if (currentDealId) {
        // Update existing draft / deal
        const { error } = await (supabase.from('deals') as any)
          .update(payload)
          .eq('id', currentDealId)
          .eq('brand_id', brand.id);
        await saveLocalDeal({ ...payload, id: currentDealId });
        if (!error) {
          const time = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          setLastSavedDraftAt(time);
        }
      } else {
        // Create new draft
        payload.status = 'draft';
        const { data: newRow, error } = await (supabase.from('deals') as any)
          .insert(payload)
          .select('id')
          .maybeSingle();
        const draftId = newRow?.id || `draft-${Date.now()}`;
        setCurrentDealId(draftId);
        await saveLocalDeal({ ...payload, id: draftId });
        if (!error && newRow) {
          const time = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          setLastSavedDraftAt(time);
        }
      }
    } catch (err) {
      console.warn('[AutoSave] draft error:', err);
    } finally {
      setSavingDraft(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      autoSaveRef.current();
    }, 30000); // 30 seconds

    return () => clearInterval(timer);
  }, []);

  // 4. Image Upload & Client-Side Compression (Max 5 images)
  const handlePickImages = async () => {
    if (!brand?.id) return;
    if (imageUrls.length >= 5) {
      toast.show('Maximum 5 images allowed per promotion.', 'warning');
      return;
    }

    try {
      const remainingLimit = 5 - imageUrls.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingLimit,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingImage(true);
        const uploadedUrls: string[] = [];

        for (const asset of result.assets) {
          try {
            const publicUrl = await compressAndUploadDealImage(
              brand.id,
              asset.uri
            );
            uploadedUrls.push(publicUrl);
          } catch (compressErr: any) {
            toast.show(
              compressErr.message || 'Image compression/upload failed',
              'error'
            );
          }
        }

        if (uploadedUrls.length > 0) {
          setImageUrls((prev) => [...prev, ...uploadedUrls].slice(0, 5));
          toast.show(
            `${uploadedUrls.length} image(s) compressed & uploaded!`,
            'success'
          );
        }
      }
    } catch (err: any) {
      toast.show(err.message || 'Failed to select image', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 5. Quick Duration Setter
  const setDurationDays = (days: number) => {
    const startDateVal = watch('start_date') || todayStr;
    const s = new Date(startDateVal);
    if (!isNaN(s.getTime())) {
      const e = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
      setValue('end_date', e.toISOString().split('T')[0], {
        shouldValidate: true,
      });
    }
  };

  // 6. Manual Save as Draft
  const handleManualSaveDraft = async () => {
    const values = getValues();
    if (!values.title || values.title.trim().length < 2) {
      toast.show('Please provide a title to save a draft.', 'warning');
      return;
    }
    await autoSaveRef.current();
    toast.show('Promotion saved as draft! 📝', 'success');
    queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
    router.back();
  };

  // 7. Submit Promotion (Status becomes 'pending')
  const onSubmit = async (data: DealFormData) => {
    if (!brand?.id) {
      toast.show('Brand profile not found.', 'error');
      return;
    }
    if (brand.status !== 'active' || !brand.is_verified) {
      toast.show('Your brand must be approved before publishing deals.', 'error');
      return;
    }

    setLoading(true);
    try {
      const discountVal = parseFloat(data.discount_pct);
      const startIso = new Date(data.start_date).toISOString();
      const endIso = new Date(data.end_date).toISOString();

      const dealPayload: any = {
        brand_id: brand.id,
        category_id: data.category_id,
        title: data.title.trim(),
        description: data.description.trim(),
        discount_pct: discountVal,
        deal_type: data.deal_type,
        city: data.deal_type === 'in_store' ? data.city!.trim() : null,
        start_date: startIso,
        end_date: endIso,
        terms: data.terms?.trim() || null,
        image_urls: imageUrls,
        buy_url: (data as any).buy_url?.trim() || null,
        website_url: (data as any).buy_url?.trim() || null,
        original_price: (data as any).original_price ? parseFloat((data as any).original_price) : null,
        discount_price: (data as any).original_price && discountVal ? Math.round(parseFloat((data as any).original_price) * (1 - discountVal / 100)) : null,
        status: 'pending', // Submitting ALWAYS sends status to 'pending'
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      };

      if (currentDealId) {
        // Updating existing promotion
        const { error } = await (supabase.from('deals') as any)
          .update(dealPayload)
          .eq('id', currentDealId)
          .eq('brand_id', brand.id);

        if (error) {
          console.warn('[SubmitDeal] Supabase update warning:', error);
        }
        await saveLocalDeal({ ...dealPayload, id: currentDealId });

        const isRePending = originalDeal?.status === 'active';
        toast.show(
          isRePending
            ? 'Active deal edited! Sent back for Admin approval.'
            : 'Promotion submitted for Admin approval! 🚀',
          'success'
        );
      } else {
        // Inserting new promotion
        let createdId = `deal-${Date.now()}`;
        try {
          const { data: inserted, error } = await (supabase.from('deals') as any)
            .insert(dealPayload)
            .select('id')
            .maybeSingle();
          if (inserted?.id) {
            createdId = inserted.id;
          }
          if (error) {
            console.warn('[SubmitDeal] Supabase insert warning:', error);
          }
        } catch (dbErr) {
          console.warn('[SubmitDeal] Supabase insert error:', dbErr);
        }

        await saveLocalDeal({ ...dealPayload, id: createdId });
        toast.show(
          'Promotion submitted! Awaiting Admin approval.',
          'success'
        );
      }

      queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-stats'] });
      router.back();
    } catch (err: any) {
      toast.show(err.message || 'Failed to submit promotion', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={dealId ? 'Edit Promotion' : 'Post New Promotion'}
        subtitle={
          originalDeal?.status === 'active'
            ? 'Editing an active promotion will submit it for re-approval'
            : 'Fill in deal details and submit for moderation'
        }
        onBack={() => {
          if (isDirty) {
            Alert.alert(
              'Unsaved Changes',
              'You have unsaved changes. Do you want to save as draft before leaving?',
              [
                { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                { text: 'Save Draft', onPress: handleManualSaveDraft },
                { text: 'Keep Editing', style: 'cancel' },
              ]
            );
          } else {
            router.back();
          }
        }}
        rightAction={
          <Pressable onPress={handleManualSaveDraft} hitSlop={8}>
            <Text style={styles.saveDraftBtnText}>Save Draft</Text>
          </Pressable>
        }
      />

      {/* Auto-save notification banner */}
      {(lastSavedDraftAt || savingDraft) && (
        <View style={styles.draftBar}>
          <Ionicons
            name={savingDraft ? 'sync-outline' : 'cloud-done-outline'}
            size={14}
            color={colors.textSecondary}
          />
          <Text style={styles.draftText}>
            {savingDraft
              ? 'Auto-saving draft...'
              : `Draft auto-saved at ${lastSavedDraftAt}`}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Card 1: Deal Type & Essentials */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Deal Type & Title</Text>

            {/* Online vs In-Store Toggle */}
            <View style={styles.dealTypeSelector}>
              <Pressable
                style={[
                  styles.dealTypeBtn,
                  watchedType === 'online' && styles.dealTypeBtnActive,
                ]}
                onPress={() => {
                  setValue('deal_type', 'online');
                  setValue('city', '');
                }}>
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={
                    watchedType === 'online'
                      ? colors.textInverse
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.dealTypeText,
                    watchedType === 'online' && styles.dealTypeTextActive,
                  ]}>
                  Online Offer
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.dealTypeBtn,
                  watchedType === 'in_store' && styles.dealTypeBtnActive,
                ]}
                onPress={() => setValue('deal_type', 'in_store')}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={
                    watchedType === 'in_store'
                      ? colors.textInverse
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.dealTypeText,
                    watchedType === 'in_store' && styles.dealTypeTextActive,
                  ]}>
                  In-Store / Outlet
                </Text>
              </Pressable>
            </View>

            {/* AI Copy Generator Bar */}
            <View style={styles.aiCopyBar}>
              <View style={styles.aiCopyBarText}>
                <Ionicons name="sparkles" size={15} color={colors.primary} />
                <Text style={styles.aiCopyBarTitle}>Need catchy headlines & copy?</Text>
              </View>
              <Pressable
                style={styles.aiCopyGenerateBtn}
                onPress={() => setAiModalVisible(true)}>
                <Ionicons name="sparkles" size={13} color={colors.textInverse} />
                <Text style={styles.aiCopyGenerateBtnText}>Generate with AI</Text>
              </Pressable>
            </View>

            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Deal Headline / Title *"
                  placeholder="e.g. Flat 50% Off Summer Lawn 3-Piece Suits"
                  leftIcon="pricetag-outline"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.title?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Offer Description & Highlights *"
                  placeholder="Explain the offer, eligible items, promo codes, or how shoppers can redeem it..."
                  leftIcon="document-text-outline"
                  multiline
                  numberOfLines={4}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.description?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="discount_pct"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Discount Percentage (%) *"
                  placeholder="e.g. 40"
                  leftIcon="trending-down-outline"
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.discount_pct?.message}
                  hint="Enter a discount between 0.01% and 100%."
                />
              )}
            />
          </View>

          {/* Card 2: Category & City */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Category & Location</Text>

            <View style={styles.pickerSection}>
              <Text style={styles.inputLabel}>Select Category *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryPills}>
                {categories.map((cat) => {
                  const isSelected = watchedCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.catPill,
                        isSelected && styles.catPillSelected,
                      ]}
                      onPress={() => setValue('category_id', cat.id)}>
                      <Text
                        style={[
                          styles.catPillText,
                          isSelected && styles.catPillTextSelected,
                        ]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {errors.category_id && (
                <Text style={styles.errorText}>
                  {errors.category_id.message}
                </Text>
              )}
            </View>

            {/* City Selection for In-Store Deals */}
            {watchedType === 'in_store' && (
              <View style={styles.pickerSection}>
                <Text style={styles.inputLabel}>
                  Available City (In-Store Outlets) *
                </Text>
                <View style={styles.cityGrid}>
                  {PAKISTANI_CITIES.map((city) => {
                    const isSelected = watchedCity === city;
                    return (
                      <Pressable
                        key={city}
                        style={[
                          styles.cityChip,
                          isSelected && styles.cityChipSelected,
                        ]}
                        onPress={() => setValue('city', city)}>
                        <Text
                          style={[
                            styles.cityChipText,
                            isSelected && styles.cityChipTextSelected,
                          ]}>
                          {city}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {errors.city && (
                  <Text style={styles.errorText}>{errors.city.message}</Text>
                )}
              </View>
            )}
          </View>

          {/* Card 3: Promotion Images (Up to 5, Client compressed) */}
          <View style={styles.card}>
            <View style={styles.imageHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Deal Images</Text>
                <Text style={styles.imageSub}>
                  Upload up to 5 banners/photos. Images are automatically compressed
                  for fast mobile loading.
                </Text>
              </View>
              <Badge
                label={`${imageUrls.length} / 5`}
                variant={imageUrls.length >= 5 ? 'warning' : 'outline'}
              />
            </View>

            {/* Thumbnails Row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imageRow}>
              {imageUrls.map((url, idx) => (
                <View key={url + idx} style={styles.thumbnailWrap}>
                  <Image source={{ uri: url }} style={styles.thumbnail} />
                  <Pressable
                    style={styles.removeImageBtn}
                    onPress={() => handleRemoveImage(idx)}
                    hitSlop={6}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ))}

              {imageUrls.length < 5 && (
                <Pressable
                  style={styles.addImageBox}
                  onPress={handlePickImages}
                  disabled={uploadingImage}>
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="camera-outline"
                        size={28}
                        color={colors.primary}
                      />
                      <Text style={styles.addImageText}>Add Image</Text>
                    </>
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>

          {/* Card 4: Dates & Duration */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Validity Dates</Text>

            {/* Quick Duration Buttons */}
            <Text style={styles.inputLabel}>Quick Duration Presets</Text>
            <View style={styles.presetRow}>
              {[7, 14, 30, 60].map((days) => (
                <Pressable
                  key={days}
                  style={styles.presetBtn}
                  onPress={() => setDurationDays(days)}>
                  <Text style={styles.presetBtnText}>{days} Days</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name="start_date"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Start Date (YYYY-MM-DD) *"
                      placeholder="2026-10-04"
                      leftIcon="calendar-outline"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.start_date?.message}
                    />
                  )}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name="end_date"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="End Date (YYYY-MM-DD) *"
                      placeholder="2026-11-04"
                      leftIcon="calendar-outline"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.end_date?.message}
                    />
                  )}
                />
              </View>
            </View>

            <Controller
              control={control}
              name="terms"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Terms & Conditions (Optional)"
                  placeholder="e.g. Valid until stocks last. Cannot be combined with other ongoing promotions."
                  leftIcon="information-circle-outline"
                  multiline
                  numberOfLines={3}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          </View>

          {/* Action CTAs */}
          <View style={styles.bottomActions}>
            <Button
              label={
                dealId
                  ? 'Update & Submit for Approval'
                  : 'Submit Promotion for Approval'
              }
              variant="primary"
              fullWidth
              loading={loading}
              onPress={handleSubmit(onSubmit)}
              leftIcon="paper-plane-outline"
            />

            <Button
              label="Save as Draft"
              variant="outline"
              fullWidth
              disabled={loading}
              onPress={handleManualSaveDraft}
              leftIcon="document-text-outline"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* AI Copy Generator Modal */}
      <Modal
        visible={aiModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAiModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.modalSparkleWrap}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>AI Promo Copywriter</Text>
                  <Text style={styles.modalSubtitle}>
                    Generate high-converting headlines & descriptions
                  </Text>
                </View>
              </View>
              <Pressable hitSlop={8} onPress={() => setAiModalVisible(false)}>
                <Ionicons name="close-circle-outline" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScroll}>
              {/* Tone Selection */}
              <Text style={styles.optionSectionTitle}>Promotional Tone</Text>
              <View style={styles.optionsRow}>
                {(['exciting', 'luxury', 'urgent', 'casual'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.optionPill, aiTone === t && styles.optionPillActive]}
                    onPress={() => setAiTone(t)}>
                    <Text style={[styles.optionPillText, aiTone === t && styles.optionPillTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Language Selection */}
              <Text style={styles.optionSectionTitle}>Language Style</Text>
              <View style={styles.optionsRow}>
                <Pressable
                  style={[styles.optionPill, aiLanguage === 'english' && styles.optionPillActive]}
                  onPress={() => setAiLanguage('english')}>
                  <Text
                    style={[
                      styles.optionPillText,
                      aiLanguage === 'english' && styles.optionPillTextActive,
                    ]}>
                    English
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.optionPill, aiLanguage === 'roman_urdu' && styles.optionPillActive]}
                  onPress={() => setAiLanguage('roman_urdu')}>
                  <Text
                    style={[
                      styles.optionPillText,
                      aiLanguage === 'roman_urdu' && styles.optionPillTextActive,
                    ]}>
                    Roman Urdu
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.generateAiBtn, generatingCopy && styles.generateAiBtnDisabled]}
                disabled={generatingCopy}
                onPress={handleGenerateAiCopy}>
                {generatingCopy ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Ionicons name="sparkles" size={16} color={colors.textInverse} />
                )}
                <Text style={styles.generateAiBtnText}>
                  {generatingCopy
                    ? 'Generating with Gemini AI...'
                    : 'Generate 3 Titles & 2 Descriptions'}
                </Text>
              </Pressable>

              {/* AI Results */}
              {aiCopyResults && (
                <View style={styles.aiResultsWrap}>
                  <Text style={styles.aiResultHeader}>
                    Recommended Titles (Tap to Apply):
                  </Text>
                  {aiCopyResults.titles.map((t, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.suggestionCard}
                      onPress={() => applyAiTitle(t)}>
                      <View style={styles.suggestionHeader}>
                        <Text style={styles.suggestionNumber}>Option {idx + 1}</Text>
                        <Text style={styles.applyBadge}>Apply to Title</Text>
                      </View>
                      <Text style={styles.suggestionText}>{t}</Text>
                    </Pressable>
                  ))}

                  <Text style={[styles.aiResultHeader, { marginTop: spacing[3] }]}>
                    Recommended Descriptions (Tap to Apply):
                  </Text>
                  {aiCopyResults.descriptions.map((d, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.suggestionCard}
                      onPress={() => applyAiDescription(d)}>
                      <View style={styles.suggestionHeader}>
                        <Text style={styles.suggestionNumber}>Description {idx + 1}</Text>
                        <Text style={styles.applyBadge}>Apply to Description</Text>
                      </View>
                      <Text style={styles.suggestionText}>{d}</Text>
                    </Pressable>
                  ))}

                  <Text style={styles.neverPublishDisclaimer}>
                    🔒 Note: Suggestions are applied to the form for your review and editing. Deals are never auto-published without your final submit.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                label="Done / Back to Form"
                onPress={() => setAiModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing[4],
    gap: spacing[4],
    paddingBottom: spacing[12],
  },
  saveDraftBtnText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontSize: 14,
  },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  draftText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
  },
  dealTypeSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: 3,
    gap: spacing[2],
  },
  dealTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radii.md,
  },
  dealTypeBtnActive: {
    backgroundColor: colors.primary,
  },
  dealTypeText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontSize: 13,
  },
  dealTypeTextActive: {
    color: colors.textInverse,
  },
  pickerSection: {
    gap: spacing[2],
  },
  inputLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  categoryPills: {
    gap: spacing[2],
    paddingVertical: 2,
  },
  catPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catPillText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  catPillTextSelected: {
    color: colors.textInverse,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  cityChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cityChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  cityChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cityChipTextSelected: {
    color: colors.primary,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  imageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  imageSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    maxWidth: 240,
    lineHeight: 16,
  },
  imageRow: {
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  thumbnailWrap: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  addImageBox: {
    width: 90,
    height: 90,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  addImageText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 11,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  presetBtn: {
    flex: 1,
    paddingVertical: spacing[2],
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  presetBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  bottomActions: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: 2,
  },
  aiCopyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginTop: spacing[1],
  },
  aiCopyBarText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  aiCopyBarTitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  aiCopyGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  aiCopyGenerateBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
    paddingBottom: spacing[6],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  modalSparkleWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalTitle: {
    fontFamily: typography.h3.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
  },
  modalScroll: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  optionSectionTitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  optionPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionPillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  optionPillText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  optionPillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  generateAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.primary,
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    marginTop: spacing[2],
  },
  generateAiBtnDisabled: {
    opacity: 0.6,
  },
  generateAiBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textInverse,
  },
  aiResultsWrap: {
    marginTop: spacing[3],
    gap: spacing[2],
  },
  aiResultHeader: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  suggestionCard: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionNumber: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  applyBadge: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  suggestionText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  neverPublishDisclaimer: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: spacing[2],
    textAlign: 'center',
  },
  modalFooter: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
});
