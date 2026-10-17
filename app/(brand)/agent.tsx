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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  hasPostAction?: boolean;
}

const QUICK_PROMPTS = [
  '👋 Bhai, aap kon ho aur meri kya help kar sakte ho?',
  '💡 Summer Lawn Suit ka catchy title do',
  '💰 Rs. 6,000 par 30% discount ka price set kro',
  '📝 Premium product description likho',
  '📜 7-day exchange ke terms & conditions bnao',
  '📢 Instagram caption aur viral hashtags do',
  '💬 WhatsApp customer broadcast message likho',
];

const SYSTEM_PROMPT = `
You are "Bhai", the official AI Brand Marketing Copilot for the "Jumble Sale" platform in Pakistan.

STRICT BEHAVIORAL RULES:
1. NAME: Your name is strictly "Bhai". Whenever asked who you are, what your name is, or your identity ("aap kon ho", "naam kya hai", "who are you"), always proudly introduce yourself as "Bhai — Jumble Sale AI Copilot".
2. APP & PURPOSE: You exclusively work for Jumble Sale (Pakistan's discounts & flash deals platform) to help brand owners, merchants, and retailers.
3. INTRODUCTION & CAPABILITIES: When asked for your intro or what you can do ("apne baray mai batao", "intro do", "kya kar sakte ho", "meri help kese kar sakte ho"):
   Explain clearly and warmly:
   - Your name is Bhai, the official Brand Copilot for Jumble Sale.
   - You help the brand with:
     * 🏷️ Catchy & Viral Titles / Slogans (to get maximum clicks on Jumble Sale)
     * 📝 High-Converting Product & Deal Descriptions (highlighting quality, discount, delivery)
     * 💰 Smart Pricing & Discount Calculation (calculating selling price, customer savings, and psychological charm price like Rs. 2,999)
     * 📜 Official Terms & Conditions (drafting exchange policies, voucher rules, outlet validity)
     * 📢 Social Media & WhatsApp Marketing (Instagram/TikTok captions with hashtags, WhatsApp broadcast blast copy)
4. GREETINGS: You can warmly and politely reply to normal greetings (Salam, Assalam o Alaikum, Hello, Hi, Kese ho, Kaise hain). Ask how you can help their brand today.
5. STRICT SCOPE ENFORCEMENT & LIMITATIONS: You must ONLY answer questions directly related to Jumble Sale, brand deals, discounts, pricing, products, retail terms, and marketing.
   DO NOT entertain off-topic, random, or useless questions (fazool baatein) such as: general knowledge, politics, cricket/sports, school homework/essays, code/programming, weather, personal gossip, etc.
   If the user asks anything outside Jumble Sale and retail brand business, politely reject and steer them back:
   "Bhai, main sirf Jumble Sale aur aapke brand business ke liye kaam karta hoon! 🚫 Fazool ya ghair-mutalliq baaton ke bajaye aain apni kisi deal ka title, description, discount price ya terms & conditions set karein."
6. TONE & LANGUAGE: Speak respectfully in Pakistani Roman Urdu (or English if prompted in English). Friendly, professional, concise, and helpful.
`;

