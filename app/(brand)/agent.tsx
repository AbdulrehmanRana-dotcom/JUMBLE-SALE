import { Ionicons } from '@expo/vector-icons';
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
import {
  askBhaiBrandCopilot,
  getBrandLiveContext,
  runDeterministicBhaiReply,
  type BhaiAction,
  type BrandLiveContext,
} from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import { onBrandAgentTabReset } from '@/lib/tabEvents';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  hasPostAction?: boolean;
  actions?: BhaiAction[];
  suggested_prompts?: string[];
}

const QUICK_PROMPTS = [
  '📊 What is my store status & how many deals are live?',
  '💡 Suggest a catchy title for Summer Collection',
  '💰 Calculate 30% discount on Rs. 5,000',
  '⏳ When will my pending deal be approved?',
  '📝 Write a premium product description',
  '📢 Draft a WhatsApp customer broadcast message',
  '📜 Create terms & conditions for 7-day exchange',
];

let messageCounter = 0;
function getNextId(prefix: string) {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

export default function BrandAgentScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, brand: authBrand, profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const brandDisplayName = authBrand?.name || profile?.display_name || 'My Brand';

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [liveContext, setLiveContext] = useState<BrandLiveContext | null>(null);

  // Load Real-time Database Context on Mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const ctx = await getBrandLiveContext(authBrand?.id || brandDisplayName, user?.id);
        if (isMounted) setLiveContext(ctx);
      } catch (err) {
        console.warn('[BrandAgentScreen] Context load note:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [authBrand?.id, brandDisplayName, user?.id]);

  // Instagram-style: Tapping Agent in bottom nav clears draft and scrolls chat to end
  useEffect(() => {
    const unsubscribe = onBrandAgentTabReset(() => {
      setInputMessage('');
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Initial welcome message from Bhai
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'assistant',
      text: `Hello! 👋 I am **Bhai** — your Jumble Sale AI Executive Brand Assistant.

I am here to assist your brand **${brandDisplayName}** with:
• 📊 Real-Time Store Status & Pending Reviews
• 🏷️ Catchy & Viral Titles (Urgency, Value & Luxury)
• 📝 High-Converting Product Descriptions
• 💰 Smart Pricing & Psychological Charm Prices (.999)
• 📜 Terms & Conditions and QA verification rules
• 📢 WhatsApp Broadcasts & Social Captions

How can I help boost your sales and promotions today?`,
      timestamp: 'Online',
      actions: [
        { label: '👉 Create New Deal', route: '/(brand)/create-deal' },
        { label: '📊 View Active Posts', route: '/(brand)/posts' },
      ],
    },
  ]);

  // Safe clipboard copy
  const copyToClipboard = async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && 'clipboard' in navigator && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
      }
    } catch {
      // fallback
    }
    toast.show('Message copied to clipboard! 📋', 'success');
  };

  // Handle Send Message with Live Database Context -> Gemini -> Fallback
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isTyping) return;

    const timeStr = 'Now';
    const userMsg: ChatMessage = {
      id: getNextId('user'),
      sender: 'user',
      text,
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Refresh live context on demand to ensure zero staleness
      const currentCtx =
        liveContext || (await getBrandLiveContext(authBrand?.id || brandDisplayName, user?.id));

      const aiResult = await askBhaiBrandCopilot(
        text,
        authBrand?.id || brandDisplayName,
        authBrand?.category || 'Retail',
        user?.id,
        currentCtx
      );

      const aiMsg: ChatMessage = {
        id: getNextId('assistant'),
        sender: 'assistant',
        text: aiResult.reply,
        timestamp: timeStr,
        hasPostAction: aiResult.hasPostAction,
        actions: aiResult.actions,
        suggested_prompts: aiResult.suggested_prompts,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('[Brand Agent] handleSend error:', err);
      const fallback = runDeterministicBhaiReply(
        text,
        liveContext || brandDisplayName
      );
      setMessages((prev) => [
        ...prev,
        {
          id: getNextId('assistant-fallback'),
          sender: 'assistant',
          text: fallback.reply,
          timestamp: timeStr,
          hasPostAction: fallback.hasPostAction,
          actions: fallback.actions,
          suggested_prompts: fallback.suggested_prompts,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isTyping]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── CHAT HEADER ─── */}
      <View style={styles.chatHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.botAvatar}>
            <Ionicons name="sparkles" size={18} color="#00FF66" />
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Bhai — Executive Brand Copilot</Text>
            <Text style={styles.headerStatus}>Jumble Sale AI • Live Database Connected</Text>
          </View>
        </View>

        <Pressable
          style={styles.clearChatBtn}
          onPress={() => {
            setMessages([
              {
                id: getNextId('welcome-reset'),
                sender: 'assistant',
                text: `Hello! 👋 I am **Bhai** — your Jumble Sale AI Executive Assistant. Feel free to ask anything about your store status or promotions!`,
                timestamp: 'Online',
                actions: [
                  { label: '👉 Create New Deal', route: '/(brand)/create-deal' },
                  { label: '📊 View Active Posts', route: '/(brand)/posts' },
                ],
              },
            ]);
            toast.show('Chat refreshed! 🔄', 'info');
          }}
          hitSlop={8}>
          <Ionicons name="refresh-outline" size={18} color="#94A3B8" />
        </Pressable>
      </View>

      {/* ─── REAL-TIME BRAND STATUS STRIP ─── */}
      <View style={styles.snapshotStrip}>
        <View style={styles.snapshotItem}>
          <View style={[styles.statusDot, { backgroundColor: '#00FF66' }]} />
          <Text style={styles.snapshotLabel}>
            {liveContext ? `${liveContext.activeDeals.length} Live` : 'Active'}
          </Text>
        </View>

        <View style={styles.snapshotDivider} />

        <View style={styles.snapshotItem}>
          <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.snapshotLabel}>
            {liveContext ? `${liveContext.pendingDeals.length} Pending` : 'Pending'}
          </Text>
        </View>

        {liveContext && liveContext.rejectedDeals.length > 0 && (
          <>
            <View style={styles.snapshotDivider} />
            <View style={styles.snapshotItem}>
              <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.snapshotLabel, { color: '#EF4444' }]}>
                {liveContext.rejectedDeals.length} Rejected
              </Text>
            </View>
          </>
        )}

        <View style={styles.snapshotDivider} />

        <View style={styles.snapshotItem}>
          <Ionicons name="storefront-outline" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
          <Text style={styles.snapshotLabelCategory} numberOfLines={1}>
            {brandDisplayName}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {/* ─── MESSAGES LIST ─── */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isUser = item.sender === 'user';
            return (
              <View
                style={[
                  styles.messageRow,
                  isUser ? styles.messageRowUser : styles.messageRowAssistant,
                ]}>
                {!isUser && (
                  <View style={styles.botMiniAvatar}>
                    <Ionicons name="sparkles" size={12} color="#00FF66" />
                  </View>
                )}

                <View
                  style={[
                    styles.messageBubble,
                    isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
                  ]}>
                  <Text
                    style={[
                      styles.messageText,
                      isUser ? styles.messageTextUser : styles.messageTextAssistant,
                    ]}>
                    {item.text}
                  </Text>

                  {/* ─── ACTION BUTTONS / DEEP LINKS ─── */}
                  {!isUser && item.actions && item.actions.length > 0 && (
                    <View style={styles.actionsContainer}>
                      {item.actions.map((act: BhaiAction, actIdx: number) => (
                        <Pressable
                          key={actIdx}
                          style={styles.actionDeepLinkBtn}
                          onPress={() => router.push(act.route as any)}
                          hitSlop={6}>
                          <Text style={styles.actionDeepLinkText}>{act.label}</Text>
                          <Ionicons
                            name="arrow-forward"
                            size={12}
                            color="#00FF66"
                            style={{ marginLeft: 4 }}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <View style={styles.messageFooter}>
                    <Text style={styles.timestampText}>{item.timestamp}</Text>

                    {!isUser && (
                      <View style={styles.bubbleActionRow}>
                        <Pressable
                          style={styles.bubbleActionBtn}
                          onPress={() => copyToClipboard(item.text)}
                          hitSlop={6}>
                          <Ionicons name="copy-outline" size={13} color="#00FF66" />
                          <Text style={styles.bubbleActionText}>Copy</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            isTyping ? (
              <View style={[styles.messageRow, styles.messageRowAssistant]}>
                <View style={styles.botMiniAvatar}>
                  <Ionicons name="sparkles" size={12} color="#00FF66" />
                </View>
                <View
                  style={[
                    styles.messageBubble,
                    styles.messageBubbleAssistant,
                    styles.typingBubble,
                  ]}>
                  <ActivityIndicator size="small" color="#00FF66" />
                  <Text style={styles.typingText}>Copilot is assisting...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* ─── QUICK SUGGESTION PROMPTS ─── */}
        <View style={styles.quickPromptsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptsScroll}>
            {QUICK_PROMPTS.map((promptText, idx) => (
              <Pressable
                key={idx}
                style={styles.quickPromptChip}
                onPress={() => handleSend(promptText.replace(/^[^a-zA-Z0-9]+/, ''))}>
                <Text style={styles.quickPromptText}>{promptText}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ─── INPUT COMPOSER ─── */}
        <View style={styles.inputComposer}>
          <TextInput
            testID="brand-agent-input"
            style={styles.textInput}
            placeholder="Type your question or request for Bhai..."
            placeholderTextColor="#64748B"
            value={inputMessage}
            onChangeText={setInputMessage}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
            maxLength={600}
          />

          <Pressable
            testID="brand-agent-send-btn"
            style={[styles.sendBtn, !inputMessage.trim() && styles.sendBtnDisabled]}
            disabled={!inputMessage.trim() || isTyping}
            onPress={() => handleSend()}>
            <Ionicons
              name="send"
              size={18}
              color={inputMessage.trim() ? '#090A0E' : '#64748B'}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  chatHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#1A1E2B',
    backgroundColor: '#0D1018',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  botAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141721',
    borderWidth: 1.5,
    borderColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00FF66',
    borderWidth: 1.5,
    borderColor: '#090A0E',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerStatus: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
  },
  clearChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#141721',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#202432',
  },
  snapshotStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111420',
    paddingVertical: 7,
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#1A1E2B',
    gap: 8,
  },
  snapshotItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  snapshotLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  snapshotLabelCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: '#38BDF8',
    maxWidth: 140,
  },
  snapshotDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#202432',
  },
  messagesList: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  botMiniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#141721',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00FF66',
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: radii.xl,
    padding: spacing[3],
    gap: 6,
  },
  messageBubbleUser: {
    backgroundColor: '#0D2818',
    borderWidth: 1,
    borderColor: '#00FF66',
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  messageTextUser: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  messageTextAssistant: {
    color: '#E2E8F0',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#202432',
  },
  actionDeepLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.35)',
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionDeepLinkText: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '700',
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timestampText: {
    fontSize: 10,
    color: '#64748B',
  },
  bubbleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bubbleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1E2B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#202432',
  },
  bubbleActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00FF66',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  typingText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  quickPromptsWrap: {
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
    backgroundColor: '#0D1018',
  },
  quickPromptsScroll: {
    paddingHorizontal: spacing[4],
    gap: 8,
  },
  quickPromptChip: {
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  quickPromptText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  inputComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: '#0D1018',
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
    gap: 10,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#141721',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#202432',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#1A1E2B',
  },
});
