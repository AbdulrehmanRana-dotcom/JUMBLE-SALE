import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { addCategory, removeCategory } from '@/lib/categoryStore';
import { toggleDealPin } from '@/lib/dealStore';
import { broadcastNotification } from '@/lib/notificationStore';
import { exportBrandsToCsv, exportDealsToCsv, exportOrdersToCsv } from '@/lib/exportUtils';
import type { Brand, Category, Deal } from '@/types/database.types';

const adminTheme = {
  bgCard: '#13151C',
  bgCardHover: '#181B24',
  bgInput: '#151821',
  border: '#1F2330',
  borderLight: '#2A3042',
  neon: '#00FF66',
  neonGlow: 'rgba(0, 255, 102, 0.22)',
  neonLight: 'rgba(0, 255, 102, 0.12)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.15)',
  info: '#3B82F6',
  infoBg: 'rgba(59, 130, 246, 0.15)',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDark: '#0A0D0B',
};

const AVAILABLE_ICONS = [
  'flame-outline',
  'gift-outline',
  'star-outline',
  'shirt-outline',
  'footsteps-outline',
  'phone-portrait-outline',
  'fast-food-outline',
  'sparkles-outline',
  'cart-outline',
  'home-outline',
  'airplane-outline',
  'watch-outline',
];

interface AdminGrowthToolsSectionProps {
  initialSubTab?: 'sponsored' | 'broadcast' | 'categories' | 'quality' | 'export';
  deals: Deal[];
  brands: Brand[];
  categories: Category[];
  orders?: any[];
  onRefetchDeals: () => Promise<any>;
  onRefetchCategories: () => Promise<any>;
}

