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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { searchDealsWithGemini } from '@/lib/gemini';
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
  '🔥 50% se zyada discount wali deals',
  '👗 Eid pe kapron par sasti sale dikhao',
  '🍔 Food delivery aur restaurant deals',
  '📱 Sastay smartphones & electronics',
  '👠 Shoes aur sneakers clearance',
  '⏰ Deals ending this weekend',
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
              'Assalam-o-Alaikum! I am your Jumble Sale shopping assistant. Ask me about active sales in Pakistan in English or Roman Urdu (e.g. "Eid pe kapron par sasti sale" or "50% off electronics"). What deals are you looking for?',
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
              .select('id, title, discount_pct, end_date, image_urls, brand:brands(name, logo_url)')
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
                'Assalam-o-Alaikum! Welcome to Jumble AI Deals Assistant. I can help you find real active sales across Pakistan in English and Roman Urdu! Ask me anything like:\n• "Eid pe kapron par sasti sale dikhao"\n• "Deals with 50% or more discount"\n• "Best offers on sneakers and shoes"',
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
      // 1. Try invoking the Edge Function chat-assistant
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'chat-assistant',
        {
          body: { message: text },
        }
      );

      if (!fnError && fnData?.success) {
        const assistantMsg: ChatItem = {
          id: getNextId('local-ai'),
          role: 'assistant',
          content: fnData.reply,
          deals: fnData.deals || [],
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return;
      }

      // 2. Client-side fallback if Edge Function is offline or rate-limited
      if (fnError && fnError.message?.includes('429')) {
        toast.show('Rate limit reached. Please wait a minute before asking again.', 'error');
        setMessages((prev) => [
          ...prev,
          {
            id: getNextId('ai-ratelimit'),
            role: 'assistant',
            content: 'Aap bohat jaldi sawal bhej rahay hain! Kripya aik minute intizar karein.',
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }

      // 2. Gemini Natural Language Deal Search with live database matching
      const aiResult = await searchDealsWithGemini(text);

      setMessages((prev) => [
        ...prev,
        {
          id: getNextId('ai-gemini'),
          role: 'assistant',
          content: aiResult.reply,
          deals: aiResult.deals,
          created_at: new Date().toISOString(),
        },
      ]);
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
              <Text style={styles.headerTitle}>Jumble AI Deals Concierge</Text>
              <Text style={styles.headerSubtitle}>
                English & Roman Urdu • Verified Deals Only
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
            {SUGGESTED_QUESTIONS.map((chip, idx) => (
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
                            const brandName = deal.brand?.name || 'Partner Brand';
                            const imageUri = deal.image_urls?.[0];
                            return (
                              <Pressable
                                key={deal.id}
                                style={styles.inChatDealCard}
                                onPress={() => handleDealCardPress(deal.id)}>
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

                                <View style={styles.dealCardInfo}>
                                  <View style={styles.discountBadge}>
                                    <Text style={styles.discountBadgeText}>
                                      {deal.discount_pct}% OFF
                                    </Text>
                                  </View>
                                  <Text style={styles.dealCardBrand} numberOfLines={1}>
                                    {brandName}
                                  </Text>
                                  <Text style={styles.dealCardTitle} numberOfLines={2}>
                                    {deal.title}
                                  </Text>

                                  <View style={styles.viewOfferRow}>
                                    <Text style={styles.viewOfferText}>View Deal</Text>
                                    <Ionicons
                                      name="arrow-forward"
                                      size={12}
                                      color={colors.primary}
                                    />
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
    width: 200,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dealCardThumb: {
    width: '100%',
    height: 100,
  },
  dealCardThumbPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dealCardInfo: {
    padding: spacing[2],
  },
  discountBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  discountBadgeText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 10,
    fontWeight: '800',
    color: colors.textInverse,
  },
  dealCardBrand: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
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
  viewOfferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  viewOfferText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
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
