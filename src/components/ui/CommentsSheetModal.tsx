import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import {
  addDealComment,
  getDealComments,
  sanitizeReviewerName,
  type CommentItem,
} from '@/lib/activityStore';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';
import type { Deal } from '@/types/database.types';

export interface CommentsSheetModalProps {
  visible: boolean;
  onClose: () => void;
  deal: (Deal & { brand_name?: string; brand_logo?: string; likes_count?: number }) | null;
  onCommentAdded?: (newComment: CommentItem, totalComments: number) => void;
}

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 45) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export function CommentsSheetModal({
  visible,
  onClose,
  deal,
  onCommentAdded,
}: CommentsSheetModalProps) {
  const toast = useToast();
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Load authentic comments from database via Node.js backend
  useEffect(() => {
    if (visible && deal?.id) {
      setLoading(true);
      getDealComments(deal.id)
        .then((list) => {
          setComments(list);
        })
        .catch(() => {
          setComments([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setComments([]);
      setInputText('');
    }
  }, [visible, deal?.id]);

  if (!deal) return null;

  const dealTitle = (deal.title || '').replace(/\s*\((?:copy|nakal)\)/gi, '').trim();
  const brandName = (deal as any).brand?.name || deal.brand_name || 'Brand Partner';
  const dealImage = deal.image_urls?.[0] || (deal as any).banner_url || null;

  const handlePostComment = async () => {
    const text = inputText.trim();
    if (!text) return;

    setSubmitting(true);
    try {
      const effectiveUserId = user?.id || 'shopper_guest';
      const rawName =
        profile?.display_name ||
        user?.user_metadata?.display_name ||
        user?.user_metadata?.full_name ||
        (user?.email ? user.email.split('@')[0] : 'Shopper');
      const safeUserName = sanitizeReviewerName(rawName);

      const created = await addDealComment(
        deal.id,
        effectiveUserId,
        safeUserName,
        text,
        dealTitle,
        deal.brand_id
      );

      // Prepend newly added comment to top
      const updated = [created, ...comments.filter((c) => c.id !== created.id)];
      setComments(updated);
      setInputText('');

      // Notify parent to increment feed card comment count live
      onCommentAdded?.(created, updated.length);
      toast.show('Review posted! 💬', 'success');

      // Scroll to top
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err: any) {
      toast.show(err.message || 'Could not post review', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const userInitial = (
    profile?.display_name ||
    user?.email?.split('@')[0] ||
    'Y'
  )[0].toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Backdrop"
        />

        {/* Instagram-Style Bottom Sheet Container */}
        <View style={styles.sheetContainer}>
          {/* Top Drag Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Reviews</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{comments.length}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close reviews">
              <Ionicons name="close" size={20} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Deal Mini Snippet Header */}
          <View style={styles.dealSnippet}>
            {dealImage ? (
              <Image source={{ uri: dealImage }} style={styles.snippetImage} contentFit="cover" />
            ) : (
              <View style={styles.snippetPlaceholder}>
                <Ionicons name="pricetag" size={16} color="#00FF66" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.snippetBrand}>{brandName}</Text>
              <Text style={styles.snippetTitle} numberOfLines={1}>
                {dealTitle}
              </Text>
            </View>
            {Boolean(deal.discount_pct) && (
              <View style={styles.snippetDiscount}>
                <Text style={styles.snippetDiscountText}>{deal.discount_pct}% OFF</Text>
              </View>
            )}
          </View>

          {/* Comments List */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#00FF66" />
              <Text style={styles.loadingText}>Loading original reviews...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbubble-ellipses-outline" size={32} color="#00FF66" />
                  </View>
                  <Text style={styles.emptyTitle}>No reviews yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Be the first to review this {brandName} deal or ask a question!
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const authorName = sanitizeReviewerName(item.user_name || 'Customer');
                const authorInitial = (authorName || 'C')[0].toUpperCase();
                const isCurrentUser =
                  user &&
                  (item.user_id === user.id ||
                    item.user_name?.toLowerCase() === profile?.display_name?.toLowerCase());

                return (
                  <View style={styles.commentRow}>
                    {/* User Avatar */}
                    <View
                      style={[
                        styles.avatarCircle,
                        isCurrentUser && { borderColor: '#00FF66', borderWidth: 1.5 },
                      ]}>
                      <Text style={styles.avatarText}>{authorInitial}</Text>
                    </View>

                    {/* Comment Body */}
                    <View style={styles.commentBody}>
                      <View style={styles.commentMetaRow}>
                        <Text style={styles.authorName}>
                          {authorName}
                          {isCurrentUser && <Text style={styles.youBadge}> (You)</Text>}
                        </Text>
                        <Text style={styles.timeAgoText}>{formatTimeAgo(item.created_at)}</Text>
                      </View>

                      <Text style={styles.commentText}>{item.text}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Sticky Instagram-style Bottom Input Bar */}
          <View style={styles.bottomBar}>
            <View style={styles.inputAvatar}>
              <Text style={styles.inputAvatarText}>{userInitial}</Text>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder={`Write a review for ${brandName}...`}
                placeholderTextColor="#64748B"
                value={inputText}
                onChangeText={setInputText}
                maxLength={500}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={handlePostComment}
              />

              <Pressable
                onPress={handlePostComment}
                disabled={submitting || !inputText.trim()}
                style={[
                  styles.sendBtn,
                  inputText.trim() ? styles.sendBtnActive : styles.sendBtnDisabled,
                ]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send review">
                {submitting ? (
                  <ActivityIndicator size="small" color="#090A0E" />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color={inputText.trim() ? '#090A0E' : '#475569'}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheetContainer: {
    backgroundColor: '#0F121C',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1E2436',
    maxHeight: '82%',
    minHeight: '50%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleBar: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2030',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  countBadge: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radii.full,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00FF66',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#181E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141824',
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2030',
  },
  snippetImage: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  snippetPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#1B2234',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snippetBrand: {
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  snippetTitle: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  snippetDiscount: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  snippetDiscountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing[4],
    gap: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E2538',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#00FF66',
    fontWeight: '800',
    fontSize: 14,
  },
  commentBody: {
    flex: 1,
    backgroundColor: '#141824',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2436',
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  youBadge: {
    color: '#00FF66',
    fontWeight: '600',
    fontSize: 11,
  },
  timeAgoText: {
    fontSize: 11,
    color: '#64748B',
  },
  commentText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0C13',
    borderTopWidth: 1,
    borderTopColor: '#1A2030',
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    gap: 10,
  },
  inputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A2030',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#263048',
  },
  inputAvatarText: {
    color: '#00FF66',
    fontWeight: '800',
    fontSize: 13,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141824',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#222A3E',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  textInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    maxHeight: 80,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendBtnActive: {
    backgroundColor: '#00FF66',
  },
  sendBtnDisabled: {
    backgroundColor: '#1E2538',
  },
});
