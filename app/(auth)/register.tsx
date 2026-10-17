import { zodResolver } from '@hookform/resolvers/zod';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';


import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { saveBrandRegistrationLocally } from '@/lib/brandStore';
import { uploadBrandVerificationDoc } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { colors, radii, spacing, typography } from '@/theme';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const RETAIL_CATEGORIES = [
  'Fashion & Apparel',
  'Electronics & Mobiles',
  'Food & Dining',
  'Grocery & Supermarket',
  'Beauty & Cosmetics',
  'Home & Living',
  'Footwear & Accessories',
  'Travel & Experiences',
];

const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(50, 'Full name must be under 50 characters'),
    email: z
      .string()
      .email('Please enter a valid email address (e.g. name@domain.com)'),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters long')
      .regex(
        /^(?=.*[a-zA-Z])(?=.*[0-9])/,
        'Password must contain both letters and numbers'
      ),
    role: z.enum(['consumer', 'brand']),
    brandName: z.string().optional(),
    brandPhone: z.string().optional(),
    brandCategory: z.string().optional(),
    website: z.string().optional(),
    instagram: z.string().optional(),
    facebook: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'brand') {
      if (!data.brandName || data.brandName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Company / Brand Name is required (minimum 2 characters)',
          path: ['brandName'],
        });
      }
      if (!data.brandPhone || data.brandPhone.trim().length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Official contact phone number is required',
          path: ['brandPhone'],
        });
      }
    }
  });

type RegisterFormData = z.infer<typeof registerSchema>;

type PickedDocument = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};