export function AdminGrowthToolsSection({
  initialSubTab = 'sponsored',
  deals = [],
  brands = [],
  categories = [],
  orders = [],
  onRefetchDeals,
  onRefetchCategories,
}: AdminGrowthToolsSectionProps) {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'sponsored' | 'broadcast' | 'categories' | 'quality' | 'export'>(
    initialSubTab
  );

  // ─── 1. SPONSORED STATE ───
  const [sponsoredSearch, setSponsoredSearch] = useState('');
  const [pinningDealId, setPinningDealId] = useState<string | null>(null);

  // ─── 2. BROADCAST STATE ───
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'consumers' | 'brands'>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastUrl, setBroadcastUrl] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // ─── 3. CATEGORY MANAGER STATE ───
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('gift-outline');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // ─── 1. HANDLE TOGGLE DEAL PIN ───
  const handleTogglePin = async (deal: Deal) => {
    setPinningDealId(deal.id);
    try {
      const isPinned = await toggleDealPin(deal.id);
      await onRefetchDeals();
      toast.show(
        isPinned
          ? `Deal "${deal.title}" is now pinned to Home Featured Slider! ⭐`
          : `Deal "${deal.title}" unpinned from Top Banner.`,
        'success'
      );
    } catch (err: any) {
      toast.show(err.message || 'Failed to update sponsored status', 'error');
    } finally {
      setPinningDealId(null);
    }
  };

  const filteredDealsForPin = useMemo(() => {
    if (!sponsoredSearch.trim()) return deals;
    const q = sponsoredSearch.toLowerCase();
    return deals.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.brand_name?.toLowerCase().includes(q) ||
        d.brand?.name?.toLowerCase().includes(q)
    );
  }, [deals, sponsoredSearch]);

  const pinnedDealsCount = useMemo(() => deals.filter((d) => d.is_pinned).length, [deals]);

  // ─── 2. HANDLE BROADCAST NOTIFICATION ───
  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim()) {
      toast.show('Please enter a notification title', 'error');
      return;
    }
    if (!broadcastBody.trim()) {
      toast.show('Please enter notification body text', 'error');
      return;
    }

    setSendingBroadcast(true);
    try {
      await broadcastNotification({
        target: broadcastTarget,
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        action_url: broadcastUrl.trim() || null,
      });

      toast.show('Platform announcement broadcasted live across all devices! 🚀', 'success');
      setBroadcastTitle('');
      setBroadcastBody('');
      setBroadcastUrl('');
    } catch (err: any) {
      toast.show(err.message || 'Failed to send broadcast', 'error');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // ─── 3. HANDLE CATEGORY CREATE & DELETE ───
  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      toast.show('Please enter a category name', 'error');
      return;
    }

    setCreatingCategory(true);
    try {
      await addCategory({
        name: newCatName.trim(),
        icon: newCatIcon,
      });
      await onRefetchCategories();
      toast.show(`Category "${newCatName.trim()}" created and synced to database! 🏷️`, 'success');
      setNewCatName('');
    } catch (err: any) {
      toast.show(err.message || 'Failed to add category', 'error');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const doDelete = async () => {
      setDeletingCatId(cat.id);
      try {
        await removeCategory(cat.id);
        await onRefetchCategories();
        toast.show(`Category "${cat.name}" removed from database.`, 'info');
      } catch (err: any) {
        toast.show(err.message || 'Failed to delete category', 'error');
      } finally {
        setDeletingCatId(null);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Are you sure you want to delete category "${cat.name}" from database?`)) {
        doDelete();
      }
      return;
    }

    Alert.alert('Delete Category', `Are you sure you want to delete category "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  // ─── 4. QUALITY & BROKEN LINK SCANNER ───
  const qualityIssues = useMemo(() => {
    const issues: {
      deal: Deal;
      type: 'broken_url' | 'high_discount' | 'missing_img' | 'bad_price';
      message: string;
    }[] = [];

    deals.forEach((d) => {
      const url = d.buy_url || (d as any).website_url;
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        issues.push({
          deal: d,
          type: 'broken_url',
          message: 'Missing or invalid outbound destination website link',
        });
      }
      if (d.discount_pct && d.discount_pct > 80) {
        issues.push({
          deal: d,
          type: 'high_discount',
          message: `Unusually high discount (${d.discount_pct}% OFF) - Verify validity`,
        });
      }
      if (d.discount_price && d.discount_price < 50) {
        issues.push({
          deal: d,
          type: 'bad_price',
          message: `Suspicious selling price (Rs. ${d.discount_price})`,
        });
      }
      const hasImage = Boolean(d.banner_url || (Array.isArray(d.image_urls) && d.image_urls.length > 0));
      if (!hasImage) {
        issues.push({
          deal: d,
          type: 'missing_img',
          message: 'No cover photo or product photo uploaded',
        });
      }
    });

    return issues;
  }, [deals]);

  return (
    <View style={styles.container}>
      {/* ── Sub Navigation Tabs ── */}
      <View style={styles.subTabBar}>
        <Pressable
          style={[styles.subTabItem, activeSubTab === 'sponsored' && styles.subTabItemActive]}
          onPress={() => setActiveSubTab('sponsored')}>
          <Ionicons
            name="star"
            size={16}
            color={activeSubTab === 'sponsored' ? adminTheme.neon : adminTheme.textSecondary}
          />
          <Text style={[styles.subTabLabel, activeSubTab === 'sponsored' && styles.subTabLabelActive]}>
            Sponsored ({pinnedDealsCount})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.subTabItem, activeSubTab === 'broadcast' && styles.subTabItemActive]}
          onPress={() => setActiveSubTab('broadcast')}>
          <Ionicons
            name="megaphone"
            size={16}
            color={activeSubTab === 'broadcast' ? adminTheme.neon : adminTheme.textSecondary}
          />
          <Text style={[styles.subTabLabel, activeSubTab === 'broadcast' && styles.subTabLabelActive]}>
            Broadcast
          </Text>
        </Pressable>

        <Pressable
          style={[styles.subTabItem, activeSubTab === 'categories' && styles.subTabItemActive]}
          onPress={() => setActiveSubTab('categories')}>
          <Ionicons
            name="apps"
            size={16}
            color={activeSubTab === 'categories' ? adminTheme.neon : adminTheme.textSecondary}
          />
          <Text style={[styles.subTabLabel, activeSubTab === 'categories' && styles.subTabLabelActive]}>
            Categories ({categories.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.subTabItem, activeSubTab === 'quality' && styles.subTabItemActive]}
          onPress={() => setActiveSubTab('quality')}>
          <Ionicons
            name="shield-checkmark"
            size={16}
            color={activeSubTab === 'quality' ? adminTheme.neon : adminTheme.textSecondary}
          />
          <Text style={[styles.subTabLabel, activeSubTab === 'quality' && styles.subTabLabelActive]}>
            Quality ({qualityIssues.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.subTabItem, activeSubTab === 'export' && styles.subTabItemActive]}
          onPress={() => setActiveSubTab('export')}>
          <Ionicons
            name="download"
            size={16}
            color={activeSubTab === 'export' ? adminTheme.neon : adminTheme.textSecondary}
          />
          <Text style={[styles.subTabLabel, activeSubTab === 'export' && styles.subTabLabelActive]}>
            CSV Export
          </Text>
        </Pressable>
      </View>

      {/* ── TAB 1: SPONSORED & HERO BANNER MANAGER ── */}
      {activeSubTab === 'sponsored' && (
        <View style={styles.sectionBody}>
          <View style={styles.bannerInfoBox}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="sparkles" size={20} color={adminTheme.neon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerInfoTitle}>Top Hero Slider Monetization</Text>
              <Text style={styles.bannerInfoDesc}>
                Pin selected brand promotions to the top of "🔥 Featured Sales in Pakistan" hero carousel. Pinned deals
                stay at position #1 with a prominent Sponsored badge across all user devices.
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pinnedDealsCount} Pinned</Text>
            </View>
          </View>

          {/* Search Box */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={adminTheme.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search deals by title or brand..."
              placeholderTextColor={adminTheme.textMuted}
              value={sponsoredSearch}
              onChangeText={setSponsoredSearch}
            />
          </View>

          {/* Deals Grid / List */}
          <ScrollView contentContainerStyle={styles.dealsList} showsVerticalScrollIndicator={false}>
            {filteredDealsForPin.map((deal) => {
              const brandName = deal.brand_name || deal.brand?.name || 'Featured Brand';
              const imgUri = deal.banner_url || deal.image_urls?.[0] || 'https://images.unsplash.com/photo-1544441893-675973e31985';
              const isPinned = Boolean(deal.is_pinned);
              const isBusy = pinningDealId === deal.id;

              return (
                <View key={deal.id} style={[styles.dealCard, isPinned && styles.dealCardPinned]}>
                  <Image source={{ uri: imgUri }} style={styles.dealThumb} />
                  <View style={styles.dealMeta}>
                    <View style={styles.dealHeaderRow}>
                      <Text style={styles.dealBrandText}>{brandName}</Text>
                      {isPinned ? (
                        <View style={styles.pinnedPill}>
                          <Ionicons name="star" size={11} color="#090A0D" />
                          <Text style={styles.pinnedPillText}>SPONSORED TOP</Text>
                        </View>
                      ) : (
                        <Text style={styles.dealStatusText}>{deal.status.toUpperCase()}</Text>
                      )}
                    </View>

                    <Text style={styles.dealTitle} numberOfLines={1}>
                      {deal.title}
                    </Text>

                    <View style={styles.dealPriceRow}>
                      <Text style={styles.dealDiscountText}>{deal.discount_pct}% OFF</Text>
                      <Text style={styles.dealPriceText}>
                        Rs. {(deal.discount_price || deal.original_price || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.dealCityText}>• {deal.city || 'All Pakistan'}</Text>
                    </View>
                  </View>

                  <Pressable
                    style={[styles.pinBtn, isPinned ? styles.unpinBtn : styles.pinBtnActive]}
                    disabled={isBusy}
                    onPress={() => handleTogglePin(deal)}>
                    {isBusy ? (
                      <ActivityIndicator size="small" color={isPinned ? '#FFFFFF' : '#090A0D'} />
                    ) : (
                      <>
                        <Ionicons
                          name={isPinned ? 'close-circle' : 'star'}
                          size={15}
                          color={isPinned ? '#FFFFFF' : '#090A0D'}
                        />
                        <Text style={[styles.pinBtnText, isPinned && { color: '#FFFFFF' }]}>
                          {isPinned ? 'Unpin' : 'Pin to Top'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── TAB 2: BROADCAST ANNOUNCEMENT CENTER ── */}
      {activeSubTab === 'broadcast' && (
        <ScrollView contentContainerStyle={styles.sectionBody} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerInfoBox}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="megaphone" size={20} color={adminTheme.neon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerInfoTitle}>Platform-Wide Notification Blast</Text>
              <Text style={styles.bannerInfoDesc}>
                Broadcast real-time push alerts and in-app banners instantly to all active shopper and brand devices.
              </Text>
            </View>
          </View>

          {/* Quick Presets */}
          <Text style={styles.labelTitle}>QUICK CAMPAIGN TEMPLATES</Text>
          <View style={styles.presetsRow}>
            <Pressable
              style={styles.presetChip}
              onPress={() => {
                setBroadcastTitle('🔥 Mega Flash Sale is Now LIVE!');
                setBroadcastBody('Flat 50% - 70% discounts across top brands in Pakistan. Limited stock available!');
                setBroadcastUrl('/(consumer)/explore');
              }}>
              <Text style={styles.presetChipText}>🔥 Flash Sale Blast</Text>
            </Pressable>

            <Pressable
              style={styles.presetChip}
              onPress={() => {
                setBroadcastTitle('🌙 Eid Festive Shopping Gala Announced');
                setBroadcastBody('Explore brand-new unstitched lawn, ready-to-wear kurtis, and festive footwear.');
                setBroadcastUrl('/(consumer)/');
              }}>
              <Text style={styles.presetChipText}>🌙 Eid / Festive Sale</Text>
            </Pressable>

            <Pressable
              style={styles.presetChip}
              onPress={() => {
                setBroadcastTarget('brands');
                setBroadcastTitle('📢 Merchant Alert: Upload Weekend Deals Today');
                setBroadcastBody('Weekend flash sales will be featured on front carousel. Submit by Friday 6 PM.');
                setBroadcastUrl('/(brand)/posts');
              }}>
              <Text style={styles.presetChipText}>📢 Brand Merchant Blast</Text>
            </Pressable>
          </View>

          {/* Target Audience */}
          <Text style={styles.labelTitle}>TARGET AUDIENCE</Text>
          <View style={styles.audienceRow}>
            {(['all', 'consumers', 'brands'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.audienceChip, broadcastTarget === t && styles.audienceChipActive]}
                onPress={() => setBroadcastTarget(t)}>
                <Ionicons
                  name={t === 'all' ? 'people' : t === 'consumers' ? 'cart' : 'business'}
                  size={15}
                  color={broadcastTarget === t ? '#090A0D' : adminTheme.textSecondary}
                />
                <Text style={[styles.audienceChipText, broadcastTarget === t && styles.audienceChipTextActive]}>
                  {t === 'all' ? 'All Shoppers & Brands' : t === 'consumers' ? 'Shoppers Only' : 'Brands Only'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.labelTitle}>ANNOUNCEMENT TITLE</Text>
          <TextInput
            style={styles.inputField}
            placeholder="e.g. 11.11 Mega Sale Starts Tonight!"
            placeholderTextColor={adminTheme.textMuted}
            value={broadcastTitle}
            onChangeText={setBroadcastTitle}
          />

          {/* Body */}
          <Text style={styles.labelTitle}>MESSAGE BODY</Text>
          <TextInput
            style={[styles.inputField, { height: 90, textAlignVertical: 'top' }]}
            placeholder="Write clear, engaging copy for shoppers..."
            placeholderTextColor={adminTheme.textMuted}
            multiline
            value={broadcastBody}
            onChangeText={setBroadcastBody}
          />

          {/* Target Action URL */}
          <Text style={styles.labelTitle}>TARGET ROUTE / ACTION URL (OPTIONAL)</Text>
          <TextInput
            style={styles.inputField}
            placeholder="e.g. /(consumer)/explore or /(brand)/posts"
            placeholderTextColor={adminTheme.textMuted}
            value={broadcastUrl}
            onChangeText={setBroadcastUrl}
          />

          {/* Preview Box */}
          <Text style={styles.labelTitle}>LIVE NOTIFICATION PREVIEW</Text>
          <View style={styles.previewBox}>
            <View style={styles.previewHeader}>
              <View style={styles.previewDot} />
              <Text style={styles.previewMeta}>Jumble Sale • Official Admin Announcement</Text>
            </View>
            <Text style={styles.previewTitle}>{broadcastTitle || 'Announcement Title Preview'}</Text>
            <Text style={styles.previewBody}>{broadcastBody || 'Notification body text will appear here...'}</Text>
          </View>

          {/* Send Button */}
          <Pressable
            style={styles.sendBroadcastBtn}
            disabled={sendingBroadcast}
            onPress={handleSendBroadcast}>
            {sendingBroadcast ? (
              <ActivityIndicator color="#090A0D" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#090A0D" />
                <Text style={styles.sendBroadcastBtnText}>Send Live Broadcast Across All Devices</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {/* ── TAB 3: CATEGORY & FESTIVAL MANAGER ── */}
      {activeSubTab === 'categories' && (
        <ScrollView contentContainerStyle={styles.sectionBody} showsVerticalScrollIndicator={false}>
          {/* Add Category Card */}
          <View style={styles.addCategoryCard}>
            <Text style={styles.addCategoryTitle}>Create New Category / Seasonal Festival</Text>
            <Text style={styles.addCategoryDesc}>
              Add permanent retail departments or temporary festive sales (e.g. "Ramadan Ration", "Eid Collection", "Azadi Sale").
              Changes automatically sync to Supabase and show up on Home chips.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TextInput
                style={[styles.inputField, { flex: 1 }]}
                placeholder="Category Name (e.g. Eid Festive Gala)"
                placeholderTextColor={adminTheme.textMuted}
                value={newCatName}
                onChangeText={setNewCatName}
              />
              <Pressable
                style={styles.createCatBtn}
                disabled={creatingCategory}
                onPress={handleCreateCategory}>
                {creatingCategory ? (
                  <ActivityIndicator color="#090A0D" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color="#090A0D" />
                    <Text style={styles.createCatBtnText}>Add</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Icon Selector */}
            <Text style={[styles.labelTitle, { marginTop: 14 }]}>SELECT ICON</Text>
            <View style={styles.iconGrid}>
              {AVAILABLE_ICONS.map((iconName) => (
                <Pressable
                  key={iconName}
                  style={[styles.iconChip, newCatIcon === iconName && styles.iconChipActive]}
                  onPress={() => setNewCatIcon(iconName)}>
                  <Ionicons
                    name={iconName as any}
                    size={20}
                    color={newCatIcon === iconName ? adminTheme.neon : adminTheme.textSecondary}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {/* Active Categories List */}
          <Text style={styles.labelTitle}>ACTIVE CATEGORIES IN DATABASE ({categories.length})</Text>
          <View style={styles.catGrid}>
            {categories.map((cat) => {
              const isDeleting = deletingCatId === cat.id;
              return (
                <View key={cat.id} style={styles.catCard}>
                  <View style={styles.catIconWrap}>
                    <Ionicons name={(cat.icon || 'pricetag-outline') as any} size={20} color={adminTheme.neon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catNameText}>{cat.name}</Text>
                    <Text style={styles.catIdText} numberOfLines={1}>
                      ID: {cat.id}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.catDeleteBtn}
                    disabled={isDeleting}
                    hitSlop={8}
                    onPress={() => handleDeleteCategory(cat)}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 4: QUALITY & LINK SCANNER ── */}
      {activeSubTab === 'quality' && (
        <ScrollView contentContainerStyle={styles.sectionBody} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerInfoBox}>
            <View style={[styles.bannerIconCircle, { backgroundColor: adminTheme.warningBg }]}>
              <Ionicons name="shield-half" size={20} color={adminTheme.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerInfoTitle}>Deal Quality & Link Health Scanner</Text>
              <Text style={styles.bannerInfoDesc}>
                Automated detection of suspicious discounts (&gt;80% OFF), broken or missing outbound checkout links,
                and deals with missing photo assets.
              </Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: adminTheme.warningBg, borderColor: adminTheme.warning }]}>
              <Text style={[styles.countBadgeText, { color: adminTheme.warning }]}>
                {qualityIssues.length} Flags
              </Text>
            </View>
          </View>

          {qualityIssues.length === 0 ? (
            <View style={styles.cleanStateBox}>
              <Ionicons name="checkmark-circle" size={48} color={adminTheme.neon} />
              <Text style={styles.cleanStateTitle}>All Deals Are High Quality! 🎉</Text>
              <Text style={styles.cleanStateDesc}>
                No broken links, unrealistic discount percentages, or missing cover photos detected in the catalog.
              </Text>
            </View>
          ) : (
            qualityIssues.map((issue, idx) => {
              const url = issue.deal.buy_url || (issue.deal as any).website_url;
              return (
                <View key={`${issue.deal.id}-${idx}`} style={styles.issueCard}>
                  <View style={styles.issueIconCircle}>
                    <Ionicons
                      name={
                        issue.type === 'broken_url'
                          ? 'link'
                          : issue.type === 'high_discount'
                          ? 'trending-down'
                          : 'alert-circle'
                      }
                      size={18}
                      color="#EF4444"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.issueBadge}>
                        {issue.type === 'broken_url'
                          ? 'LINK ISSUE'
                          : issue.type === 'high_discount'
                          ? 'EXTREME DISCOUNT'
                          : 'QUALITY FLAG'}
                      </Text>
                      <Text style={styles.issueBrandText}>
                        {issue.deal.brand_name || issue.deal.brand?.name || 'Brand'}
                      </Text>
                    </View>

                    <Text style={styles.issueDealTitle}>{issue.deal.title}</Text>
                    <Text style={styles.issueMessage}>{issue.message}</Text>
                  </View>

                  {url && (
                    <Pressable
                      style={styles.testLinkBtn}
                      onPress={() => {
                        Linking.openURL(url).catch(() =>
                          toast.show('Could not open external URL', 'error')
                        );
                      }}>
                      <Ionicons name="open-outline" size={14} color={adminTheme.neon} />
                      <Text style={styles.testLinkBtnText}>Test URL</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── TAB 5: DATA EXPORT CENTER (CSV) ── */}
      {activeSubTab === 'export' && (
        <ScrollView contentContainerStyle={styles.sectionBody} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerInfoBox}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="document-text" size={20} color={adminTheme.neon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerInfoTitle}>1-Click Data Export Center</Text>
              <Text style={styles.bannerInfoDesc}>
                Export clean, audit-ready CSV reports for Excel or business reporting with all registered brands,
                deals performance, and order attribution data.
              </Text>
            </View>
          </View>

          <View style={styles.exportGrid}>
            {/* Card 1: Brands */}
            <View style={styles.exportCard}>
              <View style={styles.exportCardHeader}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="business" size={22} color={adminTheme.neon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportCardTitle}>Brands Directory Report</Text>
                  <Text style={styles.exportCardSubtitle}>{brands.length} Total Merchants</Text>
                </View>
              </View>
              <Text style={styles.exportCardDesc}>
                Includes merchant IDs, brand names, business emails, contact numbers, categories, verification status, and registration dates.
              </Text>
              <Pressable
                style={styles.exportBtn}
                onPress={() => {
                  exportBrandsToCsv(brands);
                  toast.show('Brands CSV downloaded! 📥', 'success');
                }}>
                <Ionicons name="download-outline" size={18} color="#090A0D" />
                <Text style={styles.exportBtnText}>Download Brands CSV</Text>
              </Pressable>
            </View>

            {/* Card 2: Deals */}
            <View style={styles.exportCard}>
              <View style={styles.exportCardHeader}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="pricetags" size={22} color={adminTheme.neon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportCardTitle}>Promotions & Sales Report</Text>
                  <Text style={styles.exportCardSubtitle}>{deals.length} Total Deals Catalog</Text>
                </View>
              </View>
              <Text style={styles.exportCardDesc}>
                Includes deal IDs, titles, brands, discount percentages, original prices, discount prices, sponsored statuses, and outbound links.
              </Text>
              <Pressable
                style={styles.exportBtn}
                onPress={() => {
                  exportDealsToCsv(deals);
                  toast.show('Deals Catalog CSV downloaded! 📥', 'success');
                }}>
                <Ionicons name="download-outline" size={18} color="#090A0D" />
                <Text style={styles.exportBtnText}>Download Deals CSV</Text>
              </Pressable>
            </View>

            {/* Card 3: Orders & GMV */}
            <View style={styles.exportCard}>
              <View style={styles.exportCardHeader}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="cart" size={22} color={adminTheme.neon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportCardTitle}>Attributed Orders & GMV</Text>
                  <Text style={styles.exportCardSubtitle}>{orders.length} Shopping Claims</Text>
                </View>
              </View>
              <Text style={styles.exportCardDesc}>
                Includes order references, brand names, order gross merchandise value (PKR), claimed customer savings, and attribution timestamps.
              </Text>
              <Pressable
                style={styles.exportBtn}
                onPress={() => {
                  exportOrdersToCsv(orders);
                  toast.show('Orders & GMV CSV downloaded! 📥', 'success');
                }}>
                <Ionicons name="download-outline" size={18} color="#090A0D" />
                <Text style={styles.exportBtnText}>Download Orders CSV</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subTabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0E1015',
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  subTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subTabItemActive: {
    backgroundColor: adminTheme.neonLight,
    borderColor: adminTheme.neon,
  },
  subTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.textSecondary,
  },
  subTabLabelActive: {
    color: adminTheme.neon,
  },
  sectionBody: {
    padding: 20,
    gap: 16,
  },
  bannerInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  bannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: adminTheme.neonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.textPrimary,
    marginBottom: 3,
  },
  bannerInfoDesc: {
    fontSize: 12,
    color: adminTheme.textSecondary,
    lineHeight: 18,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: adminTheme.neonLight,
    borderWidth: 1,
    borderColor: adminTheme.neon,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.neon,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: adminTheme.textPrimary,
  },
  dealsList: {
    gap: 10,
  },
  dealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  dealCardPinned: {
    borderColor: adminTheme.neon,
    backgroundColor: 'rgba(0, 255, 102, 0.04)',
  },
  dealThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1A1D24',
  },
  dealMeta: {
    flex: 1,
    gap: 3,
  },
  dealHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dealBrandText: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.textSecondary,
  },
  dealStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: adminTheme.textMuted,
  },
  pinnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: adminTheme.neon,
  },
  pinnedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#090A0D',
  },
  dealTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  dealPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dealDiscountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF6B00',
  },
  dealPriceText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.neon,
  },
  dealCityText: {
    fontSize: 11,
    color: adminTheme.textMuted,
  },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pinBtnActive: {
    backgroundColor: adminTheme.neon,
  },
  unpinBtn: {
    backgroundColor: '#374151',
  },
  pinBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#090A0D',
  },
  labelTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: adminTheme.textSecondary,
    marginTop: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.textPrimary,
  },
  audienceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  audienceChipActive: {
    backgroundColor: adminTheme.neon,
    borderColor: adminTheme.neon,
  },
  audienceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.textSecondary,
  },
  audienceChipTextActive: {
    color: '#090A0D',
    fontWeight: '700',
  },
  inputField: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
    fontSize: 14,
    color: adminTheme.textPrimary,
  },
  previewBox: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#171B26',
    borderWidth: 1,
    borderColor: '#2D3548',
    gap: 6,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: adminTheme.neon,
  },
  previewMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.neon,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  previewBody: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  sendBroadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: adminTheme.neon,
    marginTop: 8,
  },
  sendBroadcastBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#090A0D',
  },
  addCategoryCard: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  addCategoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  addCategoryDesc: {
    fontSize: 12,
    color: adminTheme.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  createCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: adminTheme.neon,
    justifyContent: 'center',
  },
  createCatBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#090A0D',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: {
    borderColor: adminTheme.neon,
    backgroundColor: adminTheme.neonLight,
  },
  catGrid: {
    gap: 8,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: adminTheme.neonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  catIdText: {
    fontSize: 11,
    color: adminTheme.textMuted,
  },
  catDeleteBtn: {
    padding: 8,
  },
  cleanStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    gap: 10,
    backgroundColor: adminTheme.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  cleanStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  cleanStateDesc: {
    fontSize: 13,
    color: adminTheme.textSecondary,
    textAlign: 'center',
    maxWidth: 380,
  },
  issueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  issueIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  issueBrandText: {
    fontSize: 11,
    color: adminTheme.textMuted,
  },
  issueDealTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.textPrimary,
    marginTop: 2,
  },
  issueMessage: {
    fontSize: 12,
    color: '#F87171',
    marginTop: 2,
  },
  testLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    borderWidth: 1,
    borderColor: adminTheme.neon,
  },
  testLinkBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.neon,
  },
  exportGrid: {
    gap: 14,
  },
  exportCard: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
    gap: 10,
  },
  exportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exportIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: adminTheme.neonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  exportCardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.neon,
  },
  exportCardDesc: {
    fontSize: 13,
    color: adminTheme.textSecondary,
    lineHeight: 18,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 8,
    backgroundColor: adminTheme.neon,
    marginTop: 4,
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#090A0D',
  },
});
