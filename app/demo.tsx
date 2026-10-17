import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';

import {
  Badge,
  BrandChip,
  Button,
  CategoryChip,
  DealCard,
  DealCardSkeleton,
  EmptyState,
  Header,
  Input,
  Modal,
  Skeleton,
  TabBar,
  useToast,
} from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

const demoSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type DemoForm = z.infer<typeof demoSchema>;

const TAB_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home-outline' as const, iconActive: 'home' as const },
  { key: 'search', label: 'Search', icon: 'search-outline' as const, iconActive: 'search' as const },
  { key: 'saved', label: 'Saved', icon: 'heart-outline' as const, iconActive: 'heart' as const },
  { key: 'profile', label: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
];

export default function DesignSystemDemoScreen() {
  const router = useRouter();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [category, setCategory] = useState('Fashion');
  const [brand, setBrand] = useState('Khaadi');
  const [liked, setLiked] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DemoForm>({
    resolver: zodResolver(demoSchema),
    defaultValues: { email: '' },
  });

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title="Jumble Sale"
        subtitle="Design System Component Showcase"
        onBack={() => router.back()}
        rightAction={
          <Pressable onPress={() => toast.show('Design system preview mode', 'info')} hitSlop={8}>
            <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        
        {/* Buttons */}
        <Section title="1. Buttons">
          <Row>
            <Button label="Primary" onPress={() => toast.show('Primary Button Tapped', 'success')} />
            <Button label="Outline" variant="outline" onPress={() => setModalOpen(true)} />
          </Row>
          <Row>
            <Button label="Ghost" variant="ghost" onPress={() => toast.show('Ghost Tapped', 'info')} />
            <Button label="Danger" variant="danger" onPress={() => toast.show('Danger Action', 'error')} />
            <Button label="Loading" loading />
          </Row>
        </Section>

        {/* Input with Zod Validation */}
        <Section title="2. Input (RHF + Zod Validation)">
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email Address"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon="mail-outline"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.email?.message}
              />
            )}
          />
          <Button
            label="Validate Input"
            onPress={handleSubmit(() => toast.show('Valid email input!', 'success'))}
          />
        </Section>

        {/* Chips */}
        <Section title="3. Chips (Category & Brand)">
          <Text style={styles.subLabel}>Category Chips:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {['Fashion', 'Electronics', 'Food & Dining', 'Beauty', 'Grocery'].map((cat) => (
              <CategoryChip
                key={cat}
                label={cat}
                icon="pricetag-outline"
                selected={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </ScrollView>

          <Text style={styles.subLabel}>Brand Chips:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {['Khaadi', 'Outfitters', 'Gul Ahmed', 'Sapphire', 'Ideas'].map((b) => (
              <BrandChip
                key={b}
                name={b}
                selected={brand === b}
                onPress={() => setBrand(b)}
              />
            ))}
          </ScrollView>
        </Section>

        {/* Badges */}
        <Section title="4. Badges">
          <Row wrap>
            <Badge label="50% OFF" variant="deal" />
            <Badge label="Approved" variant="success" />
            <Badge label="Pending" variant="warning" />
            <Badge label="Rejected" variant="error" />
            <Badge label="AI Draft" variant="primary" />
          </Row>
        </Section>

        {/* Deal Card */}
        <Section title="5. Deal Card">
          <DealCard
            brandName={brand}
            title="Flat 50% Off Lawn Collection & Winter Apparel — Limited Time"
            discountLabel="50% OFF"
            expiresLabel="Ends in 3 days"
            liked={liked}
            onToggleLike={() => setLiked((v) => !v)}
            onPress={() => toast.show(`Deal selected for ${brand}`, 'info')}
          />
        </Section>

        {/* Skeletons */}
        <Section title="6. Skeleton Loader">
          <DealCardSkeleton />
          <Skeleton height={14} width="80%" style={{ marginTop: spacing[2] }} />
        </Section>

        {/* Empty State */}
        <Section title="7. Empty State">
          <EmptyState
            title="No Deals Found"
            description="Follow brands or broaden your search filter to discover promotions."
            actionLabel="Explore All Brands"
            onAction={() => toast.show('Navigating to Brand Explorer...', 'info')}
          />
        </Section>

        {/* Toast Triggers */}
        <Section title="8. Toast Notifications">
          <Row>
            <Button label="Success Toast" size="sm" onPress={() => toast.show('Saved to wishlist successfully!', 'success')} />
            <Button label="Error Toast" size="sm" variant="danger" onPress={() => toast.show('Failed to sync network data', 'error')} />
            <Button label="Info Toast" size="sm" variant="outline" onPress={() => toast.show('New promotion posted!', 'info')} />
          </Row>
        </Section>

        {/* TabBar Preview */}
        <Section title="9. TabBar Component Preview">
          <View style={styles.tabPreview}>
            <TabBar items={TAB_ITEMS} activeKey={activeTab} onChange={setActiveTab} />
          </View>
        </Section>

      </ScrollView>

      {/* Modal Demo */}
      <Modal visible={modalOpen} onClose={() => setModalOpen(false)} title="Design System Modal">
        <Text style={styles.modalBody}>
          This is a reusable modal matching the Jumble Sale design tokens (radii, shadows, fonts, colors).
        </Text>
        <Button label="Close Modal" onPress={() => setModalOpen(false)} fullWidth />
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <View style={[styles.row, wrap && styles.rowWrap]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing[4],
    paddingBottom: spacing[12],
    gap: spacing[6],
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: spacing[1],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  rowWrap: {
    alignItems: 'center',
  },
  chipRow: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  tabPreview: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing[4],
  },
});