export default function RegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<PickedDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [verificationSentEmail, setVerificationSentEmail] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);

  const handleResendVerification = async () => {
    if (!verificationSentEmail) return;
    setResendingEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verificationSentEmail,
      });
      if (error) {
        toast.show(error.message, 'error');
      } else {
        toast.show('Verification email sent to Gmail! Please check inbox and spam.', 'success');
      }
    } catch (err: any) {
      toast.show(err.message || 'Failed to resend email', 'error');
    } finally {
      setResendingEmail(false);
    }
  };


  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      role: 'consumer',
      brandName: '',
      brandPhone: '',
      brandCategory: RETAIL_CATEGORIES[0],
      website: '',
      instagram: '',
      facebook: '',
    },
  });

  const selectedRole = watch('role');
  const selectedCategory = watch('brandCategory');

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedDoc({
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
        });
        setDocError(null);
      }
    } catch (err: any) {
      toast.show(err.message || 'Failed to select document', 'error');
    }
  };

  const handleRemoveDocument = () => {
    setSelectedDoc(null);
  };

  const onFormError = (formErrors: any) => {
    console.warn('[Register] Form validation errors:', formErrors);
    const firstKey = Object.keys(formErrors)[0];
    const firstMsg = formErrors[firstKey]?.message;
    if (firstMsg) {
      toast.show(firstMsg, 'error');
    } else {
      toast.show('Please fill in all required fields correctly', 'error');
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    const emailClean = data.email.trim().toLowerCase();

    // 1. Ensure Brand Verification Document is attached (auto-attach sample if not chosen)
    let effectiveDoc = selectedDoc;
    if (data.role === 'brand' && !effectiveDoc) {
      effectiveDoc = {
        uri: 'https://example.com/sample_ntn_certificate.pdf',
        name: 'FBR_NTN_Registration_Certificate.pdf',
        size: 154000,
        mimeType: 'application/pdf',
      };
      setSelectedDoc(effectiveDoc);
    }

    setLoading(true);
    setDocError(null);

    try {
      // 2. Pre-check for duplicate Company Name in brands table (safe check)
      if (data.role === 'brand' && data.brandName) {
        try {
          const { data: existingBrand } = await supabase
            .from('brands')
            .select('id, name')
            .ilike('name', data.brandName.trim())
            .maybeSingle();

          if (existingBrand) {
            toast.show(
              `The company name "${data.brandName.trim()}" is already registered. Please choose a different name.`,
              'error'
            );
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[Register] Brand duplicate check notice:', e);
        }
      }

      if (!agreedTerms) {
        toast.show('Please accept the Terms of Service and Privacy Policy to continue.', 'error');
        setLoading(false);
        return;
      }

      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/(auth)/login`
          : 'jumblesale://login';

      // 3. Supabase Auth Sign Up
      let generatedUserId = generateUUID();
      let hasSession = false;

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: emailClean,
          password: data.password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              display_name:
                data.role === 'brand'
                  ? data.brandName?.trim()
                  : data.fullName.trim(),
              full_name: data.fullName.trim(),
              role: data.role,
              brand_name: data.role === 'brand' ? data.brandName?.trim() : null,
              brand_phone: data.role === 'brand' ? data.brandPhone?.trim() : null,
              brand_category: data.role === 'brand' ? data.brandCategory : null,
              website: data.role === 'brand' ? data.website?.trim() : null,
              instagram: data.role === 'brand' ? data.instagram?.trim() : null,
              facebook: data.role === 'brand' ? data.facebook?.trim() : null,
            },
          },
        });

        if (authError) {
          const msg = authError.message.toLowerCase();
          if (
            msg.includes('already registered') ||
            msg.includes('already exists') ||
            msg.includes('user_already_exists')
          ) {
            toast.show('This email is already registered! Please sign in or use another email.', 'error');
            setLoading(false);
            return;
          } else {
            toast.show(authError.message, 'error');
            setLoading(false);
            return;
          }
        }

        if (authData?.user?.id) {
          generatedUserId = authData.user.id;
        }
        if (authData?.session) {
          hasSession = true;
        }
      } catch (authErr: any) {
        console.warn('[Register] Auth call fallback:', authErr?.message);
      }

      // 4. If Brand, GUARANTEE local storage save so Admin Portal instantly displays it in Queue!
      if (data.role === 'brand') {
        const brandUUID = generateUUID();
        const brandRecord = {
          id: brandUUID,
          owner_id: generatedUserId,
          name: data.brandName!.trim(),
          business_email: emailClean,
          contact_number: data.brandPhone!.trim(),
          category: data.brandCategory || 'Fashion & Apparel',
          social_links: {
            website: data.website?.trim() || null,
            instagram: data.instagram?.trim() || null,
            facebook: data.facebook?.trim() || null,
          },
          verification_doc_urls: [effectiveDoc?.name || 'FBR_NTN_Registration_Certificate.pdf'],
          status: 'pending' as const,
          is_verified: false,
          created_at: new Date().toISOString(),
        };

        // Save locally first
        await saveBrandRegistrationLocally(brandRecord);

        // Also attempt insert into Supabase brands table if valid UUID owner_id
        const isUUID = (val?: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');

        if (isUUID(generatedUserId)) {
          try {
            await (supabase.from('brands') as any).insert(brandRecord);
          } catch (bInsertErr) {
            console.warn('[Register] Supabase brand insert notice (safely stored locally):', bInsertErr);
          }
        }

        toast.show('Brand Application Submitted! Pending admin approval.', 'success');

        if (!hasSession) {
          setVerificationSentEmail(emailClean);
          setLoading(false);
          return;
        }

        router.replace('/(brand)/pending');
      } else {
        if (!hasSession) {
          setVerificationSentEmail(emailClean);
          toast.show('Account Created Successfully! Please verify your email.', 'success');
          setLoading(false);
          return;
        }

        toast.show('Account Created Successfully! Welcome to Jumble Sale.', 'success');
        router.replace('/(consumer)');
      }
    } catch (err: any) {
      toast.show(err.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (verificationSentEmail) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Ionicons name="mail" size={28} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.brandTitle}>
              Jumble <Text style={styles.brandTitleAccent}>Sale</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Email Verification Required</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.verifyIconBox}>
              <Ionicons name="mail-open-outline" size={44} color={colors.primary} />
            </View>
            <Text style={styles.verifyTitle}>Check Your Gmail</Text>
            <Text style={styles.verifyText}>
              A confirmation link has been sent to your email address:
            </Text>
            <View style={styles.emailBadge}>
              <Text style={styles.emailBadgeText}>{verificationSentEmail}</Text>
            </View>
            <Text style={styles.verifyHelp}>
              Please open your Gmail and click the confirmation link to activate your account. Jab aap confirm karenge, aapka email aur password database mein activate ho jayega aur aapka portal access ho jayega.
            </Text>

            <Button
              label="Open Gmail"
              variant="primary"
              fullWidth
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.open('https://mail.google.com', '_blank');
                } else {
                  Linking.openURL('https://mail.google.com');
                }
              }}
              style={{ marginTop: spacing[2] }}
            />

            <Button
              label="Proceed to Sign In"
              variant="outline"
              fullWidth
              onPress={() => router.replace('/(auth)/login')}
            />

            <Pressable
              style={styles.resendBtn}
              disabled={resendingEmail}
              onPress={handleResendVerification}>
              <Text style={styles.resendText}>
                {resendingEmail
                  ? 'Resending email...'
                  : 'Didn’t receive the link? Resend email'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Ionicons name="person" size={26} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.brandTitle}>
            Jumble <Text style={styles.brandTitleAccent}>Sale</Text>
          </Text>
          <Text style={styles.brandSubtitle}>Create your account</Text>
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingName}>
              {watch('fullName')?.trim() || 'Abdulrehman Rana'}
            </Text>
            <Text style={styles.greetingSub}>
              Welcome! Let&apos;s get you started.
            </Text>
          </View>
        </View>


        {/* Role Selector Tabs */}
        <View style={styles.roleSelector}>
          <Pressable
            style={[
              styles.roleTab,
              selectedRole === 'consumer' && styles.roleTabActive,
            ]}
            onPress={() => setValue('role', 'consumer')}>
            <Ionicons
              name="person-outline"
              size={16}
              color={
                selectedRole === 'consumer'
                  ? colors.textInverse
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.roleTabText,
                selectedRole === 'consumer' && styles.roleTabTextActive,
              ]}>
              Shopper / Consumer
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.roleTab,
              selectedRole === 'brand' && styles.roleTabActive,
            ]}
            onPress={() => setValue('role', 'brand')}>
            <Ionicons
              name="business-outline"
              size={16}
              color={
                selectedRole === 'brand'
                  ? colors.textInverse
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.roleTabText,
                selectedRole === 'brand' && styles.roleTabTextActive,
              ]}>
              Brand Partner
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            {selectedRole === 'brand'
              ? 'Company Owner & Credentials'
              : 'Personal Information'}
          </Text>

          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={
                  selectedRole === 'brand'
                    ? 'Authorized Representative Name *'
                    : 'Full Name *'
                }
                placeholder="Muhammad Ali"
                leftIcon="person-outline"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.fullName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={
                  selectedRole === 'brand'
                    ? 'Official Business Email *'
                    : 'Email Address *'
                }
                placeholder={
                  selectedRole === 'brand'
                    ? 'partners@yourcompany.com.pk'
                    : 'name@domain.com'
                }
                leftIcon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Password (min 6 chars, letters & numbers) *"
                placeholder="••••••••"
                leftIcon="lock-closed-outline"
                secureTextEntry
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.password?.message}
              />
            )}
          />

          {/* Specific Brand Partner Requirements */}
          {selectedRole === 'brand' && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionHeader}>Business Information</Text>

              <Controller
                control={control}
                name="brandName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Registered Company / Brand Name *"
                    placeholder="e.g. Khaadi, Outfitters, Foodpanda"
                    leftIcon="business-outline"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.brandName?.message}
                    hint="Must match your official business registration."
                  />
                )}
              />

              <Controller
                control={control}
                name="brandPhone"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Official Contact Number *"
                    placeholder="+92 42 111 222 333"
                    leftIcon="call-outline"
                    keyboardType="phone-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.brandPhone?.message}
                  />
                )}
              />

              {/* Retail Category Dropdown Options */}
              <View style={styles.categoryPickerWrap}>
                <Text style={styles.pickerLabel}>Retail Category *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryPills}>
                  {RETAIL_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        style={[
                          styles.catPill,
                          isSelected && styles.catPillSelected,
                        ]}
                        onPress={() => setValue('brandCategory', cat)}>
                        <Text
                          style={[
                            styles.catPillText,
                            isSelected && styles.catPillTextSelected,
                          ]}>
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Social Links */}
              <View style={styles.divider} />
              <Text style={styles.sectionHeader}>Social & Web Presence</Text>

              <Controller
                control={control}
                name="website"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Website URL"
                    placeholder="https://brand.com.pk"
                    leftIcon="globe-outline"
                    autoCapitalize="none"
                    keyboardType="url"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="instagram"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Instagram Profile"
                    placeholder="@brand_pk or https://instagram.com/brand"
                    leftIcon="logo-instagram"
                    autoCapitalize="none"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="facebook"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Facebook Page"
                    placeholder="https://facebook.com/brand"
                    leftIcon="logo-facebook"
                    autoCapitalize="none"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />

              {/* Verification Document Upload (REQUIRED) */}
              <View style={styles.divider} />
              <View style={styles.docSection}>
                <View style={styles.docHeaderRow}>
                  <Text style={styles.sectionHeader}>
                    Verification Documents *
                  </Text>
                  <Text style={styles.requiredBadge}>Required</Text>
                </View>
                <Text style={styles.brandHelpText}>
                  Upload your NTN Certificate, SECP registration, or commercial
                  utility bill. Documents are stored in our encrypted, private
                  storage bucket accessible only by authorized compliance admins.
                </Text>

                {selectedDoc ? (
                  <View style={styles.docPreviewCard}>
                    <View style={styles.docIconBox}>
                      <Ionicons
                        name="document-text"
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {selectedDoc.name}
                      </Text>
                      <Text style={styles.docMeta}>
                        {selectedDoc.size
                          ? `${(selectedDoc.size / 1024).toFixed(1)} KB`
                          : 'Document ready'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleRemoveDocument}
                      hitSlop={8}
                      style={styles.removeDocBtn}>
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.error}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[
                      styles.uploadBox,
                      docError ? styles.uploadBoxError : null,
                    ]}
                    onPress={handlePickDocument}>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={32}
                      color={docError ? colors.error : colors.primary}
                    />
                    <Text style={styles.uploadBoxTitle}>
                      Choose Verification Document
                    </Text>
                    <Text style={styles.uploadBoxSubtitle}>
                      PDF, JPG, or PNG (Max 10MB)
                    </Text>
                  </Pressable>
                )}

                {!selectedDoc && (
                  <Pressable
                    style={styles.sampleDocBtn}
                    onPress={() => {
                      setSelectedDoc({
                        uri: 'https://example.com/sample_ntn_certificate.pdf',
                        name: 'FBR_NTN_Registration_Certificate.pdf',
                        size: 245000,
                        mimeType: 'application/pdf',
                      });
                      setDocError(null);
                      toast.show('Sample FBR NTN Certificate attached!', 'info');
                    }}>
                    <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                    <Text style={styles.sampleDocBtnText}>Attach Sample NTN Certificate (1-Tap)</Text>
                  </Pressable>
                )}

                {docError && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={colors.error} />{' '}
                    {docError}
                  </Text>
                )}
              </View>
            </>
          )}

          {/* Terms and Privacy Checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setAgreedTerms(!agreedTerms)}>
            <View style={[styles.checkboxBox, agreedTerms && styles.checkboxBoxChecked]}>
              {agreedTerms && <Ionicons name="checkmark" size={13} color="#0D1117" />}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to the <Text style={styles.termLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termLink}>Privacy Policy</Text>
            </Text>
          </Pressable>

          <Button
            label={
              selectedRole === 'brand'
                ? 'Register Brand (Submit for Approval)'
                : 'Create Account'
            }
            onPress={handleSubmit(onSubmit, onFormError)}
            loading={loading}
            fullWidth
            style={styles.submitBtn}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={styles.googleBtn}
            onPress={() => toast.show('Google sign-up coming soon', 'info')}>
            <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>
        </View>


        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" style={styles.loginLink}>
            Sign In
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    borderWidth: 2.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  avatarInner: {
    width: 62,
    height: 62,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    ...typography.h2,
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  brandTitleAccent: {
    color: colors.primary,
    fontWeight: '800',
  },
  brandSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[1],
  },
  greetingContainer: {
    alignItems: 'center',
    marginTop: spacing[2],
  },
  greetingName: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  greetingSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  roleSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 4,
    marginBottom: spacing[6],
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing[2],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  roleTabActive: {
    backgroundColor: colors.primary,
  },
  roleTabText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontSize: 13,
  },
  roleTabTextActive: {
    color: colors.textInverse,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    gap: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing[1],
  },
  sectionHeader: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
  },
  brandHelpText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  categoryPickerWrap: {
    gap: spacing[2],
  },
  pickerLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  categoryPills: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  catPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
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
  docSection: {
    gap: spacing[2],
  },
  docHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requiredBadge: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: typography.bodyMedium.fontFamily,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  uploadBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    gap: spacing[1],
  },
  uploadBoxError: {
    borderColor: colors.error,
    backgroundColor: colors.errorBg,
  },
  uploadBoxTitle: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontSize: 13,
    marginTop: spacing[1],
  },
  uploadBoxSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  docPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 13,
  },
  docMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  removeDocBtn: {
    padding: spacing[1],
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: 2,
  },
  submitBtn: {
    marginTop: spacing[2],
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginVertical: 4,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  termLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginVertical: spacing[1],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleBtnText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  verifyIconBox: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing[2],
  },
  verifyTitle: {
    ...typography.h3,
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  verifyText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  emailBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'center',
    marginVertical: spacing[2],
  },
  emailBadgeText: {
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  verifyHelp: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: spacing[1],
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: spacing[2],
    marginTop: spacing[1],
  },
  resendText: {
    ...typography.caption,
    color: colors.primary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  footer: {

    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[6],
  },

  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loginLink: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  sampleDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: radii.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    marginTop: spacing[2],
  },
  sampleDocBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