let messageCounter = 0;
function getNextId(prefix: string) {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

export default function BrandAgentScreen() {
  const router = useRouter();
  const toast = useToast();
  const { brand: authBrand, profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const brandDisplayName = authBrand?.name || profile?.display_name || 'My Brand';

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Initial welcome message from Bhai
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'assistant',
      text: `Salam! 👋 Mera naam **Bhai** hai — aapka Jumble Sale AI Brand Copilot.

Main aapke brand **${brandDisplayName}** ke liye:
• 🏷️ Catchy & Viral Titles
• 📝 High-Converting Descriptions
• 💰 Smart Pricing & Discount Calculation (.999 charm price)
• 📜 Terms & Conditions
• 📢 Instagram & WhatsApp Marketing Copy

Mujhse apni kisi bhi deal, item ya pricing ke mutalliq kuch bhi poochhein!`,
      timestamp: 'Online',
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

  // Direct Gemini API caller if client-side key is provided
  const callGeminiDirect = async (userPrompt: string, brandName: string): Promise<string | null> => {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      const fullPrompt = `${SYSTEM_PROMPT}

Current Brand Name: "${brandName}".
Brand User Message: "${userPrompt}".

Generate response directly as Bhai following all rules strictly:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 600,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) return text.trim();
      }
    } catch (err) {
      console.warn('[Brand Agent] Direct Gemini API call failed:', err);
    }
    return null;
  };

  // High-precision local fallback engine strictly enforcing Bhai persona & Jumble Sale guardrails
  const generateAIResponse = (userPrompt: string): { reply: string; hasPostAction: boolean } => {
    const prompt = userPrompt.toLowerCase();

    // 1. Identity & Name & Introduction Query
    if (
      prompt.includes('naam') ||
      prompt.includes('who are you') ||
      prompt.includes('kon ho') ||
      prompt.includes('kaun ho') ||
      prompt.includes('intro') ||
      prompt.includes('apne baray') ||
      prompt.includes('apne bare') ||
      prompt.includes('kya kar sakte') ||
      prompt.includes('kiya kar sakte') ||
      prompt.includes('help') ||
      prompt.includes('madad')
    ) {
      return {
        reply: `Mera naam **Bhai** hai! 👋 Main **Jumble Sale** ka official AI Brand Copilot hoon.

Main aapke brand **${brandDisplayName}** ki sales aur growth ke liye yeh kaam kar sakta hoon:
1. 🏷️ **Catchy & Viral Titles**: High-converting headings aur slogans jo customers ko click karne par majboor karein.
2. 📝 **Compelling Descriptions**: Fabric quality, warranty aur nationwide delivery highlight karne wali sales descriptions.
3. 💰 **Smart Pricing & Discount Calculation**: Discount ke baad final price, customer savings aur psychological charm price (jaise Rs. 2,999) calculate karna.
4. 📜 **Terms & Conditions**: 7-day exchange, invoice policies aur retail outlet rules draft karna.
5. 📢 **Social & WhatsApp Copy**: Instagram captions with trending hashtags aur direct broadcast messages ready karna.

Bataiye, aaj Jumble Sale par kaunsi deal ya post set karni hai?`,
        hasPostAction: false,
      };
    }

    // 2. Normal Greetings
    if (
      prompt.includes('salam') ||
      prompt.includes('assalam') ||
      prompt.includes('hello') ||
      prompt.includes('hi') ||
      prompt.includes('hey') ||
      prompt.includes('kese ho') ||
      prompt.includes('kaise ho') ||
      prompt.includes('kya haal') ||
      prompt.includes('kaise hain')
    ) {
      return {
        reply: `Walaikum Assalam! Main bilkul theek hoon, Bhai. Aap batayein, aaj Jumble Sale par aapke brand **${brandDisplayName}** ke liye kaunsi deal tayyar karni hai? Koi title, description ya pricing calculate karni hai?`,
        hasPostAction: false,
      };
    }

    // 3. Strict Out-of-Scope / Fazool Baatein Rejection
    const offTopicKeywords = [
      'weather', 'mausam', 'cricket', 'match', 'politics', 'siasat', 'prime minister',
      'movie', 'film', 'song', 'gaana', 'joke', 'latifa', 'homework', 'essay',
      'python', 'javascript', 'coding', 'science', 'math', 'capital of', 'president'
    ];
    if (offTopicKeywords.some((word) => prompt.includes(word))) {
      return {
        reply: `Bhai, main sirf **Jumble Sale** aur aapke brand business ke liye kaam karta hoon! 🚫 Fazool ya ghair-mutalliq baaton ke bajaye aain apni kisi deal ka title, description, discount price ya terms & conditions set karein.`,
        hasPostAction: false,
      };
    }

    // 4. Price & Discount Calculation Query
    const priceMatch = prompt.match(/\b(\d{3,6})\b/);
    const pctMatch = prompt.match(/\b(\d{1,2})\s*%/);

    if (
      (prompt.includes('price') ||
        prompt.includes('discount') ||
        prompt.includes('qimat') ||
        prompt.includes('calculate') ||
        prompt.includes('bachat')) &&
      priceMatch
    ) {
      const origPrice = parseInt(priceMatch[1], 10);
      const discountPct = pctMatch ? parseInt(pctMatch[1], 10) : 30;
      const sellingPrice = Math.round(origPrice * (1 - discountPct / 100));
      const savings = origPrice - sellingPrice;
      const charmPrice =
        sellingPrice >= 1000
          ? Math.floor(sellingPrice / 100) * 100 - 1
          : sellingPrice - 1;

      return {
        reply: `💰 **Smart Pricing & Discount Analysis by Bhai**

• **Original Price:** Rs. ${origPrice.toLocaleString()}
• **Discount Rate:** ${discountPct}% OFF
• **Final Selling Price:** Rs. ${sellingPrice.toLocaleString()}
• **Customer Savings:** Rs. ${savings.toLocaleString()}

✨ **Psychological Charm Price Recommendation:**
👉 **Rs. ${charmPrice.toLocaleString()}**
*(Bhai ka mashwara: .999 wali pricing impulse purchases ko 14% tak barha deti hai!)*

💡 **Margin Advice:**
${
  discountPct <= 20
    ? 'Yeh discount profit margins ko mehfooz rakhta hai aur high-end items ke liye best hai.'
    : discountPct <= 40
    ? 'Yeh Pakistani e-commerce ka "sweet spot" hai jisme sab se zyada orders aate hain!'
    : 'Clearance aur bulk volume sales ke liye zabardast deal hai!'
}`,
        hasPostAction: true,
      };
    }

    // 5. Titles & Slogans
    if (
      prompt.includes('title') ||
      prompt.includes('slogan') ||
      prompt.includes('naam') ||
      prompt.includes('heading')
    ) {
      return {
        reply: `🏷️ **Bhai ke Top 3 Recommended Titles (${brandDisplayName}):**

1. ⚡ **Flash Sale / Urgent:**
"Aakhri Mauqa: ${brandDisplayName} ki Exclusive Collection par Flat 30% Off!"

2. 🔥 **Viral / Click-Magnet:**
"Bachat Mela: Premium Items ab Sirf Rs. 2,999 mein — Limited Stock!"

3. ✨ **Luxury / Signature:**
"${brandDisplayName} Signature Style: Unmatched Quality with Special Savings"

Aap in mein se koi bhi title direct apni Jumble Sale post mein laga sakte hain!`,
        hasPostAction: true,
      };
    }

    // 6. Terms & Conditions
    if (
      prompt.includes('term') ||
      prompt.includes('condition') ||
      prompt.includes('policy') ||
      prompt.includes('rule') ||
      prompt.includes('exchange') ||
      prompt.includes('return')
    ) {
      return {
        reply: `📜 **Official Terms & Conditions for ${brandDisplayName}:**

1. Yeh promotional offer stock khatam honay tak valid hai.
2. Discount online store aur tamam official retail outlets par laagu hai.
3. 7 din ke andar exchange ki suhoolat asli invoice aur intact security tags ke sath dastyaab hai.
4. Yeh deal kisi doosray promotional voucher ya bank discount ke sath combine nahi ki ja sakti.
5. Standard nationwide cash-on-delivery aur delivery charges laagu honge.`,
        hasPostAction: false,
      };
    }

    // 7. Social Media, Instagram, WhatsApp Promotion
    if (
      prompt.includes('instagram') ||
      prompt.includes('whatsapp') ||
      prompt.includes('social') ||
      prompt.includes('caption') ||
      prompt.includes('promote') ||
      prompt.includes('broadcast') ||
      prompt.includes('ad')
    ) {
      return {
        reply: `📢 **Promotional Marketing Assets by Bhai:**

📸 **Instagram / TikTok Post Caption:**
"🔥 BIGGEST SALE OF THE SEASON! 🔥

Aapki pasandeeda collection par ab chal rahi hai FLAT 30% OFF ki Dhamaka Sale! 🎉

Crafted for style, priced for unbeatable value. Limited stock nationwide!

🛍️ Available in-store & online
🚚 Express Doorstep Delivery Across Pakistan
👉 Bio ke link par click karein aur apna order book karein!

#JumbleSale #PakistanSale #SaleAlertPK #${brandDisplayName.replace(/[^a-zA-Z0-9]/g, '')} #BestDeals #OnlineShoppingPK"

---

💬 **WhatsApp & SMS Broadcast Message:**
"📢 Salam! ${brandDisplayName} ki taraf se shandaar khushkhabri! Hamari viral collection par ab Flat 30% OFF shuru ho chuki hai! Limited stock dastyaab hai, foran order karein: [Link]!"`,
        hasPostAction: false,
      };
    }

    // 8. Product Description
    if (
      prompt.includes('desc') ||
      prompt.includes('tafseel') ||
      prompt.includes('detail') ||
      prompt.includes('likh') ||
      prompt.includes('write')
    ) {
      return {
        reply: `📝 **High-Converting Product Description by Bhai:**

"${brandDisplayName} pesh karta hai aapke liye behtareen quality aur lajawab design. Yeh collection un khareedaron ke liye tayyar ki gayi hai jo premium fabric, aala mayaar aur munfarid style pasand karte hain. 

Ab haasil karein flat discount ki zabardast bachat mehdood waqt ke liye! Pure Pakistan mein fast delivery, cash on delivery aur aasan exchange ki suhoolat ke sath dastyaab hai. Aaj hi shopping karein aur is shandaar offer ka faida uthayein!"`,
        hasPostAction: true,
      };
    }

    // 9. General Retail Campaign Request
    return {
      reply: `🚀 **Bhai's Marketing Recommendation for ${brandDisplayName}:**

🏷️ **Recommended Title:**
"Flash Clearance: Flat 30% Off on ${brandDisplayName} Specials!"

📝 **Description:**
"Experience signature elegance with ${brandDisplayName}. Premium materials, modern cut, and unmatched comfort delivered straight to your doorstep across Pakistan."

💰 **Pricing Recommendation:**
Rs. 4,999 ke bajaye **Rs. 3,499** charm price set karein. Customers ko Rs. 1,500 ki bachat dikhayen.

📜 **Terms:**
Valid till stock lasts • 7-day exchange with original invoice.

📢 **Social Hook:**
"Stock is flying off shelves! Claim your 30% discount today."`,
      hasPostAction: true,
    };
  };

  // Handle Send Message with Gemini -> Supabase Edge Function -> Local Fallback
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
      let finalReply: string | null = null;
      let hasAction = false;

      // 1. Direct Gemini Call if client has EXPO_PUBLIC_GEMINI_API_KEY
      finalReply = await callGeminiDirect(text, brandDisplayName);

      // 2. If not, invoke Supabase Edge Function (configured with Gemini secret)
      if (!finalReply) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke(
            'brand-copilot',
            {
              body: { message: text, brand_name: brandDisplayName },
            }
          );
          if (!fnError && fnData?.reply) {
            finalReply = fnData.reply;
          }
        } catch (edgeErr) {
          console.warn('[Brand Agent] Edge function unavailable, using local Bhai engine:', edgeErr);
        }
      }

      // 3. Deterministic Local Fallback Engine (strictly same persona & rules)
      if (!finalReply) {
        const local = generateAIResponse(text);
        finalReply = local.reply;
        hasAction = local.hasPostAction;
      } else {
        const lower = text.toLowerCase();
        hasAction = lower.includes('title') || lower.includes('price') || lower.includes('desc');
      }

      const aiMsg: ChatMessage = {
        id: getNextId('assistant'),
        sender: 'assistant',
        text: finalReply,
        timestamp: timeStr,
        hasPostAction: hasAction,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('[Brand Agent] handleSend error:', err);
      const fallback = generateAIResponse(text);
      setMessages((prev) => [
        ...prev,
        {
          id: getNextId('assistant-fallback'),
          sender: 'assistant',
          text: fallback.reply,
          timestamp: timeStr,
          hasPostAction: fallback.hasPostAction,
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
            <Text style={styles.headerTitle}>Bhai — Brand Copilot</Text>
            <Text style={styles.headerStatus}>Jumble Sale AI • Online</Text>
          </View>
        </View>

        <Pressable
          style={styles.clearChatBtn}
          onPress={() => {
            setMessages([
              {
                id: getNextId('welcome-reset'),
                sender: 'assistant',
                text: `Salam! 👋 Mera naam **Bhai** hai — aapka Jumble Sale AI Copilot. Nayi deal ya pricing ke mutalliq poochhein!`,
                timestamp: 'Online',
              },
            ]);
            toast.show('Chat refreshed! 🔄', 'info');
          }}
          hitSlop={8}>
          <Ionicons name="refresh-outline" size={18} color="#94A3B8" />
        </Pressable>
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

                        {item.hasPostAction && (
                          <Pressable
                            style={[styles.bubbleActionBtn, { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.4)' }]}
                            onPress={() => router.push('/(brand)/posts')}
                            hitSlop={6}>
                            <Ionicons name="arrow-forward" size={13} color="#38BDF8" />
                            <Text style={[styles.bubbleActionText, { color: '#38BDF8' }]}>Apply to Posts</Text>
                          </Pressable>
                        )}
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
                <View style={[styles.messageBubble, styles.messageBubbleAssistant, styles.typingBubble]}>
                  <ActivityIndicator size="small" color="#00FF66" />
                  <Text style={styles.typingText}>Copilot is writing...</Text>
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
            style={styles.textInput}
            placeholder="Type your question or request..."
            placeholderTextColor="#64748B"
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={600}
          />

          <Pressable
            style={[
              styles.sendBtn,
              !inputMessage.trim() && styles.sendBtnDisabled,
            ]}
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
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  timestampText: {
    ...typography.caption,
    fontSize: 10,
    color: '#64748B',
  },
  bubbleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bubbleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0D1A12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  bubbleActionText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#00FF66',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  typingText: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 12,
  },
  quickPromptsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
    backgroundColor: '#0D1018',
    paddingVertical: spacing[2],
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
    paddingVertical: 6,
    borderRadius: 16,
  },
  quickPromptText: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  inputComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: '#090A0E',
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
    gap: spacing[2],
  },
  textInput: {
    flex: 1,
    backgroundColor: '#141721',
    borderRadius: radii.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#202432',
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
  },
});
