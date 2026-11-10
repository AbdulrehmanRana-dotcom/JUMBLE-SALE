import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { askJumbleBachatAssistant } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Deal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  deals?: Deal[] | any[];
  created_at: string;
}

const SUGGESTED_QUESTIONS = [
  '🎯 Rs. 3,000 ke budget mein best dikhao',
  '👗 Khaadi & Gul Ahmed par sab se bari sale',
  '🔥 50%+ OFF Flash Deals jo jaldi khatam ho rahi hain',
  '👟 Bata shoes aur sneakers par best sale',
  '🍔 Fast food aur dinner ke saste combos',
  '📱 Sastay budget smartphones & gadgets',
  '💡 Mujhe sasta alternative dikhao',
];

let messageCounter = 0;
function getNextId(prefix: string) {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

export default function AIAssistantScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [contextualChips, setContextualChips] = useState<string[]>(SUGGESTED_QUESTIONS);

  // 1. Load initial chat history from database if user is logged in
  useEffect(() => {
    async function loadChatHistory() {
      if (!user) {
        // Welcome message for guests
        setMessages([
          {
            id: 'welcome-guest',
            role: 'assistant',
            content:
              'Salam Janab! 🛍️ Main hoon aapka Jumble Personal Shopping Salesman aur Bachat Advisor!\n\nPakistan bhar ke verified official brands par sab se sasti deals dhoondne ke liye mujh se mashwara karein. Batayein aaj kis cheez ki shopping ka irada hai — kapray, branded shoes, naya smartphone, ya shaam ka dinner? Aur budget kitna hai?',
            created_at: new Date().toISOString(),
          },
        ]);
        setLoadingHistory(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(30);

        if (error) throw error;

        if (data && data.length > 0) {
          // If messages have deal_ids, load deal cards
          const dealIdsToFetch = Array.from(
            new Set(data.flatMap((m: any) => m.deal_ids || []))
          ).filter(Boolean);

          let dealsMap = new Map<string, any>();
          if (dealIdsToFetch.length > 0) {
            const { data: dealsData } = await supabase
              .from('deals')
              .select('id, title, discount_pct, original_price, discount_price, end_date, image_urls, brand:brands(name, logo_url)')
              .in('id', dealIdsToFetch);

            if (dealsData) {
              dealsData.forEach((d: any) => dealsMap.set(d.id, d));
            }
          }

          const formatted: ChatItem[] = data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            deals: (m.deal_ids || []).map((id: string) => dealsMap.get(id)).filter(Boolean),
            created_at: m.created_at,
          }));

          setMessages(formatted);
        } else {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content:
                'Salam Janab! 🛍️ Main hoon aapka Jumble Personal Shopping Salesman aur Bachat Advisor!\n\nPakistan bhar ke verified official brands par sab se sasti deals dhoondne ke liye mujh se mashwara karein. Batayein aaj kis cheez ki shopping ka irada hai — kapray, branded shoes, naya smartphone, ya shaam ka dinner? Aur budget kitna hai?',
              created_at: new Date().toISOString(),
            },
          ]);
        }
      } catch (err: any) {
        console.warn('Could not load chat history:', err.message);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadChatHistory();
  }, [user]);

  // 2. Send Message Handler
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || loading) return;

    setInputMessage('');

    const userMsg: ChatItem = {
      id: getNextId('local-user'),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const historySnapshot = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call Jumble Bachat Assistant with Live Database Grounding & Gemini
      const aiResult = await askJumbleBachatAssistant(text, historySnapshot);

      const assistantMsg: ChatItem = {
        id: getNextId('local-ai'),
        role: 'assistant',
        content: aiResult.reply,
        deals: aiResult.deals,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (aiResult.suggested_chips && aiResult.suggested_chips.length > 0) {
        setContextualChips(aiResult.suggested_chips);
      }

      // Record in Supabase chat_messages table if authenticated
      if (user?.id) {
        try {
          await (supabase.from('chat_messages') as any).insert([
            {
              user_id: user.id,
              role: 'user',
              content: text,
              created_at: userMsg.created_at,
            },
            {
              user_id: user.id,
              role: 'assistant',
              content: aiResult.reply,
              deal_ids: aiResult.deals.map((d: any) => d.id),
              created_at: assistantMsg.created_at,
            },
          ]);
        } catch {}
      }
    } catch (err: any) {
      toast.show(err.message || 'Chat error', 'error');
    } finally {
      setLoading(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleDealCardPress = (dealId: string) => {
    router.push(`/(consumer)/deal/${dealId}` as any);
  };

  const handleShareDeal = async (deal: any, e?: any) => {
    e?.stopPropagation?.();
    try {
      const shareUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/deal/${deal.id}`
          : `https://jumblesale.app/deal/${deal.id}`;

      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast.show('Deal link copied to clipboard! 🔗', 'success');
      } else {
        await Share.share({
          title: deal.title,
          message: `Check out this deal on Jumble Sale: ${deal.title} (${deal.discount_pct}% OFF)! ${shareUrl}`,
        });
      }
    } catch {
      toast.show('Deal link copied! 🔗', 'info');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={18} color={colors.textInverse} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Jumble AI Personal Salesman</Text>
              <Text style={styles.headerSubtitle}>
                Bachat Advisor • Live Database Connected • High-Value Deals
              </Text>
            </View>
          </View>
        </View>

        {/* Suggested Question Chips */}
        <View style={styles.chipsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}>
            {contextualChips.map((chip, idx) => (
              <Pressable
                key={idx}
                style={styles.chip}
                onPress={() => handleSend(chip)}>
                <Text style={styles.chipText}>{chip}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Message History List */}
        {loadingHistory ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading chat history...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              return (
                <View
                  style={[
                    styles.messageRow,
                    isUser ? styles.messageRowUser : styles.messageRowAI,
                  ]}>
                  {!isUser && (
                    <View style={styles.messageAvatar}>
                      <Ionicons name="sparkles" size={14} color={colors.primary} />
                    </View>
                  )}

                  <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
                    <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
                      {item.content}
                    </Text>

                    {/* Tappable In-Chat Deal Cards */}
                    {item.deals && item.deals.length > 0 && (
                      <View style={styles.dealCardsContainer}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.dealCardsScroll}>
                          {item.deals.map((deal: any) => {
                            const brandName = deal.brand?.name || (deal as any).brand_name || 'Partner Brand';
                            const imageUri = deal.image_urls?.[0];
                            const origPrice = deal.original_price || 0;
                            const discPrice =
                              deal.discount_price ||
                              (origPrice && deal.discount_pct
                                ? Math.round(origPrice * (1 - deal.discount_pct / 100))
                                : origPrice);
                            const savings = origPrice > discPrice ? origPrice - discPrice : 0;
                            const expiryLabel = deal.end_date
                              ? `Until ${new Date(deal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : 'Limited Time Offer';

                            return (
                              <Pressable
                                key={deal.id}
                                style={styles.inChatDealCard}
                                onPress={() => handleDealCardPress(deal.id)}>
                                <View style={{ position: 'relative' }}>
                                  {imageUri ? (
                                    <Image
                                      source={{ uri: imageUri }}
                                      style={styles.dealCardThumb}
                                      contentFit="cover"
                                      transition={200}
                                      cachePolicy="memory-disk"
                                    />
                                  ) : (
                                    <View style={styles.dealCardThumbPlaceholder}>
                                      <Ionicons name="pricetag" size={20} color={colors.primary} />
                                    </View>
                                  )}
                                  <View style={styles.cardBadgesOverlay}>
                                    <View style={styles.discountBadge}>
                                      <Text style={styles.discountBadgeText}>
                                        {deal.discount_pct}% OFF
                                      </Text>
                                    </View>
                                    {savings > 0 && (
                                      <View style={styles.savingsBadge}>
                                        <Text style={styles.savingsBadgeText}>
                                          Bachat Rs. {savings.toLocaleString()}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>

                                <View style={styles.dealCardInfo}>
                                  <Text style={styles.dealCardBrand} numberOfLines={1}>
                                    {brandName}
                                  </Text>
                                  <Text style={styles.dealCardTitle} numberOfLines={2}>
                                    {deal.title}
                                  </Text>

                                  <View style={styles.priceRow}>
                                    <Text style={styles.dealCardPrice}>
                                      Rs. {discPrice.toLocaleString()}
                                    </Text>
                                    {origPrice > discPrice && (
                                      <Text style={styles.dealCardOrigPrice}>
                                        Rs. {origPrice.toLocaleString()}
                                      </Text>
                                    )}
                                  </View>

                                  <View style={styles.expiryRow}>
                                    <Ionicons name="time-outline" size={11} color={colors.warning} />
                                    <Text style={styles.expiryText}>{expiryLabel}</Text>
                                  </View>

                                  <View style={styles.cardActionRow}>
                                    <Pressable
                                      style={styles.claimBtn}
                                      onPress={() => handleDealCardPress(deal.id)}>
                                      <Ionicons name="flash" size={11} color="#0D1117" />
                                      <Text style={styles.claimBtnText}>Claim Deal</Text>
                                    </Pressable>

                                    <Pressable
                                      style={styles.shareIconBtn}
                                      onPress={(e) => handleShareDeal(deal, e)}>
                                      <Ionicons name="share-social-outline" size={13} color={colors.textSecondary} />
                                    </Pressable>
                                  </View>
                                </View>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              loading ? (
                <View style={styles.typingRow}>
                  <View style={styles.messageAvatar}>
                    <Ionicons name="sparkles" size={14} color={colors.primary} />
                  </View>
                  <View style={styles.typingBubble}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.typingText}>Searching active deals in Pakistan...</Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Type in English or Roman Urdu..."
            placeholderTextColor={colors.textMuted}
            value={inputMessage}
            onChangeText={setInputMessage}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            multiline={false}
          />
          <Pressable
            style={[styles.sendBtn, !inputMessage.trim() && styles.sendBtnDisabled]}
            disabled={!inputMessage.trim() || loading}
            onPress={() => handleSend()}>
            <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: typography.h3.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
  },
  chipsWrapper: {
    backgroundColor: colors.surface,
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chipsScroll: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  chip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  chipText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: spacing[2],
    fontFamily: typography.caption.fontFamily,
    color: colors.textMuted,
  },
  messageList: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    maxWidth: '88%',
  },
  messageRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  messageRowAI: {
    alignSelf: 'flex-start',
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bubble: {
    padding: spacing[3],
    borderRadius: radii.lg,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  bubbleAI: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  bubbleTextAI: {
    color: colors.textPrimary,
  },
  dealCardsContainer: {
    marginTop: spacing[2],
    marginHorizontal: -spacing[2],
  },
  dealCardsScroll: {
    paddingHorizontal: spacing[2],
    gap: spacing[2],
  },
  inChatDealCard: {
    width: 215,
    backgroundColor: '#161922',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dealCardThumb: {
    width: '100%',
    height: 105,
  },
  dealCardThumbPlaceholder: {
    width: '100%',
    height: 105,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadgesOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  discountBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  discountBadgeText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 10,
    fontWeight: '800',
    color: '#0D1117',
  },
  savingsBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  savingsBadgeText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 9,
    fontWeight: '800',
    color: '#0D1117',
  },
  dealCardInfo: {
    padding: spacing[2],
  },
  dealCardBrand: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  dealCardTitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 16,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  dealCardPrice: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '800',
    color: '#22C55E',
  },
  dealCardOrigPrice: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  expiryText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  claimBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  claimBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '800',
    color: '#0D1117',
  },
  shareIconBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginVertical: spacing[2],
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.surface,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typingText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radii.full,
    paddingHorizontal: spacing[4],
    paddingVertical: Platform.OS === 'ios' ? 10 : spacing[2],
    fontFamily: typography.caption.fontFamily,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
});
