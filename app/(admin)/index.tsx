import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationCenterModal } from '@/components/notifications/NotificationCenterModal';
import { useToast } from '@/components/ui/Toast';
import {
  approveBrand,
  approveDeal,
  deleteBrand,
  deleteUser,
  fetchAdminStats,
  getBrandDocSignedUrl,
  reactivateBrand,
  rejectBrand,
  rejectDeal,
  resolveReport,
  setUserStatus,
  suspendBrand,
} from '@/lib/admin';
import { getAllActivities, type ActivityEvent } from '@/lib/activityStore';
import { getDeletedBrandIds, getLocalBrands } from '@/lib/brandStore';
import { deleteLocalDeal, getLocalBrandDeals, saveLocalDeal } from '@/lib/dealStore';
import { callServerGetBatchInteractions, connectInteractionsSSE } from '@/lib/serverApi';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type {
  AdminAuditLog,
  Brand,
  Deal,
  Profile,
  Report,
} from '@/types/database.types';
import { radii, spacing, typography } from '@/theme';
import {
  fetchRegisteredBrandsList,
  fetchBrandDetailedIntelligence,
  fetchRegisteredShoppersList,
  fetchUserDetailedIntelligence,
  fetchAppActivityOverview,
  type AdminBrandItem,
  type AdminUserItem,
  type BrandDetailedIntelligence,
  type UserDetailedIntelligence,
  type AppActivityMetrics,
} from '@/lib/adminAnalytics';
import { AdminBrandsSection } from '@/components/admin/AdminBrandsSection';
import { BrandDetailDrawer } from '@/components/admin/BrandDetailDrawer';
import { AdminUsersSection } from '@/components/admin/AdminUsersSection';
import { UserDetailDrawer } from '@/components/admin/UserDetailDrawer';
import { AdminAppActivitySection } from '@/components/admin/AdminAppActivitySection';
import { AdminGrowthToolsSection } from '@/components/admin/AdminGrowthToolsSection';
import { getLocalCategories } from '@/lib/categoryStore';
import { getAllOrdersForAdmin } from '@/lib/orderStore';
import type { Category } from '@/types/database.types';

// ─── NEON GREEN & BLACK THEME PALETTE ─────────────────────────────
const adminTheme = {
  bgApp: '#090A0D',
  bgSidebar: '#0E1015',
  bgCard: '#13151C',
  bgCardHover: '#181B24',
  bgInput: '#151821',
  border: '#1F2330',
  borderLight: '#2A3042',
  neon: '#00FF66',
  neonSecondary: '#10B981',
  neonGlow: 'rgba(0, 255, 102, 0.22)',
  neonLight: 'rgba(0, 255, 102, 0.12)',
  neonText: '#00FF66',
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

type AdminTab =
  | 'overview'
  | 'directory'
  | 'brands'
  | 'users'
  | 'queues'
  | 'brands_queue'
  | 'deals_queue'
  | 'growth_tools'
  | 'reports'
  | 'activity_monitoring'
  | 'management'
  | 'audit_log'
  | 'more';

interface AdminStats {
  totalUsers: number;
  totalBrands: number;
  pendingBrands: number;
  totalDeals: number;
  pendingDeals: number;
  activeDeals: number;
  pendingReports: number;
}

export default function AdminDashboardScreen() {
  const { signOut } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [directorySubTab, setDirectorySubTab] = useState<'brands' | 'users'>('brands');
  const [queuesSubTab, setQueuesSubTab] = useState<'brands' | 'deals'>('brands');
  const [moreSubTab, setMoreSubTab] = useState<'menu' | 'reports' | 'audit_log' | 'activity'>('menu');
  const [managementSubTab, setManagementSubTab] = useState<'users' | 'brands'>('users');
  const [reportsFilter, setReportsFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('pending');

  // Brand Deep-Dive Drawer State
  const [selectedBrandIntelligence, setSelectedBrandIntelligence] = useState<BrandDetailedIntelligence | null>(null);
  const [loadingBrandIntelligence, setLoadingBrandIntelligence] = useState(false);
  const [brandDrawerVisible, setBrandDrawerVisible] = useState(false);

  // User Deep-Dive Drawer State
  const [selectedUserIntelligence, setSelectedUserIntelligence] = useState<UserDetailedIntelligence | null>(null);
  const [loadingUserIntelligence, setLoadingUserIntelligence] = useState(false);
  const [userDrawerVisible, setUserDrawerVisible] = useState(false);

  // Reason Modal State
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonModalTitle, setReasonModalTitle] = useState('');
  const [reasonModalPrompt, setReasonModalPrompt] = useState('');
  const [reasonPresets, setReasonPresets] = useState<string[]>([]);
  const [reasonInput, setReasonInput] = useState('');
  const [reasonConfirmAction, setReasonConfirmAction] = useState<((reason: string) => Promise<void>) | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Brand Directory & Posts state
  const [selectedDirectoryBrand, setSelectedDirectoryBrand] = useState<Brand | null>(null);
  const [directoryBrandDeals, setDirectoryBrandDeals] = useState<Deal[]>([]);
  const [loadingDirectoryDeals, setLoadingDirectoryDeals] = useState(false);

  // Overview quick toggle
  const [overviewFeedMode, setOverviewFeedMode] = useState<'logs' | 'activities'>('logs');

  // Dynamic batch interactions for live likes and comments
  const [dynamicLikesMap, setDynamicLikesMap] = useState<Record<string, number>>({});
  const [dynamicCommentsMap, setDynamicCommentsMap] = useState<Record<string, number>>({});

  const { data: adminBatchInteractions } = useQuery<
    Record<string, { likes_count: number; comments_count: number }> | null
  >({
    queryKey: ['admin-batch-interactions'],
    queryFn: () => callServerGetBatchInteractions(),
    refetchInterval: 12000,
    staleTime: 5000,
  });

  useEffect(() => {
    const unsubscribe = connectInteractionsSSE((event) => {
      if (event.deal_id) {
        if (typeof event.likes_count === 'number') {
          setDynamicLikesMap((prev) => ({ ...prev, [event.deal_id!]: event.likes_count! }));
        }
        if (typeof event.comments_count === 'number') {
          setDynamicCommentsMap((prev) => ({ ...prev, [event.deal_id!]: event.comments_count! }));
        }
      }
    });
    return unsubscribe;
  }, []);

  // Instagram-style navigation reset function (backs out of all open inspection drawers & dialogs to first page)
  const handleTabResetOrSwitch = (targetTab: AdminTab) => {
    // 1. Close any open deep-dive drawers or inspection views
    setBrandDrawerVisible(false);
    setUserDrawerVisible(false);
    setSelectedBrandIntelligence(null);
    setSelectedUserIntelligence(null);
    setSelectedDirectoryBrand(null);
    setReasonModalVisible(false);
    setNotificationsModalOpen(false);
    setMobileSidebarOpen(false);

    // 2. Reset search and sub-tab filters
    setSearchQuery('');
    setManagementSubTab('users');
    setReportsFilter('pending');

    // Sub-tab synchronization when targeted specifically from sidebar
    if (targetTab === 'brands') {
      setDirectorySubTab('brands');
      setActiveTab('directory');
      return;
    }
    if (targetTab === 'users' || targetTab === 'management') {
      setDirectorySubTab('users');
      setActiveTab('directory');
      return;
    }
    if (targetTab === 'brands_queue') {
      setQueuesSubTab('brands');
      setActiveTab('queues');
      return;
    }
    if (targetTab === 'deals_queue') {
      setQueuesSubTab('deals');
      setActiveTab('queues');
      return;
    }
    if (targetTab === 'reports') {
      setMoreSubTab('reports');
      setActiveTab('more');
      return;
    }
    if (targetTab === 'audit_log') {
      setMoreSubTab('audit_log');
      setActiveTab('more');
      return;
    }
    if (targetTab === 'activity_monitoring') {
      setMoreSubTab('activity');
      setActiveTab('more');
      return;
    }
    if (targetTab === 'more') {
      setMoreSubTab('menu');
      setActiveTab('more');
      return;
    }

    // 3. Switch to selected tab
    setActiveTab(targetTab);
  };

  // ─── 1. Stats Query (Pure SQL COUNT(*) from Database, No Dummy Fallbacks) ──
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      return await fetchAdminStats();
    },
  });

  // ─── Pure DB Registered Brands Monitoring Query ───────────────────
  const {
    data: registeredBrands = [],
    isLoading: loadingRegisteredBrands,
    refetch: refetchRegisteredBrands,
  } = useQuery<AdminBrandItem[]>({
    queryKey: ['admin-registered-brands'],
    queryFn: async () => {
      return await fetchRegisteredBrandsList();
    },
    enabled: true, // Always ready for instant global omnibar search
  });

  // ─── Pure DB Registered Shoppers Monitoring Query ─────────────────
  const {
    data: registeredShoppers = [],
    isLoading: loadingRegisteredShoppers,
    refetch: refetchRegisteredShoppers,
  } = useQuery<AdminUserItem[]>({
    queryKey: ['admin-registered-shoppers'],
    queryFn: async () => {
      return await fetchRegisteredShoppersList();
    },
    enabled: true, // Always ready for instant global omnibar search
  });

  // ─── Pure DB App System Activity Overview Query ───────────────────
  const {
    data: appActivityMetrics,
    isLoading: loadingAppActivity,
    refetch: refetchAppActivity,
  } = useQuery<AppActivityMetrics>({
    queryKey: ['admin-app-activity-metrics'],
    queryFn: async () => {
      return await fetchAppActivityOverview();
    },
    enabled: activeTab === 'activity_monitoring' || activeTab === 'more' || activeTab === 'overview',
  });

  // ─── 2. Pending Brands Queue Query ────────────────────────────────
  const {
    data: pendingBrands = [],
    isLoading: loadingBrands,
    refetch: refetchBrands,
  } = useQuery<Brand[]>({
    queryKey: ['admin-pending-brands'],
    queryFn: async () => {
      const localBrands = await getLocalBrands();
      const localPending = localBrands.filter((b) => b.status === 'pending');
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) return localPending;

        const serverPending = (data as Brand[]) ?? [];
        const merged = [...localPending];
        for (const sp of serverPending) {
          if (!merged.some((m) => m.id === sp.id || m.name.toLowerCase() === sp.name.toLowerCase())) {
            merged.push(sp);
          }
        }
        return merged;
      } catch {
        return localPending;
      }
    },
    enabled: activeTab === 'brands_queue' || activeTab === 'queues' || activeTab === 'overview',
  });

  // ─── 3. Pending Deals Queue Query ─────────────────────────────────
  const {
    data: pendingDeals = [],
    isLoading: loadingDeals,
    refetch: refetchDeals,
  } = useQuery<(Deal & { brand?: Brand })[]>({
    queryKey: ['admin-pending-deals'],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals();
      const localPending = localDeals.filter((d) => d.status === 'pending');
      const allLocalBrands = await getLocalBrands();
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, brand:brands(*)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          return localPending.map((d) => ({
            ...d,
            brand: (allLocalBrands.find((b) => b.id === d.brand_id) || undefined) as any,
          }));
        }

        const serverPending = (data as (Deal & { brand?: Brand })[]) ?? [];
        const merged: (Deal & { brand?: Brand })[] = [
          ...localPending.map((d) => ({
            ...d,
            brand: (allLocalBrands.find((b) => b.id === d.brand_id) || undefined) as any,
          })),
        ];

        for (const sp of serverPending) {
          if (!merged.some((m) => m.id === sp.id)) {
            merged.push(sp);
          }
        }
        return merged;
      } catch {
        return localPending.map((d) => ({
          ...d,
          brand: (allLocalBrands.find((b) => b.id === d.brand_id) || undefined) as any,
        }));
      }
    },
    enabled: activeTab === 'deals_queue' || activeTab === 'queues' || activeTab === 'overview',
  });

  // ─── 4. Management: Users & Brands Queries ────────────────────────
  const {
    data: allUsers = [],
    isLoading: loadingUsers,
    refetch: refetchUsers,
  } = useQuery<Profile[]>({
    queryKey: ['admin-all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Profile[]) ?? [];
    },
    enabled: activeTab === 'management',
  });

  const {
    data: allBrands = [],
    isLoading: loadingAllBrands,
    refetch: refetchAllBrands,
  } = useQuery<Brand[]>({
    queryKey: ['admin-all-brands'],
    queryFn: async () => {
      const deletedIds = await getDeletedBrandIds();
      const localBrands = await getLocalBrands();
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return localBrands.filter((b) => !deletedIds.includes(b.id));

        const serverBrands = ((data as Brand[]) ?? []).filter((b) => !deletedIds.includes(b.id));
        const merged: Brand[] = [];

        // Server brands take priority for real-time database link
        for (const sb of serverBrands) {
          merged.push(sb);
        }

        // Add any local brand that isn't already on server and not deleted
        for (const lb of localBrands) {
          if (!deletedIds.includes(lb.id) && !merged.some((m) => m.id === lb.id || m.name.toLowerCase() === lb.name.toLowerCase())) {
            merged.push(lb);
          }
        }
        return merged;
      } catch {
        return localBrands.filter((b) => !deletedIds.includes(b.id));
      }
    },
    enabled: activeTab === 'management' || activeTab === 'directory' || activeTab === 'overview' || activeTab === 'growth_tools',
  });

  // ─── 4b. Growth Tools: All Deals, Categories, Orders Queries ────────
  const {
    data: allDealsForAdmin = [],
    refetch: refetchAllDeals,
  } = useQuery<Deal[]>({
    queryKey: ['admin-growth-all-deals'],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals();
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, brand:brands(*)')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          const serverIds = new Set(data.map((d: any) => d.id));
          const missingLocal = localDeals.filter((ld) => !serverIds.has(ld.id));
          return [...(data as Deal[]), ...missingLocal];
        }
      } catch {}
      return localDeals;
    },
    enabled: true, // Always ready for instant global omnibar search
  });

  const {
    data: adminCategories = [],
    refetch: refetchAdminCategories,
  } = useQuery<Category[]>({
    queryKey: ['admin-categories-list'],
    queryFn: async () => {
      return await getLocalCategories();
    },
    enabled: true, // Always ready for instant global omnibar search
  });

  const {
    data: adminOrders = [],
  } = useQuery<any[]>({
    queryKey: ['admin-orders-list'],
    queryFn: async () => {
      try {
        const { data } = await (supabase.from('attributed_orders') as any)
          .select('*')
          .order('created_at', { ascending: false });
        if (data && data.length > 0) return data;
      } catch {}
      return await getAllOrdersForAdmin();
    },
    enabled: true, // Always ready for instant global omnibar search
  });

  // ─── 5. Reports Query ─────────────────────────────────────────────
  const {
    data: allReports = [],
    isLoading: loadingReports,
    refetch: refetchReports,
  } = useQuery<(Report & { deal?: Deal; reporter?: Profile })[]>({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, deal:deals(*), reporter:profiles!reporter_id(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
    enabled: activeTab === 'reports' || activeTab === 'more',
  });

  // ─── 6. Audit Log Query ───────────────────────────────────────────
  const {
    data: auditLogs = [],
    isLoading: loadingAudit,
    refetch: refetchAudit,
  } = useQuery<(AdminAuditLog & { admin?: Profile })[]>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*, admin:profiles!admin_id(display_name, email)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any) ?? [];
    },
    enabled: activeTab === 'audit_log' || activeTab === 'more' || activeTab === 'overview',
  });

  // ─── 7. System Activity & Engagement Monitoring ───────────────────
  const {
    data: systemActivities = [],
    isLoading: loadingActivities,
    refetch: refetchActivities,
  } = useQuery<ActivityEvent[]>({
    queryKey: ['admin-system-activities'],
    queryFn: async () => {
      return await getAllActivities();
    },
    enabled: activeTab === 'activity_monitoring' || activeTab === 'more' || activeTab === 'overview',
  });

  // Load Brand Deals for Directory Inspection
  const loadBrandDeals = async (targetBrand: Brand) => {
    setSelectedDirectoryBrand(targetBrand);
    setLoadingDirectoryDeals(true);
    try {
      const localDeals = await getLocalBrandDeals(targetBrand.id);
      let serverDeals: Deal[] = [];
      try {
        const { data } = await supabase
          .from('deals')
          .select('*')
          .eq('brand_id', targetBrand.id)
          .order('created_at', { ascending: false });
        if (data) serverDeals = data as Deal[];
      } catch {}
      const merged = [...localDeals];
      for (const sd of serverDeals) {
        if (!merged.some((m) => m.id === sd.id)) {
          merged.push(sd);
        }
      }
      setDirectoryBrandDeals(merged);
    } catch (e) {
      console.warn('[Admin] Load brand deals notice:', e);
    } finally {
      setLoadingDirectoryDeals(false);
    }
  };

  const handleInspectBrand = async (brand: AdminBrandItem | Brand) => {
    setBrandDrawerVisible(true);
    setLoadingBrandIntelligence(true);
    try {
      const intel = await fetchBrandDetailedIntelligence(brand.id, brand.name);
      setSelectedBrandIntelligence(intel);
    } catch (err: any) {
      toast.show(err.message || 'Failed to load brand data', 'error');
    } finally {
      setLoadingBrandIntelligence(false);
    }
  };

  const handleInspectUser = async (targetUser: AdminUserItem | Profile) => {
    setUserDrawerVisible(true);
    setLoadingUserIntelligence(true);
    try {
      const intel = await fetchUserDetailedIntelligence(targetUser.id);
      setSelectedUserIntelligence(intel);
    } catch (err: any) {
      toast.show(err.message || 'Failed to load user activity', 'error');
    } finally {
      setLoadingUserIntelligence(false);
    }
  };

  // ─── GLOBAL ADMIN OMNISEARCH / COMMAND PALETTE ENGINE ──────────────
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    // 1. Available Admin Quick Actions & Navigation
    const allActions: {
      id: string;
      title: string;
      subtitle: string;
      category: 'action';
      icon: keyof typeof Ionicons.glyphMap;
      iconColor: string;
      iconBg: string;
      keywords: string[];
      onPress: () => void;
    }[] = [
      {
        id: 'act-notifications',
        title: 'Notification Center',
        subtitle: 'View admin alerts, messages & notification logs',
        category: 'action',
        icon: 'notifications-outline',
        iconColor: '#A855F7',
        iconBg: 'rgba(168, 85, 247, 0.15)',
        keywords: ['notification', 'notifications', 'alert', 'alerts', 'center', 'inbox', 'bell', 'messages'],
        onPress: () => {
          setNotificationsModalOpen(true);
          setSearchQuery('');
        },
      },
      {
        id: 'act-broadcast',
        title: 'Broadcast Announcement',
        subtitle: 'Send real-time push notification to all users and brands',
        category: 'action',
        icon: 'megaphone-outline',
        iconColor: '#F59E0B',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        keywords: ['broadcast', 'announcement', 'send alert', 'blast', 'push notification'],
        onPress: () => {
          handleTabResetOrSwitch('growth_tools');
          setSearchQuery('');
        },
      },
      {
        id: 'act-overview',
        title: 'Overview Dashboard',
        subtitle: 'Platform statistics, KPIs, active deals and performance',
        category: 'action',
        icon: 'grid-outline',
        iconColor: adminTheme.neon,
        iconBg: adminTheme.neonLight,
        keywords: ['overview', 'dashboard', 'stats', 'kpi', 'analytics', 'home', 'main'],
        onPress: () => {
          handleTabResetOrSwitch('overview');
          setSearchQuery('');
        },
      },
      {
        id: 'act-brands-dir',
        title: 'Registered Brands Directory',
        subtitle: `Manage ${registeredBrands.length} registered brand partners`,
        category: 'action',
        icon: 'business-outline',
        iconColor: adminTheme.neon,
        iconBg: adminTheme.neonLight,
        keywords: [
          'registered brands',
          'register brand',
          'registered',
          'brands',
          'brand directory',
          'partners',
          'sellers',
          'stores',
        ],
        onPress: () => {
          handleTabResetOrSwitch('brands');
          setSearchQuery('');
        },
      },
      {
        id: 'act-shoppers-dir',
        title: 'Registered Shoppers Directory',
        subtitle: `Manage ${registeredShoppers.length} consumer shopper accounts`,
        category: 'action',
        icon: 'people-outline',
        iconColor: '#10B981',
        iconBg: 'rgba(16, 185, 129, 0.15)',
        keywords: [
          'registered shoppers',
          'registered users',
          'registered',
          'shoppers',
          'users',
          'customers',
          'consumers',
          'user directory',
          'accounts',
        ],
        onPress: () => {
          handleTabResetOrSwitch('users');
          setSearchQuery('');
        },
      },
      {
        id: 'act-brands-queue',
        title: 'Brand Approvals Queue',
        subtitle: `${stats?.pendingBrands || 0} brand partner registration requests pending`,
        category: 'action',
        icon: 'business',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59, 130, 246, 0.15)',
        keywords: ['brand approvals', 'brand queue', 'pending brands', 'partner requests', 'queue'],
        onPress: () => {
          handleTabResetOrSwitch('brands_queue');
          setSearchQuery('');
        },
      },
      {
        id: 'act-deals-queue',
        title: 'Deal Verifications Queue',
        subtitle: `${stats?.pendingDeals || 0} deals pending verification and approval`,
        category: 'action',
        icon: 'pricetag-outline',
        iconColor: '#F59E0B',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        keywords: ['deal verifications', 'deals queue', 'pending deals', 'verify deal', 'queue'],
        onPress: () => {
          handleTabResetOrSwitch('deals_queue');
          setSearchQuery('');
        },
      },
      {
        id: 'act-sponsored-deals',
        title: 'Sponsored Deals & Hero Pin',
        subtitle: 'Pin promotions to top position #1 in Pakistan Hero Slider',
        category: 'action',
        icon: 'star-outline',
        iconColor: adminTheme.neon,
        iconBg: adminTheme.neonLight,
        keywords: ['sponsored', 'pin', 'hero slider', 'promoted', 'monetization', 'boost'],
        onPress: () => {
          handleTabResetOrSwitch('growth_tools');
          setSearchQuery('');
        },
      },
      {
        id: 'act-categories',
        title: 'Categories & Festivals Manager',
        subtitle: 'Add, update or delete shopping marketplace categories',
        category: 'action',
        icon: 'apps-outline',
        iconColor: '#A855F7',
        iconBg: 'rgba(168, 85, 247, 0.15)',
        keywords: ['categories', 'category', 'festivals', 'shopping categories', 'departments'],
        onPress: () => {
          handleTabResetOrSwitch('growth_tools');
          setSearchQuery('');
        },
      },
      {
        id: 'act-csv-export',
        title: 'CSV Data Export',
        subtitle: 'Export Brands, Deals, and Attributed Orders as CSV spreadsheet',
        category: 'action',
        icon: 'download-outline',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59, 130, 246, 0.15)',
        keywords: ['export', 'csv', 'download', 'excel', 'backup', 'data export', 'orders'],
        onPress: () => {
          handleTabResetOrSwitch('growth_tools');
          setSearchQuery('');
        },
      },
      {
        id: 'act-link-quality',
        title: 'Quality & Link Health Scanner',
        subtitle: 'Scan deal links and promotional images for broken URLs',
        category: 'action',
        icon: 'shield-checkmark-outline',
        iconColor: '#10B981',
        iconBg: 'rgba(16, 185, 129, 0.15)',
        keywords: ['quality', 'scanner', 'broken links', 'image check', 'audit deals'],
        onPress: () => {
          handleTabResetOrSwitch('growth_tools');
          setSearchQuery('');
        },
      },
      {
        id: 'act-user-reports',
        title: 'User Reports & Safety Moderation',
        subtitle: `${stats?.pendingReports || 0} user moderation flags and reported deals`,
        category: 'action',
        icon: 'flag-outline',
        iconColor: adminTheme.error,
        iconBg: adminTheme.errorBg,
        keywords: ['reports', 'report', 'safety', 'flagged', 'abuse', 'spam', 'complaints'],
        onPress: () => {
          handleTabResetOrSwitch('reports');
          setSearchQuery('');
        },
      },
      {
        id: 'act-audit-trail',
        title: 'Audit Trail & Security Logs',
        subtitle: 'Live immutable record of administrative actions and approvals',
        category: 'action',
        icon: 'newspaper-outline',
        iconColor: adminTheme.neon,
        iconBg: adminTheme.neonLight,
        keywords: ['audit', 'audit trail', 'logs', 'security', 'operations', 'admin history'],
        onPress: () => {
          handleTabResetOrSwitch('audit_log');
          setSearchQuery('');
        },
      },
      {
        id: 'act-app-activity',
        title: 'App Activity & Live Engagement',
        subtitle: 'Shopper claims, brand post metrics, and traffic overview',
        category: 'action',
        icon: 'pulse-outline',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59, 130, 246, 0.15)',
        keywords: ['activity', 'app activity', 'traffic', 'claims', 'analytics', 'live metrics'],
        onPress: () => {
          handleTabResetOrSwitch('activity_monitoring');
          setSearchQuery('');
        },
      },
      {
        id: 'act-admin-settings',
        title: 'Admin Settings & Session',
        subtitle: 'Super Administrator credentials, active session & system info',
        category: 'action',
        icon: 'settings-outline',
        iconColor: adminTheme.neon,
        iconBg: adminTheme.neonLight,
        keywords: ['settings', 'admin settings', 'profile', 'session', 'system', 'root'],
        onPress: () => {
          handleTabResetOrSwitch('more');
          setSearchQuery('');
        },
      },
      {
        id: 'act-sign-out',
        title: 'Sign Out of Admin Portal',
        subtitle: 'End administrative session on this device',
        category: 'action',
        icon: 'log-out-outline',
        iconColor: adminTheme.error,
        iconBg: adminTheme.errorBg,
        keywords: ['sign out', 'logout', 'exit', 'disconnect'],
        onPress: () => {
          setSearchQuery('');
          signOut();
        },
      },
    ];

    // Helper relevance scoring function (Exact > Starts-with > Word starts-with > Keyword)
    const getRelevanceScore = (title: string, subtitle: string, keywords: string[]): number => {
      const t = title.toLowerCase();
      const sub = subtitle.toLowerCase();

      // 1. Exact match on title
      if (t === q) return 1000;

      // 2. Title starts with query (e.g. "Registered Brands" starts with "r" or "reg")
      if (t.startsWith(q)) return 850;

      // 3. Any word in the title starts with query
      const titleWords = t.split(/[\s&•\-_/]+/);
      if (titleWords.some((w) => w.startsWith(q))) return 700;

      // 4. Any keyword starts with query
      if (keywords.some((k) => k.toLowerCase().startsWith(q))) return 550;

      // 5. Any word in any keyword starts with query
      if (
        keywords.some((k) =>
          k
            .toLowerCase()
            .split(/[\s&•\-_/]+/)
            .some((w) => w.startsWith(q))
        )
      ) {
        return 450;
      }

      // If single letter query (e.g. "R"): DO NOT match random substrings in the middle of words!
      if (q.length === 1) return 0;

      // 6. Title contains query as substring
      if (t.includes(q)) return 250;

      // 7. Keyword contains query as substring
      if (keywords.some((k) => k.toLowerCase().includes(q))) return 150;

      // 8. Subtitle contains query as substring
      if (sub.includes(q)) return 50;

      return 0;
    };

    const scoredActions = allActions
      .map((act) => ({
        item: act,
        score: getRelevanceScore(act.title, act.subtitle, act.keywords),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    // 2. Matching Brands with scoring
    const scoredBrands = registeredBrands
      .map((b) => {
        const name = b.name.toLowerCase();
        const cat = (b.category || '').toLowerCase();
        let score = 0;
        if (name === q) score = 1000;
        else if (name.startsWith(q)) score = 850;
        else if (name.split(/[\s&•\-_/]+/).some((w) => w.startsWith(q))) score = 700;
        else if (cat.startsWith(q)) score = 400;
        else if (q.length > 1 && name.includes(q)) score = 250;
        else if (q.length > 1 && cat.includes(q)) score = 100;
        return { item: b, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.item);

    // 3. Matching Deals with scoring
    const scoredDeals = allDealsForAdmin
      .map((d) => {
        const title = (d.title || '').toLowerCase();
        const brandName = (d.brand?.name || '').toLowerCase();
        let score = 0;
        if (title.startsWith(q)) score = 800;
        else if (brandName.startsWith(q)) score = 750;
        else if (title.split(/[\s&•\-_/]+/).some((w) => w.startsWith(q))) score = 600;
        else if (q.length > 1 && title.includes(q)) score = 200;
        else if (q.length > 1 && brandName.includes(q)) score = 150;
        return { item: d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.item);

    // 4. Matching Users / Shoppers with scoring
    const scoredUsers = registeredShoppers
      .map((u) => {
        const name = (u.display_name || u.full_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        let score = 0;
        if (name === q) score = 1000;
        else if (name.startsWith(q)) score = 800;
        else if (name.split(/[\s&•\-_/]+/).some((w) => w.startsWith(q))) score = 600;
        else if (email.startsWith(q)) score = 500;
        else if (q.length > 1 && name.includes(q)) score = 200;
        else if (q.length > 1 && email.includes(q)) score = 150;
        return { item: u, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.item);

    const totalCount =
      scoredActions.length + scoredBrands.length + scoredDeals.length + scoredUsers.length;

    return {
      query: q,
      totalCount,
      actions: scoredActions,
      brands: scoredBrands,
      deals: scoredDeals,
      users: scoredUsers,
    };
  }, [searchQuery, registeredBrands, allDealsForAdmin, registeredShoppers, stats, signOut]);

  const handleToggleDealStatus = async (deal: Deal) => {
    const isSuspended = deal.status === 'suspended';
    const newStatus = isSuspended ? 'active' : 'suspended';

    confirmAction(
      isSuspended ? 'Reactivate Deal' : 'Suspend Promotion',
      isSuspended
        ? `Reactivate "${deal.title}" so it becomes live on the user feed again?`
        : `Suspend "${deal.title}"? It will immediately be hidden from consumers.`,
      isSuspended ? 'Reactivate Deal' : 'Suspend Post',
      async () => {
        try {
          await saveLocalDeal({ ...deal, status: newStatus });
          try {
            await (supabase.from('deals') as any).update({ status: newStatus }).eq('id', deal.id);
          } catch {}
          toast.show(
            isSuspended ? 'Deal reactivated live! ✅' : 'Deal suspended & hidden from shoppers.',
            'info'
          );
          if (selectedDirectoryBrand) {
            loadBrandDeals(selectedDirectoryBrand);
          }
          refetchStats();
          queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
        } catch (err: any) {
          toast.show(err.message || 'Action failed', 'error');
        }
      },
      !isSuspended
    );
  };

  const handleDeletePost = (deal: Deal) => {
    confirmAction(
      'Delete Promotion Permanently',
      `Permanently delete "${deal.title}" from the database and remove it from user feeds?`,
      'Delete Post',
      async () => {
        try {
          await deleteLocalDeal(deal.id);
          try {
            await (supabase.from('deals') as any).delete().eq('id', deal.id);
          } catch {}
          toast.show('Promotion deleted successfully.', 'success');
          if (selectedDirectoryBrand) {
            loadBrandDeals(selectedDirectoryBrand);
          }
          refetchStats();
          queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
        } catch (err: any) {
          toast.show(err.message || 'Delete failed', 'error');
        }
      },
      true
    );
  };

  // ─── Modal Helpers ────────────────────────────────────────────────
  // ─── Modal Helpers ────────────────────────────────────────────────
  const openReasonModal = (
    title: string,
    prompt: string,
    onConfirm: (reason: string) => Promise<void>,
    presets: string[] = []
  ) => {
    setReasonModalTitle(title);
    setReasonModalPrompt(prompt);
    setReasonPresets(presets);
    setReasonInput(presets[0] || 'Account suspended by platform administration.');
    setReasonConfirmAction(() => onConfirm);
    setReasonModalVisible(true);
  };

  const handleModalSubmit = async () => {
    if (!reasonInput.trim()) {
      toast.show('Please provide a reason before continuing.', 'warning');
      return;
    }
    if (!reasonConfirmAction) return;

    setModalLoading(true);
    try {
      await reasonConfirmAction(reasonInput.trim());
      setReasonModalVisible(false);
      setReasonInput('');
      setReasonPresets([]);
    } catch (err: any) {
      toast.show(err.message || 'Action failed', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const confirmAction = (
    title: string,
    message: string,
    confirmText: string,
    onConfirm: () => void | Promise<void>,
    isDestructive: boolean = false
  ) => {
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(`${title}\n\n${message}`)
          : true;
      if (confirmed) {
        onConfirm();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmText,
        style: isDestructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  };

  // ─── Brand Queue Actions ──────────────────────────────────────────
  const handleApproveBrand = async (brand: Brand) => {
    try {
      await approveBrand(brand.id, brand.name);
      toast.show(`Brand "${brand.name}" approved! ✅`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-pending-brands'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-brands'] });
      queryClient.invalidateQueries({ queryKey: ['my-brand'] });
      queryClient.invalidateQueries({ queryKey: ['my-brand-profile'] });
      await Promise.all([
        refetchBrands(),
        refetchStats(),
        refetchAllBrands(),
      ]);
    } catch (err: any) {
      toast.show(err.message || 'Approval failed', 'error');
    }
  };

  const handleRejectBrand = (brand: Brand) => {
    openReasonModal(
      'Reject Brand Application',
      `Specify official rejection reason for "${brand.name}". The brand owner will receive this feedback:`,
      async (reason) => {
        await rejectBrand(brand.id, brand.name, reason);
        toast.show(`Brand "${brand.name}" rejected.`, 'info');
        queryClient.invalidateQueries({ queryKey: ['admin-pending-brands'] });
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
        queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
        queryClient.invalidateQueries({ queryKey: ['admin-all-brands'] });
        refetchBrands();
        refetchStats();
        refetchAllBrands();
      },
      [
        'Invalid or unverifiable NTN / Tax certificate',
        'Duplicate brand partner registration',
        'Incomplete company legal documentation',
        'Trademark or identity copyright conflict',
        'Unreachable business contact information',
      ]
    );
  };

  const handleViewBrandDoc = async (docPath: string) => {
    try {
      const signedUrl = await getBrandDocSignedUrl(docPath);
      if (Platform.OS === 'web') {
        window.open(signedUrl, '_blank');
      } else {
        await Linking.openURL(signedUrl);
      }
    } catch (err: any) {
      toast.show(err.message || 'Could not open document', 'error');
    }
  };

  // ─── Deal Queue Actions ───────────────────────────────────────────
  const handleApproveDeal = (deal: Deal) => {
    confirmAction(
      'Approve Promotion',
      `Publish "${deal.title}" live onto the consumer marketplace?`,
      'Go Live ✅',
      async () => {
        try {
          await approveDeal(deal.id, deal.title);
          toast.show(`Deal "${deal.title}" is now live! 🚀`, 'success');
          queryClient.invalidateQueries({ queryKey: ['admin-pending-deals'] });
          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
          queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
          queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
          queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
          queryClient.invalidateQueries({ queryKey: ['deals-explore'] });
          refetchDeals();
          refetchStats();
        } catch (err: any) {
          toast.show(err.message || 'Approval failed', 'error');
        }
      }
    );
  };

  const handleRejectDeal = (deal: Deal) => {
    openReasonModal(
      'Reject Promotion',
      `Specify why "${deal.title}" is not approved for live consumer feed:`,
      async (reason) => {
        await rejectDeal(deal.id, deal.title, reason);
        toast.show(`Deal "${deal.title}" rejected.`, 'info');
        queryClient.invalidateQueries({ queryKey: ['admin-pending-deals'] });
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
        queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
        queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals-posts'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
        queryClient.invalidateQueries({ queryKey: ['deals-explore'] });
        refetchDeals();
        refetchStats();
      },
      [
        'Misleading discount rate or incorrect pricing',
        'Low resolution or blurry product image',
        'Missing or non-functional buy/destination link',
        'Expired sale promotion dates',
        'Inappropriate marketing claims or wording',
      ]
    );
  };

  // ─── User & Brand Management Actions ──────────────────────────────
  const handleToggleUserSuspension = (targetUser: Profile) => {
    const isCurrentlyActive = targetUser.is_active;
    if (isCurrentlyActive) {
      openReasonModal(
        'Suspend User Account',
        `Enter suspension reason for "${targetUser.email}":`,
        async (reason) => {
          await setUserStatus(targetUser.id, false, reason);
          toast.show(`User ${targetUser.email} suspended.`, 'info');
          refetchUsers();
          refetchStats();
        },
        [
          'Violation of platform community standards',
          'Spamming comments or interaction feeds',
          'Suspicious account abuse or bot behavior',
          'Requested by compliance / user request',
        ]
      );
    } else {
      confirmAction(
        'Reactivate User',
        `Reactivate account for "${targetUser.email}"?`,
        'Reactivate ✅',
        async () => {
          await setUserStatus(targetUser.id, true);
          toast.show(`User ${targetUser.email} reactivated!`, 'success');
          refetchUsers();
          refetchStats();
        }
      );
    }
  };

  const handleDeleteUser = (targetUser: Profile) => {
    confirmAction(
      'Delete User Profile',
      `Permanently remove user "${targetUser.email}"? This cannot be undone.`,
      'Delete Permanently',
      async () => {
        try {
          await deleteUser(targetUser.id);
          toast.show('User profile deleted.', 'info');
          refetchUsers();
          refetchStats();
        } catch (err: any) {
          toast.show(err.message || 'Deletion failed', 'error');
        }
      },
      true
    );
  };

  const handleToggleBrandSuspension = async (targetBrand: Brand) => {
    const isSuspended = targetBrand.status === 'suspended';
    if (isSuspended) {
      try {
        await reactivateBrand(targetBrand.id, targetBrand.name);
        toast.show(`Brand "${targetBrand.name}" reactivated! ✅`, 'success');
        queryClient.invalidateQueries({ queryKey: ['admin-all-brands'] });
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
        queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
        queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
        await Promise.all([refetchAllBrands(), refetchStats()]);
      } catch (err: any) {
        toast.show(err.message || 'Failed to reactivate brand', 'error');
      }
    } else {
      openReasonModal(
        'Suspend Brand Account',
        `Enter suspension reason for brand "${targetBrand.name}":`,
        async (reason) => {
          try {
            await suspendBrand(targetBrand.id, targetBrand.name, reason);
            toast.show(`Brand "${targetBrand.name}" suspended.`, 'info');
            queryClient.invalidateQueries({ queryKey: ['admin-all-brands'] });
            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
            queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
            queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
            await refetchAllBrands();
            await refetchStats();
          } catch (err: any) {
            toast.show(err.message || 'Failed to suspend brand', 'error');
          }
        },
        [
          'Violation of platform merchant terms',
          'Multiple consumer dispute reports',
          'Fake discounts or expired promotions',
          'Requested by compliance officer',
        ]
      );
    }
  };

  const handleDeleteBrand = (targetBrand: Brand) => {
    confirmAction(
      'Delete Brand Profile',
      `Permanently remove brand "${targetBrand.name}"? This cannot be undone.`,
      'Delete Permanently',
      async () => {
        try {
          await deleteBrand(targetBrand.id, targetBrand.name);
          toast.show(`Brand "${targetBrand.name}" removed successfully.`, 'info');
          queryClient.invalidateQueries({ queryKey: ['admin-all-brands'] });
          queryClient.invalidateQueries({ queryKey: ['admin-pending-brands'] });
          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          queryClient.invalidateQueries({ queryKey: ['deals-feed'] });
          queryClient.invalidateQueries({ queryKey: ['brand-deals'] });
          await refetchAllBrands();
          await refetchStats();
        } catch (err: any) {
          toast.show(err.message || 'Deletion failed', 'error');
        }
      },
      true
    );
  };

  // ─── Reports Action ───────────────────────────────────────────────
  const handleReportAction = (
    report: Report,
    action: 'dismiss' | 'resolve' | 'suspend_deal'
  ) => {
    const actionLabel =
      action === 'dismiss'
        ? 'Dismiss Report'
        : action === 'resolve'
        ? 'Mark Resolved'
        : 'Suspend Reported Promotion';

    confirmAction(
      actionLabel,
      action === 'suspend_deal'
        ? 'This will immediately take the reported promotion down from the feed and notify the brand.'
        : `Confirm ${action} for this report?`,
      'Confirm',
      async () => {
        try {
          await resolveReport(report.id, action);
          toast.show(`Report ${action} executed successfully.`, 'success');
          refetchReports();
          refetchStats();
        } catch (err: any) {
          toast.show(err.message || 'Action failed', 'error');
        }
      },
      action === 'suspend_deal'
    );
  };

  // ─── Search Filtering ─────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return allUsers;
    const q = searchQuery.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.display_name?.toLowerCase().includes(q)
    );
  }, [allUsers, searchQuery]);

  const filteredBrandsList = useMemo(() => {
    if (!searchQuery.trim()) return allBrands;
    const q = searchQuery.toLowerCase();
    return allBrands.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.business_email?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q)
    );
  }, [allBrands, searchQuery]);

  const filteredReportsList = useMemo(() => {
    if (reportsFilter === 'all') return allReports;
    return allReports.filter((r) => r.status === reportsFilter);
  }, [allReports, reportsFilter]);

  // Overall platform compliance & queue clearance metric (purely based on actual database counts)
  const totalModerationTasks = (stats?.pendingBrands ?? 0) + (stats?.pendingDeals ?? 0) + (stats?.pendingReports ?? 0);
  const totalActiveEntities = (stats?.totalBrands ?? 0) + (stats?.activeDeals ?? 0);
  const clearancePct = totalActiveEntities + totalModerationTasks > 0
    ? Math.min(100, Math.max(0, Math.round((totalActiveEntities / (totalActiveEntities + totalModerationTasks)) * 100)))
    : 100;

  // ─── RENDER: 1. MODERN DASHBOARD OVERVIEW ─────────────────────────
  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={statsLoading}
          onRefresh={() => {
            refetchStats();
            refetchAudit();
            refetchActivities();
          }}
          tintColor={adminTheme.neon}
        />
      }>
      {/* Hero Welcome Card (Tailwindadmin inspired) */}
      <LinearGradient
        colors={['#101C16', '#12141A', '#0D0F14']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}>
        <View style={styles.heroGlowBadge} />
        <View style={styles.heroLeft}>
          <View style={styles.heroAvatarWrap}>
            <View style={styles.heroAvatarCircle}>
              <Ionicons name="shield-checkmark" size={24} color={adminTheme.neon} />
            </View>
            <View style={styles.heroOnlineDot} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
              <Text style={styles.heroTitle}>Welcome back! Admin</Text>
              <Text style={styles.heroWave}>👋</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Platform Command Center • All moderation queues & services are active.
            </Text>
          </View>
        </View>

        <View style={styles.heroStatsBadge}>
          <Ionicons name="sparkles" size={14} color={adminTheme.neon} />
          <Text style={styles.heroStatsBadgeText}>Neon Engine Online</Text>
        </View>
      </LinearGradient>

      {/* Row of Sleek Modern KPI Cards (Inspired by the reference image) */}
      <View style={styles.statsKpiRow}>
        <MetricCard
          icon="people"
          label="Shoppers / Users"
          value={Math.max(stats?.totalUsers ?? 0, registeredShoppers.length)}
          accentColor={adminTheme.neon}
          onPress={() => {
            setDirectorySubTab('users');
            setActiveTab('directory');
          }}
        />
        <MetricCard
          icon="business"
          label="Registered Brands"
          value={Math.max(stats?.totalBrands ?? 0, registeredBrands.length)}
          accentColor="#00E5FF"
          onPress={() => {
            setDirectorySubTab('brands');
            setActiveTab('directory');
          }}
        />
        <MetricCard
          icon="time"
          label="Pending Brands"
          value={stats?.pendingBrands ?? 0}
          accentColor={adminTheme.warning}
          urgent={Boolean(stats && stats.pendingBrands > 0)}
          onPress={() => handleTabResetOrSwitch('brands_queue')}
        />
        <MetricCard
          icon="pricetag"
          label="Total Promotions"
          value={Math.max(stats?.totalDeals ?? 0, allDealsForAdmin.length)}
          accentColor="#A78BFA"
          onPress={() => handleTabResetOrSwitch('growth_tools')}
        />
        <MetricCard
          icon="checkmark-circle"
          label="Active Deals"
          value={stats?.activeDeals ?? 0}
          accentColor={adminTheme.neonSecondary}
        />
        <MetricCard
          icon="hourglass"
          label="Pending Deals"
          value={stats?.pendingDeals ?? 0}
          accentColor={adminTheme.warning}
          urgent={Boolean(stats && stats.pendingDeals > 0)}
          onPress={() => setActiveTab('deals_queue')}
        />
        <MetricCard
          icon="flag"
          label="Pending Reports"
          value={stats?.pendingReports ?? 0}
          accentColor={adminTheme.error}
          urgent={Boolean(stats && stats.pendingReports > 0)}
          onPress={() => setActiveTab('reports')}
        />
      </View>

      {/* Urgent Moderation Alert Banners */}
      {(stats?.pendingBrands ?? 0) > 0 && (
        <Pressable
          style={styles.urgentBanner}
          onPress={() => setActiveTab('brands_queue')}>
          <View style={styles.urgentIconWrap}>
            <Ionicons name="alert-circle" size={20} color={adminTheme.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.urgentTitle}>
              {stats?.pendingBrands} Brand Partner Application(s) Awaiting Review
            </Text>
            <Text style={styles.urgentSubtitle}>
              Verify legal credentials and approve partner portal access.
            </Text>
          </View>
          <View style={styles.urgentArrow}>
            <Ionicons name="arrow-forward" size={16} color={adminTheme.warning} />
          </View>
        </Pressable>
      )}

      {(stats?.pendingDeals ?? 0) > 0 && (
        <Pressable
          style={styles.urgentBanner}
          onPress={() => setActiveTab('deals_queue')}>
          <View style={styles.urgentIconWrap}>
            <Ionicons name="hourglass" size={20} color={adminTheme.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.urgentTitle}>
              {stats?.pendingDeals} Promotion(s) Awaiting Moderation
            </Text>
            <Text style={styles.urgentSubtitle}>
              Preview deals as consumers see them and publish live.
            </Text>
          </View>
          <View style={styles.urgentArrow}>
            <Ionicons name="arrow-forward" size={16} color={adminTheme.warning} />
          </View>
        </Pressable>
      )}

      {/* Two Column Grid: Platform Activity Feed & System Health Gauge (Matching Reference Layout) */}
      <View style={[styles.dashboardGridRow, isDesktop ? { flexDirection: 'row' } : { flexDirection: 'column' }]}>
        {/* Left Card: Platform Updates & Live Feeds (Inspired by Revenue updates card) */}
        <View style={[styles.dashboardGridCol, isDesktop ? { flex: 1.6 } : { width: '100%' }]}>
          <View style={styles.panelCard}>
            <View style={styles.panelCardHeader}>
              <View>
                <Text style={styles.panelCardTitle}>Platform Activity Stream</Text>
                <Text style={styles.panelCardSub}>Live updates and administrative events</Text>
              </View>
              <View style={styles.pillToggleWrap}>
                <Pressable
                  style={[
                    styles.pillToggleBtn,
                    overviewFeedMode === 'logs' && styles.pillToggleBtnActive,
                  ]}
                  onPress={() => setOverviewFeedMode('logs')}>
                  <Text
                    style={[
                      styles.pillToggleText,
                      overviewFeedMode === 'logs' && styles.pillToggleTextActive,
                    ]}>
                    Admin Logs
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.pillToggleBtn,
                    overviewFeedMode === 'activities' && styles.pillToggleBtnActive,
                  ]}
                  onPress={() => setOverviewFeedMode('activities')}>
                  <Text
                    style={[
                      styles.pillToggleText,
                      overviewFeedMode === 'activities' && styles.pillToggleTextActive,
                    ]}>
                    Live Interactions
                  </Text>
                </Pressable>
              </View>
            </View>

            {overviewFeedMode === 'logs' ? (
              <View style={styles.streamList}>
                {auditLogs.length === 0 ? (
                  <Text style={styles.emptyFeedText}>No recent administrative operations.</Text>
                ) : (
                  auditLogs.slice(0, 5).map((log) => (
                    <AuditLogItem key={log.id} log={log} />
                  ))
                )}
                <Pressable
                  style={styles.viewMoreRow}
                  onPress={() => setActiveTab('audit_log')}>
                  <Text style={styles.viewMoreText}>View Complete Audit Trail ({auditLogs.length})</Text>
                  <Ionicons name="chevron-forward" size={14} color={adminTheme.neon} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.streamList}>
                {systemActivities.length === 0 ? (
                  <Text style={styles.emptyFeedText}>No user interactions recorded yet.</Text>
                ) : (
                  systemActivities.slice(0, 5).map((act) => (
                    <View key={act.id} style={styles.liveActivityRow}>
                      <View style={styles.liveActivityIconCircle}>
                        <Ionicons
                          name={
                            act.type === 'like'
                              ? 'heart'
                              : act.type === 'comment'
                              ? 'chatbubble'
                              : 'share-social'
                          }
                          size={14}
                          color={
                            act.type === 'like'
                              ? '#EF4444'
                              : act.type === 'comment'
                              ? adminTheme.neon
                              : '#8B5CF6'
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.liveActivityText}>
                          <Text style={{ fontWeight: 'bold', color: adminTheme.textPrimary }}>
                            {act.user_name}
                          </Text>{' '}
                          {act.type === 'like' ? 'liked' : act.type === 'comment' ? 'commented on' : 'shared'}{' '}
                          &quot;{act.deal_title}&quot;
                        </Text>
                        <Text style={styles.liveActivityTime}>
                          {new Date(act.created_at).toLocaleTimeString('en-PK', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                <Pressable
                  style={styles.viewMoreRow}
                  onPress={() => setActiveTab('activity_monitoring')}>
                  <Text style={styles.viewMoreText}>Open Activity Monitoring ({systemActivities.length})</Text>
                  <Ionicons name="chevron-forward" size={14} color={adminTheme.neon} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Right Card: Platform Health & Circular Queue Gauge (Inspired by Yearly Backup card in reference) */}
        <View style={[styles.dashboardGridCol, isDesktop ? { flex: 1 } : { width: '100%' }]}>
          <View style={styles.panelCard}>
            <View style={styles.panelCardHeader}>
              <View>
                <Text style={styles.panelCardTitle}>Platform Compliance</Text>
                <Text style={styles.panelCardSub}>Queue clearance & health ratio</Text>
              </View>
              <View style={styles.badgePulse}>
                <View style={styles.badgePulseDot} />
                <Text style={styles.badgePulseText}>99.9% Up</Text>
              </View>
            </View>

            <View style={styles.gaugeContainer}>
              <View style={styles.gaugeInfo}>
                <Text style={styles.gaugeValue}>{clearancePct}%</Text>
                <Text style={styles.gaugeLabel}>Queue Clearance</Text>
                <View style={styles.growthBadge}>
                  <Ionicons name="arrow-up" size={12} color={adminTheme.neon} />
                  <Text style={styles.growthText}>Stable compliance</Text>
                </View>
              </View>

              {/* Styled Circular Ring Visual */}
              <View style={styles.circularRingOuter}>
                <View style={styles.circularRingTrack} />
                <View style={styles.circularRingActiveArc} />
                <View style={styles.circularRingInner}>
                  <Ionicons name="shield" size={26} color={adminTheme.neon} />
                </View>
              </View>
            </View>

            <View style={styles.gaugeBreakdownList}>
              <View style={styles.gaugeBreakdownRow}>
                <View style={[styles.dotIndicator, { backgroundColor: adminTheme.neon }]} />
                <Text style={styles.gaugeBreakdownLabel}>Active Deals Online</Text>
                <Text style={styles.gaugeBreakdownValue}>{stats?.activeDeals ?? 0}</Text>
              </View>
              <View style={styles.gaugeBreakdownRow}>
                <View style={[styles.dotIndicator, { backgroundColor: '#00E5FF' }]} />
                <Text style={styles.gaugeBreakdownLabel}>Registered Partners</Text>
                <Text style={styles.gaugeBreakdownValue}>{stats?.totalBrands ?? 0}</Text>
              </View>
              <View style={styles.gaugeBreakdownRow}>
                <View style={[styles.dotIndicator, { backgroundColor: adminTheme.warning }]} />
                <Text style={styles.gaugeBreakdownLabel}>Items Awaiting Review</Text>
                <Text style={[styles.gaugeBreakdownValue, { color: adminTheme.warning }]}>
                  {totalModerationTasks}
                </Text>
              </View>
            </View>

            <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
              <Button
                label="Moderate Brand Queue"
                variant="outline"
                size="sm"
                onPress={() => setActiveTab('brands_queue')}
              />
              <Button
                label="Moderate Deals Queue"
                variant="primary"
                size="sm"
                onPress={() => setActiveTab('deals_queue')}
              />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  // ─── RENDER: 2. BRAND APPROVAL QUEUE ──────────────────────────────
  const renderBrandsQueue = () => (
    <View style={styles.queueContainer}>
      <FlatList
        data={pendingBrands}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingBrands}
            onRefresh={refetchBrands}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Brand Queue Clear! 🎉"
            description="All brand partner registration requests have been reviewed."
            icon="checkmark-circle-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.brandIconBox}>
                <Ionicons name="business" size={22} color={adminTheme.neon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.business_email}</Text>
              </View>
              <Badge label="Pending Review" variant="warning" />
            </View>

            {item.contact_number && (
              <InfoRow icon="call-outline" text={item.contact_number} />
            )}
            {item.category && (
              <InfoRow icon="grid-outline" text={`Category: ${item.category}`} />
            )}
            {(item.social_links as any)?.website && (
              <InfoRow
                icon="globe-outline"
                text={(item.social_links as any).website}
              />
            )}

            {/* Document Viewer */}
            <View style={styles.docBox}>
              <Text style={styles.docBoxTitle}>Verification Documents:</Text>
              {item.verification_doc_urls && item.verification_doc_urls.length > 0 ? (
                item.verification_doc_urls.map((docPath, idx) => (
                  <Pressable
                    key={docPath + idx}
                    style={styles.docLinkBtn}
                    onPress={() => handleViewBrandDoc(docPath)}>
                    <Ionicons
                      name="document-attach-outline"
                      size={16}
                      color={adminTheme.neon}
                    />
                    <Text style={styles.docLinkText} numberOfLines={1}>
                      View Document {idx + 1} (Secure Signed URL)
                    </Text>
                    <Ionicons
                      name="open-outline"
                      size={14}
                      color={adminTheme.neon}
                    />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.noDocText}>No document attached</Text>
              )}
            </View>

            {/* Rejection / Note feedback if previously rejected */}
            {item.rejection_reason && (
              <View style={styles.rejectionNoticeBox}>
                <Ionicons name="alert-circle" size={14} color={adminTheme.warning} />
                <Text style={styles.rejectionNoticeText}>
                  Previous feedback: {item.rejection_reason}
                </Text>
              </View>
            )}

            <Text style={styles.timestampText}>
              Submitted:{' '}
              {new Date(item.created_at).toLocaleDateString('en-PK', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>

            <View style={styles.actionRow}>
              <Button
                label="Reject Application"
                variant="outline"
                onPress={() => handleRejectBrand(item)}
                style={{ flex: 1 }}
              />
              <Button
                label="Approve Brand ✅"
                variant="primary"
                onPress={() => handleApproveBrand(item)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />
    </View>
  );

  // ─── RENDER: 3. PROMOTION APPROVAL QUEUE ──────────────────────────
  const renderDealsQueue = () => (
    <View style={styles.queueContainer}>
      <FlatList
        data={pendingDeals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingDeals}
            onRefresh={refetchDeals}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Deals Queue Clear! 🎉"
            description="All brand promotions have been moderated and are live or resolved."
            icon="checkmark-circle-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.previewTagRow}>
              <Badge label="MARKETPLACE PREVIEW" variant="neutral" />
              <Badge label="PENDING APPROVAL" variant="warning" />
            </View>

            {/* Consumer Deal Card Mockup */}
            <View style={styles.consumerCardPreview}>
              {item.image_urls && item.image_urls.length > 0 ? (
                <Image
                  source={{ uri: item.image_urls[0] }}
                  style={styles.consumerCardImage}
                />
              ) : (
                <View style={styles.consumerCardImagePlaceholder}>
                  <Ionicons name="pricetag" size={32} color={adminTheme.textMuted} />
                </View>
              )}

              <View style={styles.consumerCardBody}>
                <View style={styles.consumerTopRow}>
                  <Text style={styles.consumerBrandName}>
                    {item.brand?.name || 'Brand Partner'}
                  </Text>
                  {item.discount_pct && (
                    <Badge
                      label={`${item.discount_pct}% OFF`}
                      variant="deal"
                    />
                  )}
                </View>

                <Text style={styles.consumerTitle}>{item.title}</Text>
                <Text style={styles.consumerDescription}>
                  {item.description}
                </Text>

                {/* Pricing Details */}
                {(item.original_price || item.discount_price) && (
                  <View style={styles.consumerPriceRow}>
                    {item.discount_price ? (
                      <Text style={styles.consumerDiscountPrice}>
                        Rs. {Number(item.discount_price).toLocaleString()}
                      </Text>
                    ) : null}
                    {item.original_price ? (
                      <Text style={styles.consumerOriginalPrice}>
                        Rs. {Number(item.original_price).toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* Promo Code & Destination Link */}
                {(item.promo_code || item.buy_url || (item as any).website_url) && (
                  <View style={styles.dealExtrasRow}>
                    {item.promo_code ? (
                      <View style={styles.promoCodeChip}>
                        <Ionicons name="pricetag-outline" size={11} color={adminTheme.neon} />
                        <Text style={styles.promoCodeText}>Code: {item.promo_code}</Text>
                      </View>
                    ) : null}
                    {item.buy_url || (item as any).website_url ? (
                      <View style={styles.buyLinkChip}>
                        <Ionicons name="link-outline" size={11} color="#00E5FF" />
                        <Text style={styles.buyLinkText} numberOfLines={1}>
                          {item.buy_url || (item as any).website_url}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.consumerMetaRow}>
                  <View style={styles.consumerMetaChip}>
                    <Ionicons
                      name={
                        item.deal_type === 'online'
                          ? 'globe-outline'
                          : 'storefront-outline'
                      }
                      size={12}
                      color={adminTheme.textSecondary}
                    />
                    <Text style={styles.consumerMetaText}>
                      {item.deal_type === 'online'
                        ? 'Online Offer'
                        : `In-Store (${item.city || 'Pakistan'})`}
                    </Text>
                  </View>

                  <View style={styles.consumerMetaChip}>
                    <Ionicons
                      name="calendar-outline"
                      size={12}
                      color={adminTheme.textSecondary}
                    />
                    <Text style={styles.consumerMetaText}>
                      {new Date(item.start_date).toLocaleDateString('en-PK', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      –{' '}
                      {new Date(item.end_date).toLocaleDateString('en-PK', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                </View>

                {/* Live Engagement Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="heart" size={14} color="#FF3B30" />
                    <Text style={{ fontSize: 12, color: adminTheme.textSecondary, fontWeight: '600' }}>
                      {dynamicLikesMap[item.id] ?? adminBatchInteractions?.[item.id]?.likes_count ?? item.likes_count ?? 0} likes
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="chatbubble-ellipses" size={13} color={adminTheme.neon} />
                    <Text style={{ fontSize: 12, color: adminTheme.textSecondary, fontWeight: '600' }}>
                      {dynamicCommentsMap[item.id] ?? adminBatchInteractions?.[item.id]?.comments_count ?? item.comments_count ?? 0} comments
                    </Text>
                  </View>
                </View>

                {item.terms && (
                  <Text style={styles.consumerTerms}>
                    Terms: {item.terms}
                  </Text>
                )}

                {item.rejection_reason && (
                  <View style={styles.rejectionNoticeBox}>
                    <Ionicons name="alert-circle" size={13} color={adminTheme.warning} />
                    <Text style={styles.rejectionNoticeText}>
                      Previous Feedback: {item.rejection_reason}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.actionRow}>
              <Button
                label="Reject Promotion"
                variant="outline"
                onPress={() => handleRejectDeal(item)}
                style={{ flex: 1 }}
              />
              <Button
                label="Approve & Publish Live 🚀"
                variant="primary"
                onPress={() => handleApproveDeal(item)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />
    </View>
  );

  // ─── RENDER: 4. USER & BRAND MANAGEMENT ───────────────────────────
  const renderManagement = () => (
    <View style={styles.queueContainer}>
      <View style={styles.managementControls}>
        <Input
          placeholder={
            managementSubTab === 'users'
              ? 'Search shoppers by name or email...'
              : 'Search brands by name, category...'
          }
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search-outline"
        />

        <View style={styles.subTabRow}>
          <Pressable
            style={[
              styles.subTabBtn,
              managementSubTab === 'users' && styles.subTabBtnActive,
            ]}
            onPress={() => {
              setManagementSubTab('users');
              setSearchQuery('');
            }}>
            <Ionicons
              name="people-outline"
              size={16}
              color={
                managementSubTab === 'users'
                  ? adminTheme.textDark
                  : adminTheme.textSecondary
              }
            />
            <Text
              style={[
                styles.subTabText,
                managementSubTab === 'users' && styles.subTabTextActive,
              ]}>
              Shoppers / Users ({allUsers.length})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.subTabBtn,
              managementSubTab === 'brands' && styles.subTabBtnActive,
            ]}
            onPress={() => {
              setManagementSubTab('brands');
              setSearchQuery('');
            }}>
            <Ionicons
              name="business-outline"
              size={16}
              color={
                managementSubTab === 'brands'
                  ? adminTheme.textDark
                  : adminTheme.textSecondary
              }
            />
            <Text
              style={[
                styles.subTabText,
                managementSubTab === 'brands' && styles.subTabTextActive,
              ]}>
              Brands ({allBrands.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {managementSubTab === 'users' ? (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingUsers}
              onRefresh={refetchUsers}
              tintColor={adminTheme.neon}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Users Found"
              description="No user profiles match your search."
              icon="people-outline"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(item.display_name || item.email)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {item.display_name || 'Anonymous User'}
                  </Text>
                  <Text style={styles.cardSub}>{item.email}</Text>
                  <Text style={styles.timestampText}>Role: {item.role}</Text>
                </View>
                <Badge
                  label={item.is_active ? 'Active' : 'Suspended'}
                  variant={item.is_active ? 'success' : 'error'}
                />
              </View>

              <View style={styles.actionRow}>
                <Button
                  label={item.is_active ? 'Suspend User' : 'Reactivate'}
                  variant={item.is_active ? 'outline' : 'primary'}
                  size="sm"
                  onPress={() => handleToggleUserSuspension(item)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleDeleteUser(item)}
                  style={{ flex: 0.5 }}
                />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={filteredBrandsList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingAllBrands}
              onRefresh={refetchAllBrands}
              tintColor={adminTheme.neon}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Brands Found"
              description="No brands match your search query."
              icon="business-outline"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.brandIconBox}>
                  <Ionicons name="business" size={20} color={adminTheme.neon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSub}>{item.business_email}</Text>
                  {item.category && (
                    <Text style={styles.timestampText}>
                      Category: {item.category}
                    </Text>
                  )}
                </View>
                <Badge
                  label={item.status.toUpperCase()}
                  variant={
                    item.status === 'active'
                      ? 'success'
                      : item.status === 'pending'
                      ? 'warning'
                      : 'error'
                  }
                />
              </View>

              {item.status === 'pending' ? (
                <View style={styles.actionRow}>
                  <Button
                    label="Reject"
                    variant="outline"
                    size="sm"
                    onPress={() => handleRejectBrand(item)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Approve Brand ✅"
                    variant="primary"
                    size="sm"
                    onPress={() => handleApproveBrand(item)}
                    style={{ flex: 1.2 }}
                  />
                </View>
              ) : (
                <View style={styles.actionRow}>
                  {item.status === 'suspended' ? (
                    <Button
                      label="Reactivate"
                      variant="primary"
                      size="sm"
                      onPress={() => handleToggleBrandSuspension(item)}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <Button
                      label="Suspend Brand"
                      variant="outline"
                      size="sm"
                      onPress={() => handleToggleBrandSuspension(item)}
                      style={{ flex: 1 }}
                    />
                  )}
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    onPress={() => handleDeleteBrand(item)}
                    style={{ flex: 0.5 }}
                  />
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );

  // ─── RENDER: 5. REPORTED CONTENT LIST ─────────────────────────────
  const renderReports = () => (
    <View style={styles.queueContainer}>
      <View style={styles.filterTabsRow}>
        {(['all', 'pending', 'resolved', 'dismissed'] as const).map((f) => (
          <Pressable
            key={f}
            style={[
              styles.reportFilterBtn,
              reportsFilter === f && styles.reportFilterBtnActive,
            ]}
            onPress={() => setReportsFilter(f)}>
            <Text
              style={[
                styles.reportFilterText,
                reportsFilter === f && styles.reportFilterTextActive,
              ]}>
              {f.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredReportsList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingReports}
            onRefresh={refetchReports}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Reports"
            description={`No content reports in "${reportsFilter}" status.`}
            icon="shield-checkmark-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.brandIconBox, { backgroundColor: adminTheme.errorBg }]}>
                <Ionicons name="flag" size={18} color={adminTheme.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Reported Deal: {item.deal?.title || 'Unknown Promotion'}
                </Text>
                <Text style={styles.cardSub}>
                  Reporter: {item.reporter?.email || 'Anonymous Consumer'}
                </Text>
              </View>
              <Badge
                label={item.status.toUpperCase()}
                variant={
                  item.status === 'pending'
                    ? 'warning'
                    : item.status === 'resolved'
                    ? 'success'
                    : 'neutral'
                }
              />
            </View>

            <View style={styles.reasonCardBox}>
              <Text style={styles.reasonLabel}>Reported Reason:</Text>
              <Text style={styles.reasonBody}>{item.reason}</Text>
            </View>

            <Text style={styles.timestampText}>
              Filed:{' '}
              {new Date(item.created_at).toLocaleDateString('en-PK', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>

            {item.status === 'pending' && (
              <View style={styles.actionRow}>
                <Button
                  label="Dismiss"
                  variant="outline"
                  size="sm"
                  onPress={() => handleReportAction(item, 'dismiss')}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Resolve"
                  variant="outline"
                  size="sm"
                  onPress={() => handleReportAction(item, 'resolve')}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Suspend Deal 🚫"
                  variant="primary"
                  size="sm"
                  onPress={() => handleReportAction(item, 'suspend_deal')}
                  style={{ flex: 1.3 }}
                />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );

  // ─── RENDER: 6. AUDIT LOG SCREEN ──────────────────────────────────
  const renderAuditLog = () => (
    <View style={styles.queueContainer}>
      <FlatList
        data={auditLogs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingAudit}
            onRefresh={refetchAudit}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Audit Log Empty"
            description="All administrative operations will be tracked here in real-time."
            icon="newspaper-outline"
          />
        }
        renderItem={({ item }) => <AuditLogItem log={item} />}
      />
    </View>
  );

  // ─── RENDER: 7. BRAND DIRECTORY & POSTS MANAGEMENT ────────────────
  const renderBrandDirectory = () => (
    <View style={styles.queueContainer}>
      <View style={styles.searchHeader}>
        <Input
          placeholder="Search brands by name, email or category..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search-outline"
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionHeading, { marginHorizontal: spacing[4], marginBottom: spacing[2] }]}>
          Brand Partner Directory ({filteredBrandsList.length})
        </Text>

        <FlatList
          data={filteredBrandsList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingAllBrands}
              onRefresh={refetchAllBrands}
              tintColor={adminTheme.neon}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Brands Found"
              description="No registered brands match your search query."
              icon="business-outline"
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedDirectoryBrand?.id === item.id;
            return (
              <View
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                  { marginBottom: spacing[3] },
                ]}>
                <Pressable
                  onPress={() => {
                    if (isSelected) {
                      setSelectedDirectoryBrand(null);
                    } else {
                      loadBrandDeals(item);
                    }
                  }}>
                  <View style={styles.cardHeader}>
                    <View style={styles.brandIconBox}>
                      <Ionicons name="business" size={20} color={adminTheme.neon} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardSub}>{item.business_email}</Text>
                      {item.category && (
                        <Text style={styles.timestampText}>
                          Category: {item.category}
                        </Text>
                      )}
                    </View>
                    <Badge
                      label={item.status.toUpperCase()}
                      variant={
                        item.status === 'active'
                          ? 'success'
                          : item.status === 'pending'
                          ? 'warning'
                          : 'error'
                      }
                    />
                  </View>

                  <View style={{ marginTop: spacing[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ ...typography.caption, color: adminTheme.neon, fontWeight: 'bold' }}>
                      {isSelected ? '▲ Hide Brand Posts' : '▼ View Live Posts & Controls'}
                    </Text>
                    <Text style={{ ...typography.caption, color: adminTheme.textMuted }}>
                      {item.contact_number || 'Phone on file'}
                    </Text>
                  </View>
                </Pressable>

                <View style={[styles.actionRow, { marginTop: spacing[3] }]}>
                  {item.status === 'suspended' ? (
                    <Button
                      label="Reactivate Brand"
                      variant="primary"
                      size="sm"
                      onPress={() => handleToggleBrandSuspension(item)}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <Button
                      label="Suspend Brand"
                      variant="outline"
                      size="sm"
                      onPress={() => handleToggleBrandSuspension(item)}
                      style={{ flex: 1 }}
                    />
                  )}
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    onPress={() => handleDeleteBrand(item)}
                    style={{ flex: 0.5 }}
                  />
                </View>

                {isSelected && (
                  <View style={{ marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: adminTheme.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
                      <Text style={{ ...typography.bodyMedium, color: adminTheme.textPrimary, fontWeight: 'bold' }}>
                        Live Posts by {item.name} ({directoryBrandDeals.length})
                      </Text>
                      {loadingDirectoryDeals && (
                        <ActivityIndicator size="small" color={adminTheme.neon} />
                      )}
                    </View>

                    {directoryBrandDeals.length === 0 ? (
                      <Text style={{ ...typography.caption, color: adminTheme.textMuted, fontStyle: 'italic', paddingVertical: spacing[2] }}>
                        This brand has not uploaded any posts or promotions yet.
                      </Text>
                    ) : (
                      directoryBrandDeals.map((deal) => (
                        <View
                          key={deal.id}
                          style={{
                            backgroundColor: adminTheme.bgCardHover,
                            borderRadius: radii.md,
                            padding: spacing[3],
                            marginBottom: spacing[3],
                            borderWidth: 1,
                            borderColor: adminTheme.border,
                            gap: spacing[2],
                          }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                            {deal.banner_url || deal.image_urls?.[0] ? (
                              <Image
                                source={{ uri: deal.banner_url || deal.image_urls?.[0] }}
                                style={{ width: 44, height: 44, borderRadius: radii.sm }}
                              />
                            ) : (
                              <View style={{ width: 44, height: 44, borderRadius: radii.sm, backgroundColor: adminTheme.bgInput, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="pricetag" size={18} color={adminTheme.neon} />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={{ ...typography.bodyMedium, color: adminTheme.textPrimary, fontSize: 14 }}>
                                {deal.title}
                              </Text>
                              <Text style={{ ...typography.caption, color: adminTheme.neon }}>
                                {deal.discount_pct}% OFF • Promo: {deal.promo_code || 'None'}
                              </Text>
                              <Text style={{ ...typography.caption, color: adminTheme.textMuted, fontSize: 11 }}>
                                City: {deal.city || 'All Pakistan'} • Type: {deal.deal_type}
                              </Text>
                            </View>
                            <Badge
                              label={deal.status.toUpperCase()}
                              variant={
                                deal.status === 'active'
                                  ? 'success'
                                  : deal.status === 'pending'
                                  ? 'warning'
                                  : 'error'
                              }
                            />
                          </View>

                          {deal.description ? (
                            <Text style={{ ...typography.caption, color: adminTheme.textSecondary }} numberOfLines={2}>
                              {deal.description}
                            </Text>
                          ) : null}

                          {/* Live Engagement Row */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Ionicons name="heart" size={13} color="#FF3B30" />
                              <Text style={{ fontSize: 11, color: adminTheme.textSecondary, fontWeight: '600' }}>
                                {dynamicLikesMap[deal.id] ?? adminBatchInteractions?.[deal.id]?.likes_count ?? deal.likes_count ?? 0} likes
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Ionicons name="chatbubble-ellipses" size={12} color={adminTheme.neon} />
                              <Text style={{ fontSize: 11, color: adminTheme.textSecondary, fontWeight: '600' }}>
                                {dynamicCommentsMap[deal.id] ?? adminBatchInteractions?.[deal.id]?.comments_count ?? deal.comments_count ?? 0} comments
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
                            <Button
                              label={
                                deal.status === 'suspended'
                                  ? 'Reactivate Post ✅'
                                  : 'Suspend Post 🚫'
                              }
                              variant={deal.status === 'suspended' ? 'primary' : 'outline'}
                              size="sm"
                              onPress={() => handleToggleDealStatus(deal)}
                              style={{ flex: 1 }}
                            />
                            <Button
                              label="Delete Post 🗑️"
                              variant="ghost"
                              size="sm"
                              onPress={() => handleDeletePost(deal)}
                              style={{ flex: 1 }}
                            />
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      </View>
    </View>
  );

  // ─── RENDER: 8. ACTIVITY & ANALYTICS MONITORING ───────────────────
  const renderActivityMonitoring = () => {
    // Exact Database & Account-level Unique Counts (1 user account = 1 like per post)
    const uniqueLikesSet = new Set(
      systemActivities
        .filter((a) => a.type === 'like')
        .map((a) => `${(a.user_id || a.user_name || '').trim().toLowerCase()}::${(a.deal_id || a.deal_title || '').trim().toLowerCase()}`)
    );
    const totalLikes = uniqueLikesSet.size;
    const totalComments = systemActivities.filter((a) => a.type === 'comment').length;
    const totalShares = systemActivities.filter((a) => a.type === 'share').length;

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loadingActivities}
            onRefresh={refetchActivities}
            tintColor={adminTheme.neon}
          />
        }>
        <Text style={styles.sectionHeading}>System User Activity & Engagement</Text>

        <View style={styles.statsKpiRow}>
          <MetricCard
            icon="heart"
            label="Total Likes"
            value={totalLikes}
            accentColor="#EF4444"
          />
          <MetricCard
            icon="chatbubbles"
            label="Total Comments"
            value={totalComments}
            accentColor={adminTheme.neon}
          />
          <MetricCard
            icon="share-social"
            label="Total Shares"
            value={totalShares}
            accentColor="#8B5CF6"
          />
          <MetricCard
            icon="pulse"
            label="Tracked Events"
            value={systemActivities.length}
            accentColor="#00E5FF"
          />
        </View>

        <View style={styles.panelCard}>
          <View style={styles.panelCardHeader}>
            <View>
              <Text style={styles.panelCardTitle}>Live Real-Time User Interactions</Text>
              <Text style={styles.panelCardSub}>Activity stream across consumer feeds</Text>
            </View>
            <Badge label={`${systemActivities.length} Events`} variant="success" />
          </View>

          {systemActivities.length === 0 ? (
            <EmptyState
              title="No Activities Yet"
              description="User interactions across the platform will stream here in real time."
              icon="pulse-outline"
            />
          ) : (
            systemActivities.map((act) => (
              <View
                key={act.id}
                style={styles.activityFeedCard}>
                <View
                  style={[
                    styles.activityIconCircle,
                    {
                      backgroundColor:
                        act.type === 'like'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : act.type === 'comment'
                          ? adminTheme.neonLight
                          : 'rgba(139, 92, 246, 0.15)',
                    },
                  ]}>
                  <Ionicons
                    name={
                      act.type === 'like'
                        ? 'heart'
                        : act.type === 'comment'
                        ? 'chatbubble-ellipses'
                        : 'share-social'
                    }
                    size={16}
                    color={
                      act.type === 'like'
                        ? '#EF4444'
                        : act.type === 'comment'
                        ? adminTheme.neon
                        : '#8B5CF6'
                    }
                  />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...typography.body, color: adminTheme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    <Text style={{ fontWeight: 'bold', color: adminTheme.textPrimary }}>
                      {act.user_name}
                    </Text>{' '}
                    {act.type === 'like'
                      ? 'liked'
                      : act.type === 'comment'
                      ? 'commented on'
                      : 'shared'}{' '}
                    &quot;{act.deal_title}&quot;
                  </Text>
                  {act.brand_name && (
                    <Text style={{ ...typography.caption, color: adminTheme.textMuted, fontSize: 11 }}>
                      Brand: {act.brand_name}
                    </Text>
                  )}
                  {act.details && (
                    <Text
                      style={{
                        ...typography.caption,
                        color: adminTheme.textPrimary,
                        backgroundColor: adminTheme.bgInput,
                        paddingHorizontal: spacing[2],
                        paddingVertical: 2,
                        borderRadius: radii.sm,
                        marginTop: 2,
                        fontStyle: 'italic',
                      }}>
                      &ldquo;{act.details}&rdquo;
                    </Text>
                  )}
                  <Text style={{ ...typography.caption, color: adminTheme.textMuted, fontSize: 11, marginTop: 2 }}>
                    {new Date(act.created_at).toLocaleDateString('en-PK', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  // ─── RENDER: 8. SETTINGS & SYSTEM SUB-VIEW (Reports, Audit Trail, Activity, Account & Logout) ────
  const renderMore = () => {
    if (moreSubTab === 'reports') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.subviewHeader}>
            <Pressable onPress={() => setMoreSubTab('menu')} style={styles.subviewBackBtn}>
              <Ionicons name="arrow-back" size={18} color={adminTheme.neon} />
              <Text style={styles.subviewBackText}>Back to Settings</Text>
            </Pressable>
            <Text style={styles.subviewHeaderTitle}>User Reports & Safety</Text>
            <View style={{ width: 70 }} />
          </View>
          {renderReports()}
        </View>
      );
    }

    if (moreSubTab === 'audit_log') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.subviewHeader}>
            <Pressable onPress={() => setMoreSubTab('menu')} style={styles.subviewBackBtn}>
              <Ionicons name="arrow-back" size={18} color={adminTheme.neon} />
              <Text style={styles.subviewBackText}>Back to Settings</Text>
            </Pressable>
            <Text style={styles.subviewHeaderTitle}>Audit Trail & System Logs</Text>
            <View style={{ width: 70 }} />
          </View>
          {renderAuditLog()}
        </View>
      );
    }

    if (moreSubTab === 'activity') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.subviewHeader}>
            <Pressable onPress={() => setMoreSubTab('menu')} style={styles.subviewBackBtn}>
              <Ionicons name="arrow-back" size={18} color={adminTheme.neon} />
              <Text style={styles.subviewBackText}>Back to Settings</Text>
            </Pressable>
            <Text style={styles.subviewHeaderTitle}>App Activity Monitoring</Text>
            <View style={{ width: 70 }} />
          </View>
          <AdminAppActivitySection
            metrics={appActivityMetrics ?? null}
            loading={loadingAppActivity}
            onRefresh={refetchAppActivity}
          />
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.moreContainer}
        contentContainerStyle={styles.moreContentContainer}
        showsVerticalScrollIndicator={false}>
        {/* Admin Profile Overview Card */}
        <View style={styles.moreAdminProfileCard}>
          <View style={styles.moreAdminAvatar}>
            <Text style={styles.moreAdminAvatarText}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.moreAdminName}>Super Administrator</Text>
              <View style={styles.moreAdminRoleBadge}>
                <Text style={styles.moreAdminRoleBadgeText}>ROOT</Text>
              </View>
            </View>
            <Text style={styles.moreAdminEmail}>admin@jumblesale.app</Text>
            <View style={styles.moreAdminStatusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.moreAdminStatusText}>Active System Session</Text>
            </View>
          </View>
        </View>

        {/* Section: Operational Tools */}
        <Text style={styles.moreSectionHeader}>OPERATIONAL CONTROLS</Text>
        <View style={styles.moreMenuCard}>
          <Pressable
            style={styles.moreMenuItem}
            onPress={() => setMoreSubTab('reports')}>
            <View style={[styles.moreMenuIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="flag-outline" size={20} color={adminTheme.error} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.moreMenuItemTitle}>User Reports & Moderation</Text>
                {Boolean(stats && stats.pendingReports > 0) && (
                  <View style={styles.moreItemBadge}>
                    <Text style={styles.moreItemBadgeText}>{stats?.pendingReports} pending</Text>
                  </View>
                )}
              </View>
              <Text style={styles.moreMenuItemDesc}>
                Review flagged deals, spam reports, and compliance issues
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.textMuted} />
          </Pressable>

          <View style={styles.moreItemDivider} />

          <Pressable
            style={styles.moreMenuItem}
            onPress={() => setMoreSubTab('audit_log')}>
            <View style={[styles.moreMenuIconBox, { backgroundColor: adminTheme.neonLight }]}>
              <Ionicons name="newspaper-outline" size={20} color={adminTheme.neon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.moreMenuItemTitle}>Audit Trail & Security Logs</Text>
              <Text style={styles.moreMenuItemDesc}>
                Track real-time admin actions, approvals, and system state changes
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.textMuted} />
          </Pressable>

          <View style={styles.moreItemDivider} />

          <Pressable
            style={styles.moreMenuItem}
            onPress={() => setMoreSubTab('activity')}>
            <View style={[styles.moreMenuIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Ionicons name="pulse-outline" size={20} color={adminTheme.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.moreMenuItemTitle}>App Activity & Engagement</Text>
              <Text style={styles.moreMenuItemDesc}>
                Live breakdown of brand posting, shopper claims, and traffic metrics
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.textMuted} />
          </Pressable>

          <View style={styles.moreItemDivider} />

          <Pressable
            style={styles.moreMenuItem}
            onPress={() => setNotificationsModalOpen(true)}>
            <View style={[styles.moreMenuIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Ionicons name="notifications-outline" size={20} color="#A855F7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.moreMenuItemTitle}>Notifications Center</Text>
              <Text style={styles.moreMenuItemDesc}>
                Review incoming administrative alerts and broadcast history
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.textMuted} />
          </Pressable>
        </View>

        {/* Section: Session */}
        <Text style={styles.moreSectionHeader}>SESSION</Text>
        <View style={styles.moreMenuCard}>
          <Pressable
            style={styles.moreMenuItem}
            onPress={signOut}>
            <View style={[styles.moreMenuIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
              <Ionicons name="log-out-outline" size={20} color={adminTheme.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moreMenuItemTitle, { color: adminTheme.error }]}>
                Sign Out
              </Text>
              <Text style={styles.moreMenuItemDesc}>
                Safely end your administrative session on this device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.error} />
          </Pressable>
        </View>

        <View style={styles.moreAppInfoFooter}>
          <Text style={styles.moreAppInfoText}>Jumble Sale Admin Command v2.4.0</Text>
          <Text style={styles.moreAppInfoSub}>Cloud Database Sync: Supabase Live</Text>
        </View>
      </ScrollView>
    );
  };

  // ─── SIDEBAR NAVIGATION COMPONENT (Desktop & Mobile Drawer) ──────
  const renderSidebarContent = () => (
    <View style={styles.sidebarInner}>
      {/* Brand Logo Header matching reference */}
      <View style={styles.sidebarHeader}>
        <View style={styles.brandLogoWrap}>
          <View style={styles.brandLogoCircle}>
            <Ionicons name="flash" size={18} color={adminTheme.neon} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.brandLogoTitle}>AdminPortal</Text>
              <View style={styles.neonDot} />
            </View>
            <Text style={styles.brandLogoSub}>Command & Control</Text>
          </View>
        </View>
        {!isDesktop && (
          <Pressable
            onPress={() => setMobileSidebarOpen(false)}
            hitSlop={8}
            style={styles.closeDrawerBtn}>
            <Ionicons name="close" size={22} color={adminTheme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sidebarNavList}>
        {/* Section: HOME */}
        <Text style={styles.sidebarSectionTitle}>HOME</Text>
        <SidebarNavItem
          icon="grid"
          label="Overview"
          active={activeTab === 'overview'}
          onPress={() => handleTabResetOrSwitch('overview')}
        />

        {/* Section: MODERATION QUEUES */}
        <Text style={styles.sidebarSectionTitle}>MODERATION QUEUES</Text>
        <SidebarNavItem
          icon="business"
          label="Brands Queue"
          count={stats?.pendingBrands}
          urgent={Boolean(stats && stats.pendingBrands > 0)}
          active={(activeTab === 'queues' && queuesSubTab === 'brands') || activeTab === 'brands_queue'}
          onPress={() => handleTabResetOrSwitch('brands_queue')}
        />
        <SidebarNavItem
          icon="pricetag"
          label="Deals Queue"
          count={stats?.pendingDeals}
          urgent={Boolean(stats && stats.pendingDeals > 0)}
          active={(activeTab === 'queues' && queuesSubTab === 'deals') || activeTab === 'deals_queue'}
          onPress={() => handleTabResetOrSwitch('deals_queue')}
        />
        <SidebarNavItem
          icon="flag"
          label="Reports"
          count={stats?.pendingReports}
          urgent={Boolean(stats && stats.pendingReports > 0)}
          active={(activeTab === 'more' && moreSubTab === 'reports') || activeTab === 'reports'}
          onPress={() => handleTabResetOrSwitch('reports')}
        />

        {/* Section: CORE MONITORING */}
        <Text style={styles.sidebarSectionTitle}>CORE MONITORING</Text>
        <SidebarNavItem
          icon="business"
          label="Brands Monitoring"
          count={registeredBrands.length}
          active={(activeTab === 'directory' && directorySubTab === 'brands') || activeTab === 'brands'}
          onPress={() => handleTabResetOrSwitch('brands')}
        />
        <SidebarNavItem
          icon="people"
          label="Users Monitoring"
          count={registeredShoppers.length}
          active={(activeTab === 'directory' && directorySubTab === 'users') || activeTab === 'users' || activeTab === 'management'}
          onPress={() => handleTabResetOrSwitch('users')}
        />
        <SidebarNavItem
          icon="pulse"
          label="App Activity & Usage"
          active={(activeTab === 'more' && moreSubTab === 'activity') || activeTab === 'activity_monitoring'}
          onPress={() => handleTabResetOrSwitch('activity_monitoring')}
        />

        {/* Section: GROWTH & MONETIZATION */}
        <Text style={styles.sidebarSectionTitle}>GROWTH & MONETIZATION</Text>
        <SidebarNavItem
          icon="star"
          label="Growth & Sponsored"
          active={activeTab === 'growth_tools'}
          onPress={() => handleTabResetOrSwitch('growth_tools')}
        />

        {/* Section: SYSTEM */}
        <Text style={styles.sidebarSectionTitle}>SYSTEM & LOGS</Text>
        <SidebarNavItem
          icon="newspaper"
          label="Audit Log"
          active={(activeTab === 'more' && moreSubTab === 'audit_log') || activeTab === 'audit_log'}
          onPress={() => handleTabResetOrSwitch('audit_log')}
        />
      </ScrollView>

      {/* Admin User Footer in Sidebar */}
      <View style={styles.sidebarFooter}>
        <View style={styles.sidebarAdminPill}>
          <View style={styles.sidebarAdminAvatar}>
            <Ionicons name="person" size={16} color={adminTheme.neon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidebarAdminName}>Super Admin</Text>
            <Text style={styles.sidebarAdminRole}>System Operator</Text>
          </View>
          <Pressable onPress={signOut} hitSlop={8} style={styles.sidebarLogoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={adminTheme.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.layoutRoot}>
        {/* Persistent Desktop Sidebar */}
        {isDesktop && (
          <View style={styles.desktopSidebar}>
            {renderSidebarContent()}
          </View>
        )}

        {/* Mobile Sidebar Modal Drawer */}
        {!isDesktop && (
          <Modal
            visible={mobileSidebarOpen}
            animationType="slide"
            transparent
            onRequestClose={() => setMobileSidebarOpen(false)}>
            <View style={styles.mobileDrawerOverlay}>
              <View style={styles.mobileDrawerContent}>
                {renderSidebarContent()}
              </View>
              <Pressable
                style={styles.mobileDrawerBackdrop}
                onPress={() => setMobileSidebarOpen(false)}
              />
            </View>
          </Modal>
        )}

        {/* Main Content Pane */}
        <View style={styles.mainContentPane}>
          {/* Top Bar Header (Tailwindadmin inspired) */}
          <View style={styles.topHeader}>
            <View style={styles.topHeaderLeft}>
              {!isDesktop && (
                <Pressable
                  style={styles.hamburgerBtn}
                  onPress={() => setMobileSidebarOpen(true)}>
                  <Ionicons name="menu" size={22} color={adminTheme.textPrimary} />
                </Pressable>
              )}

              {/* Search Bar matching screenshot */}
              <View style={styles.searchBarWrap}>
                <Ionicons name="search" size={16} color={adminTheme.textMuted} />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder={isDesktop ? 'Search directory, promotions, activities...' : 'Search...'}
                  placeholderTextColor={adminTheme.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                    <Ionicons name="close-circle" size={16} color={adminTheme.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.topHeaderRight}>
              {/* Live Status indicator (shown on wider screens) */}
              {width >= 600 && (
                <View style={styles.statusChip}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusChipText}>Live</Text>
                </View>
              )}

              {/* Notification Bell with Dynamic Unread Badge */}
              <NotificationBell
                role="admin"
                userId="admin"
                onPress={() => setNotificationsModalOpen(true)}
                style={styles.headerIconButton}
                iconColor={adminTheme.textSecondary}
              />

              {/* User Avatar Chip */}
              <View style={styles.headerProfileChip}>
                <View style={styles.headerAvatarCircle}>
                  <Text style={styles.headerAvatarInitial}>A</Text>
                </View>
                {isDesktop && <Text style={styles.headerProfileText}>Admin</Text>}
              </View>

              {/* Logout button */}
              <Pressable onPress={signOut} hitSlop={8} style={styles.headerLogoutBtn}>
                <Ionicons name="log-out-outline" size={20} color={adminTheme.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Live Omnibar / Global Search Dropdown Overlay */}
          {searchResults && (
            <>
              <Pressable
                style={styles.searchOverlayBackdrop}
                onPress={() => setSearchQuery('')}
              />
              <View style={[styles.searchDropdown, isDesktop && styles.searchDropdownDesktop]}>
                <View style={styles.searchDropdownHeader}>
                  <Text style={styles.searchDropdownHeaderTitle}>
                    {searchResults.totalCount > 0
                      ? `${searchResults.totalCount} matches found for "${searchQuery}"`
                      : 'Search Results'}
                  </Text>
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                    <Ionicons name="close" size={18} color={adminTheme.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={{ maxHeight: isDesktop ? 480 : 380 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  {searchResults.totalCount === 0 ? (
                    <View style={styles.searchEmptyBox}>
                      <View style={styles.searchEmptyIconWrap}>
                        <Ionicons name="search-outline" size={30} color={adminTheme.textMuted} />
                      </View>
                      <Text style={styles.searchEmptyTitle}>No Results Found</Text>
                      <Text style={styles.searchEmptyDesc}>
                        No admin tools, brands, deals, or users matched "{searchQuery}".
                      </Text>
                      <View style={styles.searchSuggestionsBox}>
                        <Text style={styles.searchSuggestionsTitle}>Try searching for:</Text>
                        <View style={styles.searchSuggestionChips}>
                          {['Notification', 'Brands', 'Deals', 'Shoppers', 'Queues', 'Reports', 'Settings'].map((chip) => (
                            <Pressable
                              key={chip}
                              style={styles.searchSuggestionChip}
                              onPress={() => setSearchQuery(chip.toLowerCase())}>
                              <Text style={styles.searchSuggestionChipText}>{chip}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* Section: Quick Actions & Navigation */}
                      {searchResults.actions.length > 0 && (
                        <View>
                          <Text style={styles.searchSectionTitle}>
                            QUICK ACTIONS & NAVIGATION ({searchResults.actions.length})
                          </Text>
                          {searchResults.actions.map((act) => (
                            <Pressable
                              key={act.id}
                              style={styles.searchResultRow}
                              onPress={() => {
                                act.onPress();
                                setSearchQuery('');
                              }}>
                              <View style={[styles.searchResultIconBox, { backgroundColor: act.iconBg }]}>
                                <Ionicons name={act.icon} size={18} color={act.iconColor} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.searchResultTitle}>{act.title}</Text>
                                <Text style={styles.searchResultSubtitle}>{act.subtitle}</Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={adminTheme.textMuted} />
                            </Pressable>
                          ))}
                        </View>
                      )}

                      {/* Section: Matching Brands */}
                      {searchResults.brands.length > 0 && (
                        <View>
                          <Text style={styles.searchSectionTitle}>
                            BRANDS ({searchResults.brands.length})
                          </Text>
                          {searchResults.brands.map((brand) => (
                            <Pressable
                              key={brand.id}
                              style={styles.searchResultRow}
                              onPress={() => {
                                handleInspectBrand(brand);
                                setSearchQuery('');
                              }}>
                              <View style={[styles.searchResultIconBox, { backgroundColor: adminTheme.neonLight }]}>
                                <Ionicons name="business" size={18} color={adminTheme.neon} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.searchResultTitle}>{brand.name}</Text>
                                <Text style={styles.searchResultSubtitle}>
                                  Brand Partner • {brand.category || 'All Categories'} • {brand.status.toUpperCase()}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={adminTheme.textMuted} />
                            </Pressable>
                          ))}
                        </View>
                      )}

                      {/* Section: Matching Deals */}
                      {searchResults.deals.length > 0 && (
                        <View>
                          <Text style={styles.searchSectionTitle}>
                            PROMOTIONS & DEALS ({searchResults.deals.length})
                          </Text>
                          {searchResults.deals.map((deal) => (
                            <Pressable
                              key={deal.id}
                              style={styles.searchResultRow}
                              onPress={() => {
                                if (deal.brand) {
                                  handleInspectBrand(deal.brand);
                                } else {
                                  handleTabResetOrSwitch('growth_tools');
                                }
                                setSearchQuery('');
                              }}>
                              <View style={[styles.searchResultIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                <Ionicons name="pricetag" size={18} color={adminTheme.warning} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.searchResultTitle}>{deal.title}</Text>
                                <Text style={styles.searchResultSubtitle}>
                                  {deal.brand?.name || 'Deal'} • {deal.discount_percentage ? deal.discount_percentage + '% OFF' : 'Discount'} • {deal.status.toUpperCase()}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={adminTheme.textMuted} />
                            </Pressable>
                          ))}
                        </View>
                      )}

                      {/* Section: Matching Users */}
                      {searchResults.users.length > 0 && (
                        <View>
                          <Text style={styles.searchSectionTitle}>
                            SHOPPERS & USERS ({searchResults.users.length})
                          </Text>
                          {searchResults.users.map((user) => (
                            <Pressable
                              key={user.id}
                              style={styles.searchResultRow}
                              onPress={() => {
                                handleInspectUser(user);
                                setSearchQuery('');
                              }}>
                              <View style={[styles.searchResultIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                                <Ionicons name="person" size={18} color={adminTheme.info} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.searchResultTitle}>{user.display_name || user.email}</Text>
                                <Text style={styles.searchResultSubtitle}>
                                  Registered Shopper • {user.email} • {user.is_active ? 'Active' : 'Suspended'}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={adminTheme.textMuted} />
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </View>
            </>
          )}

          {/* Screen Body */}
          <View style={{ flex: 1 }}>
            {activeTab === 'overview' && renderOverview()}

            {(activeTab === 'directory' || activeTab === 'brands' || activeTab === 'users' || activeTab === 'management') && (
              <View style={{ flex: 1 }}>
                {/* Clean Segmented Tab Switcher for Brands & Shoppers */}
                <View style={styles.segmentedControlWrap}>
                  <Pressable
                    style={[
                      styles.segmentBtn,
                      directorySubTab === 'brands' && styles.segmentBtnActive,
                    ]}
                    onPress={() => setDirectorySubTab('brands')}>
                    <Ionicons
                      name="business"
                      size={16}
                      color={directorySubTab === 'brands' ? adminTheme.textDark : adminTheme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentBtnText,
                        directorySubTab === 'brands' && styles.segmentBtnTextActive,
                      ]}>
                      Brands ({registeredBrands.length})
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.segmentBtn,
                      directorySubTab === 'users' && styles.segmentBtnActive,
                    ]}
                    onPress={() => setDirectorySubTab('users')}>
                    <Ionicons
                      name="people"
                      size={16}
                      color={directorySubTab === 'users' ? adminTheme.textDark : adminTheme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentBtnText,
                        directorySubTab === 'users' && styles.segmentBtnTextActive,
                      ]}>
                      Shoppers ({registeredShoppers.length})
                    </Text>
                  </Pressable>
                </View>

                {directorySubTab === 'brands' ? (
                  <AdminBrandsSection
                    brands={registeredBrands}
                    loading={loadingRegisteredBrands}
                    onRefresh={refetchRegisteredBrands}
                    onSelectBrand={handleInspectBrand}
                    onToggleBrandSuspension={handleToggleBrandSuspension}
                    onDeleteBrand={handleDeleteBrand}
                  />
                ) : (
                  <AdminUsersSection
                    users={registeredShoppers}
                    loading={loadingRegisteredShoppers}
                    onRefresh={refetchRegisteredShoppers}
                    onSelectUser={handleInspectUser}
                    onToggleUserSuspension={handleToggleUserSuspension}
                    onDeleteUser={handleDeleteUser}
                  />
                )}
              </View>
            )}

            {(activeTab === 'queues' || activeTab === 'brands_queue' || activeTab === 'deals_queue') && (
              <View style={{ flex: 1 }}>
                {/* Clean Segmented Tab Switcher for Pending Queues */}
                <View style={styles.segmentedControlWrap}>
                  <Pressable
                    style={[
                      styles.segmentBtn,
                      queuesSubTab === 'brands' && styles.segmentBtnActive,
                    ]}
                    onPress={() => setQueuesSubTab('brands')}>
                    <Ionicons
                      name="business"
                      size={16}
                      color={queuesSubTab === 'brands' ? adminTheme.textDark : adminTheme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentBtnText,
                        queuesSubTab === 'brands' && styles.segmentBtnTextActive,
                      ]}>
                      Brand Approvals ({stats?.pendingBrands || 0})
                    </Text>
                    {Boolean(stats && stats.pendingBrands > 0) && (
                      <View style={styles.segmentBadge}>
                        <Text style={styles.segmentBadgeText}>{stats?.pendingBrands}</Text>
                      </View>
                    )}
                  </Pressable>

                  <Pressable
                    style={[
                      styles.segmentBtn,
                      queuesSubTab === 'deals' && styles.segmentBtnActive,
                    ]}
                    onPress={() => setQueuesSubTab('deals')}>
                    <Ionicons
                      name="pricetag"
                      size={16}
                      color={queuesSubTab === 'deals' ? adminTheme.textDark : adminTheme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentBtnText,
                        queuesSubTab === 'deals' && styles.segmentBtnTextActive,
                      ]}>
                      Deal Verifications ({stats?.pendingDeals || 0})
                    </Text>
                    {Boolean(stats && stats.pendingDeals > 0) && (
                      <View style={styles.segmentBadge}>
                        <Text style={styles.segmentBadgeText}>{stats?.pendingDeals}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>

                {queuesSubTab === 'brands' ? renderBrandsQueue() : renderDealsQueue()}
              </View>
            )}

            {activeTab === 'growth_tools' && (
              <AdminGrowthToolsSection
                deals={allDealsForAdmin}
                brands={allBrands}
                categories={adminCategories}
                orders={adminOrders}
                onRefetchDeals={refetchAllDeals}
                onRefetchCategories={refetchAdminCategories}
              />
            )}

            {(activeTab === 'more' || activeTab === 'reports' || activeTab === 'audit_log' || activeTab === 'activity_monitoring') &&
              renderMore()}
          </View>
        </View>
      </View>

      {/* Reason Input Modal */}
      <Modal
        visible={reasonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{reasonModalTitle}</Text>
              <Pressable
                onPress={() => setReasonModalVisible(false)}
                hitSlop={8}>
                <Ionicons name="close" size={22} color={adminTheme.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.modalPrompt}>{reasonModalPrompt}</Text>

            {reasonPresets.length > 0 && (
              <View style={styles.presetChipsWrap}>
                <Text style={styles.presetChipsTitle}>Quick Compliance Reasons:</Text>
                <View style={styles.presetChipsRow}>
                  {reasonPresets.map((preset) => {
                    const isSelected = reasonInput === preset;
                    return (
                      <Pressable
                        key={preset}
                        style={[
                          styles.presetChip,
                          isSelected && styles.presetChipActive,
                        ]}
                        onPress={() => setReasonInput(preset)}>
                        <Text
                          style={[
                            styles.presetChipText,
                            isSelected && styles.presetChipTextActive,
                          ]}>
                          {preset}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <TextInput
              style={styles.modalTextInput}
              placeholder="Enter official reason or select a preset above..."
              placeholderTextColor={adminTheme.textMuted}
              multiline
              numberOfLines={4}
              value={reasonInput}
              onChangeText={setReasonInput}
              textAlignVertical="top"
            />

            <View style={styles.modalActionRow}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setReasonModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="Confirm & Submit"
                variant="primary"
                loading={modalLoading}
                onPress={handleModalSubmit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Brand Detailed Intelligence Drawer */}
      <BrandDetailDrawer
        visible={brandDrawerVisible}
        data={selectedBrandIntelligence}
        loading={loadingBrandIntelligence}
        onClose={() => setBrandDrawerVisible(false)}
        onToggleDealStatus={async (deal) => {
          await handleToggleDealStatus(deal);
          if (selectedBrandIntelligence) {
            handleInspectBrand(selectedBrandIntelligence.brand);
          }
        }}
        onDeleteDeal={async (deal) => {
          handleDeletePost(deal);
          if (selectedBrandIntelligence) {
            handleInspectBrand(selectedBrandIntelligence.brand);
          }
        }}
        onToggleBrandSuspension={async (brand) => {
          await handleToggleBrandSuspension(brand);
          if (selectedBrandIntelligence) {
            handleInspectBrand(brand);
          }
        }}
      />

      {/* User Detailed Intelligence Drawer */}
      <UserDetailDrawer
        visible={userDrawerVisible}
        data={selectedUserIntelligence}
        loading={loadingUserIntelligence}
        onClose={() => setUserDrawerVisible(false)}
        onToggleUserSuspension={async (targetUser) => {
          handleToggleUserSuspension(targetUser);
          if (selectedUserIntelligence) {
            handleInspectUser(targetUser);
          }
        }}
      />

      {/* In-App Notification Center Modal */}
      <NotificationCenterModal
        visible={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        role="admin"
        userId="admin"
        onAdminNavigate={(tab) => {
          if (['brands', 'brands_queue', 'deals_queue', 'reports', 'overview', 'audit_log'].includes(tab)) {
            handleTabResetOrSwitch(tab as any);
          }
        }}
      />

      {/* ─── MOBILE BOTTOM NAVIGATION BAR (Clean 5-Tab Bar, 0% Redundancy) ─── */}
      {!isDesktop && (
        <View style={styles.adminBottomNav}>
          {[
            {
              id: 'overview' as AdminTab,
              label: 'Overview',
              icon: 'grid',
              iconOutline: 'grid-outline',
            },
            {
              id: 'directory' as AdminTab,
              label: 'Directory',
              icon: 'people',
              iconOutline: 'people-outline',
            },
            {
              id: 'queues' as AdminTab,
              label: 'Queues',
              icon: 'hourglass',
              iconOutline: 'hourglass-outline',
              badge: (stats?.pendingBrands || 0) + (stats?.pendingDeals || 0),
            },
            {
              id: 'growth_tools' as AdminTab,
              label: 'Growth',
              icon: 'rocket',
              iconOutline: 'rocket-outline',
            },
            {
              id: 'more' as AdminTab,
              label: 'Settings',
              icon: 'settings',
              iconOutline: 'settings-outline',
              badge: stats?.pendingReports || 0,
            },
          ].map((tabItem) => {
            const isTabActive =
              activeTab === tabItem.id ||
              (tabItem.id === 'directory' && (activeTab === 'brands' || activeTab === 'users' || activeTab === 'management')) ||
              (tabItem.id === 'queues' && (activeTab === 'brands_queue' || activeTab === 'deals_queue')) ||
              (tabItem.id === 'more' && (activeTab === 'reports' || activeTab === 'audit_log' || activeTab === 'activity_monitoring'));
            return (
              <Pressable
                key={tabItem.id}
                style={styles.adminBottomNavItem}
                onPress={() => handleTabResetOrSwitch(tabItem.id)}>
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name={(isTabActive ? tabItem.icon : tabItem.iconOutline) as any}
                    size={22}
                    color={isTabActive ? adminTheme.neon : adminTheme.textMuted}
                  />
                  {Boolean(typeof tabItem.badge === 'number' && tabItem.badge > 0) && (
                    <View style={styles.navBadge}>
                      <Text style={styles.navBadgeText}>
                        {(tabItem.badge ?? 0) > 99 ? '99+' : tabItem.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.adminBottomNavText,
                    isTabActive && styles.adminBottomNavTextActive,
                  ]}>
                  {tabItem.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────

function SidebarNavItem({
  icon,
  label,
  count,
  urgent,
  active,
  onPress,
}: {
  icon: any;
  label: string;
  count?: number;
  urgent?: boolean;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        sidebarStyles.item,
        active && sidebarStyles.itemActive,
      ]}
      onPress={onPress}>
      <Ionicons
        name={active ? icon : `${icon}-outline`}
        size={18}
        color={active ? adminTheme.textDark : adminTheme.textSecondary}
      />
      <Text style={[sidebarStyles.label, active && sidebarStyles.labelActive]}>
        {label}
      </Text>
      {Boolean(count && count > 0) && (
        <View
          style={[
            sidebarStyles.badge,
            urgent ? sidebarStyles.badgeUrgent : sidebarStyles.badgeNormal,
            active && sidebarStyles.badgeActive,
          ]}>
          <Text
            style={[
              sidebarStyles.badgeText,
              active && sidebarStyles.badgeTextActive,
            ]}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accentColor,
  urgent = false,
  onPress,
}: {
  icon: any;
  label: string;
  value: number | string;
  accentColor: string;
  urgent?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[
        metricStyles.card,
        urgent && metricStyles.cardUrgent,
      ]}
      onPress={onPress}
      disabled={!onPress}>
      <View style={[metricStyles.iconBox, { backgroundColor: accentColor + '20' }]}>
        <Ionicons name={icon} size={22} color={accentColor} />
      </View>
      <Text style={metricStyles.value}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
      {urgent && <View style={metricStyles.urgentDot} />}
    </Pressable>
  );
}

function QuickNavBtn({
  label,
  icon,
  count,
  active,
  onPress,
}: {
  label: string;
  icon: any;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[quickNavStyles.btn, active && quickNavStyles.btnActive]}
      onPress={onPress}>
      <Ionicons
        name={icon}
        size={15}
        color={active ? adminTheme.textDark : adminTheme.textSecondary}
      />
      <Text style={[quickNavStyles.label, active && quickNavStyles.labelActive]}>
        {label}
      </Text>
      {Boolean(count && count > 0) && (
        <View style={[quickNavStyles.badge, active && quickNavStyles.badgeActive]}>
          <Text style={[quickNavStyles.badgeText, active && quickNavStyles.badgeTextActive]}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function AuditLogItem({ log }: { log: AdminAuditLog & { admin?: Profile } }) {
  const isApprove = log.action.includes('approve');
  const isReject = log.action.includes('reject') || log.action.includes('delete');
  const actionColor = isApprove ? adminTheme.neon : isReject ? adminTheme.error : '#00E5FF';

  return (
    <View style={auditStyles.row}>
      <View style={[auditStyles.actionTag, { backgroundColor: actionColor + '18' }]}>
        <Text style={[auditStyles.actionText, { color: actionColor }]}>
          {log.action.replace('_', ' ').toUpperCase()}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={auditStyles.detailsText}>
          Target: <Text style={auditStyles.bold}>{log.target_type}</Text>
          {log.details && (log.details as any).title
            ? ` — "${(log.details as any).title}"`
            : log.details && (log.details as any).brand_name
            ? ` — "${(log.details as any).brand_name}"`
            : log.details && (log.details as any).email
            ? ` — ${(log.details as any).email}`
            : ''}
        </Text>
        {log.details && (log.details as any).reason ? (
          <Text style={auditStyles.reasonSub}>
            Reason: {(log.details as any).reason}
          </Text>
        ) : null}
      </View>

      <Text style={auditStyles.dateText}>
        {new Date(log.created_at).toLocaleTimeString('en-PK', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon} size={14} color={adminTheme.textSecondary} />
      <Text style={infoStyles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
  },
  adminBottomNav: {
    height: 60,
    backgroundColor: adminTheme.bgSidebar,
    borderTopWidth: 1,
    borderTopColor: adminTheme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing[2],
  },
  adminBottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  adminBottomNavText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
    color: adminTheme.textMuted,
    marginTop: 2,
  },
  adminBottomNavTextActive: {
    color: adminTheme.neon,
    fontWeight: '800',
  },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: adminTheme.error,
    borderRadius: radii.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadgeText: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  layoutRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopSidebar: {
    width: 250,
    backgroundColor: adminTheme.bgSidebar,
    borderRightWidth: 1,
    borderRightColor: adminTheme.border,
  },
  mobileDrawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  mobileDrawerContent: {
    width: 280,
    backgroundColor: adminTheme.bgSidebar,
    height: '100%',
  },
  mobileDrawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  sidebarInner: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  brandLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  brandLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: adminTheme.neonLight,
    borderWidth: 1,
    borderColor: adminTheme.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  neonDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: adminTheme.neon,
  },
  brandLogoSub: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  closeDrawerBtn: {
    padding: spacing[1],
  },
  sidebarNavList: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: 4,
  },
  sidebarSectionTitle: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: spacing[3],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[2],
  },
  sidebarFooter: {
    padding: spacing[3],
    borderTopWidth: 1,
    borderTopColor: adminTheme.border,
  },
  sidebarAdminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: adminTheme.bgCard,
    padding: spacing[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  sidebarAdminAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminTheme.neonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarAdminName: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontSize: 13,
  },
  sidebarAdminRole: {
    ...typography.caption,
    color: adminTheme.neon,
    fontSize: 10,
  },
  sidebarLogoutBtn: {
    padding: spacing[1],
  },

  // Main Content Pane
  mainContentPane: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
    position: 'relative',
    zIndex: 100,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    gap: spacing[3],
  },
  topHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 0,
  },
  hamburgerBtn: {
    padding: spacing[1],
  },
  searchBarWrap: {
    flex: 1,
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.full,
    paddingHorizontal: spacing[3],
    paddingVertical: Platform.OS === 'ios' ? spacing[2] : 4,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
    minWidth: 0,
    overflow: 'hidden',
  },
  searchBarInput: {
    flex: 1,
    color: adminTheme.textPrimary,
    fontSize: 13,
    paddingVertical: 2,
    minWidth: 0,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: adminTheme.neon,
  },
  statusChipText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 11,
  },
  headerIconButton: {
    position: 'relative',
    padding: 6,
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: adminTheme.neon,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationDotText: {
    color: adminTheme.textDark,
    fontSize: 9,
    fontWeight: 'bold',
  },
  headerProfileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: adminTheme.bgCard,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  headerAvatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: adminTheme.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitial: {
    color: adminTheme.textDark,
    fontWeight: 'bold',
    fontSize: 12,
  },
  headerProfileText: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontWeight: '600',
    paddingRight: 4,
  },
  headerLogoutBtn: {
    padding: 6,
  },

  // Omnibar & Search Dropdown
  searchOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 9998,
  },
  searchDropdown: {
    position: 'absolute',
    top: 56,
    left: spacing[3],
    right: spacing[3],
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
    borderRadius: radii.lg,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 24,
    overflow: 'hidden',
  },
  searchDropdownDesktop: {
    left: 48,
    right: 'auto',
    width: 500,
  },
  searchDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  searchDropdownHeaderTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.neon,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchSectionTitle: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: adminTheme.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
    backgroundColor: adminTheme.bgCard,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  searchResultIconBox: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultTitle: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  searchResultSubtitle: {
    ...typography.caption,
    fontSize: 11,
    color: adminTheme.textMuted,
    marginTop: 1,
  },
  searchEmptyBox: {
    padding: spacing[6],
    alignItems: 'center',
    gap: spacing[2],
  },
  searchEmptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  searchEmptyTitle: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '800',
    color: adminTheme.textPrimary,
  },
  searchEmptyDesc: {
    ...typography.caption,
    fontSize: 12,
    color: adminTheme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
  searchSuggestionsBox: {
    marginTop: spacing[3],
    alignItems: 'center',
    gap: spacing[2],
  },
  searchSuggestionsTitle: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.textMuted,
  },
  searchSuggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing[2],
  },
  searchSuggestionChip: {
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
  },
  searchSuggestionChipText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.neon,
  },

  // Segmented Control Switcher
  segmentedControlWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
    paddingHorizontal: spacing[3],
  },
  segmentBtnActive: {
    backgroundColor: adminTheme.neon,
    borderColor: adminTheme.neon,
  },
  segmentBtnText: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.textSecondary,
  },
  segmentBtnTextActive: {
    color: adminTheme.textDark,
    fontWeight: '800',
  },
  segmentBadge: {
    backgroundColor: adminTheme.error,
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Subview Header with Back button
  subviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  subviewBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: adminTheme.neonLight,
  },
  subviewBackText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.neon,
  },
  subviewHeaderTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },

  // More Menu View Styles
  moreContainer: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
  },
  moreContentContainer: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  moreAdminProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
    borderRadius: radii.lg,
    padding: spacing[4],
    gap: spacing[3],
    marginBottom: spacing[5],
  },
  moreAdminAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: adminTheme.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreAdminAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: adminTheme.textDark,
  },
  moreAdminName: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  moreAdminRoleBadge: {
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  moreAdminRoleBadgeText: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: '800',
    color: adminTheme.neon,
  },
  moreAdminEmail: {
    ...typography.caption,
    fontSize: 12,
    color: adminTheme.textMuted,
    marginTop: 2,
  },
  moreAdminStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  moreAdminStatusText: {
    ...typography.caption,
    fontSize: 11,
    color: adminTheme.neon,
    fontWeight: '600',
  },
  moreSectionHeader: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: adminTheme.textMuted,
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  moreMenuCard: {
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing[5],
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    gap: spacing[3],
  },
  moreMenuIconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuItemTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.textPrimary,
  },
  moreMenuItemDesc: {
    ...typography.caption,
    fontSize: 11,
    color: adminTheme.textMuted,
    marginTop: 2,
  },
  moreItemBadge: {
    backgroundColor: adminTheme.errorBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.error,
  },
  moreItemBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: adminTheme.error,
  },
  moreItemDivider: {
    height: 1,
    backgroundColor: adminTheme.border,
    marginLeft: 56,
  },
  moreAppInfoFooter: {
    alignItems: 'center',
    marginTop: spacing[4],
    gap: 4,
  },
  moreAppInfoText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.textSecondary,
  },
  moreAppInfoSub: {
    ...typography.caption,
    fontSize: 10,
    color: adminTheme.textMuted,
  },

  // Quick Horizontal Nav Row
  quickNavRow: {
    backgroundColor: adminTheme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    paddingVertical: 6,
  },
  quickNavScroll: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },

  // Scroll Content
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
    paddingBottom: spacing[12],
  },
  queueContainer: {
    flex: 1,
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[4],
    paddingBottom: spacing[12],
  },
  searchHeader: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  sectionHeading: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Hero Card
  heroCard: {
    position: 'relative',
    borderRadius: radii.xl,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[3],
    overflow: 'hidden',
  },
  heroGlowBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: adminTheme.neonGlow,
    opacity: 0.15,
  },
  heroLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minWidth: 260,
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  heroAvatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 2,
    borderColor: adminTheme.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: adminTheme.neon,
    borderWidth: 2,
    borderColor: adminTheme.bgCard,
  },
  heroTitle: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  heroWave: {
    fontSize: 18,
  },
  heroSubtitle: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    marginTop: 2,
    fontSize: 12,
  },
  heroStatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.neon,
  },
  heroStatsBadgeText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 11,
  },

  // KPI Metrics Row (Tailwindadmin inspired)
  statsKpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },

  // Urgent Banner
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: adminTheme.warningBg,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: adminTheme.warning + '60',
  },
  urgentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: adminTheme.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: {
    ...typography.bodyMedium,
    color: adminTheme.warning,
    fontSize: 14,
    fontWeight: 'bold',
  },
  urgentSubtitle: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    marginTop: 2,
  },
  urgentArrow: {
    padding: spacing[1],
  },

  // Two column dashboard row
  dashboardGridRow: {
    gap: spacing[4],
  },
  dashboardGridCol: {
    gap: spacing[4],
  },
  panelCard: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: adminTheme.border,
    gap: spacing[3],
  },
  panelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  panelCardTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  panelCardSub: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  pillToggleWrap: {
    flexDirection: 'row',
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  pillToggleBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  pillToggleBtnActive: {
    backgroundColor: adminTheme.neon,
  },
  pillToggleText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  pillToggleTextActive: {
    color: adminTheme.textDark,
  },
  streamList: {
    gap: spacing[2],
  },
  emptyFeedText: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing[3],
  },
  viewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing[2],
  },
  viewMoreText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  liveActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  liveActivityIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  liveActivityText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 12,
  },
  liveActivityTime: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
    marginTop: 2,
  },

  // Gauge Card (Yearly Backup inspired)
  badgePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  badgePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: adminTheme.neon,
  },
  badgePulseText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 10,
  },
  gaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  gaugeInfo: {
    gap: 2,
  },
  gaugeValue: {
    ...typography.h1,
    color: adminTheme.textPrimary,
    fontSize: 34,
    fontWeight: 'bold',
  },
  gaugeLabel: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 12,
  },
  growthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  growthText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 11,
  },
  circularRingOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 8,
    borderColor: adminTheme.neonGlow,
    borderTopColor: adminTheme.neon,
    borderRightColor: adminTheme.neon,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  circularRingTrack: {
    position: 'absolute',
  },
  circularRingActiveArc: {
    position: 'absolute',
  },
  circularRingInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  gaugeBreakdownList: {
    gap: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: adminTheme.border,
  },
  gaugeBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gaugeBreakdownLabel: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    flex: 1,
    fontSize: 12,
  },
  gaugeBreakdownValue: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Standard Card in Lists
  card: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: adminTheme.border,
    gap: spacing[3],
  },
  cardSelected: {
    borderColor: adminTheme.neon,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  brandIconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: adminTheme.neonLight,
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  cardSub: {
    ...typography.caption,
    color: adminTheme.textSecondary,
  },
  timestampText: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  docBox: {
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.lg,
    padding: spacing[3],
    gap: spacing[2],
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  docBoxTitle: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
  },
  docLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: adminTheme.bgCard,
    padding: spacing[2],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  docLinkText: {
    ...typography.caption,
    color: adminTheme.neon,
    flex: 1,
  },
  noDocText: {
    ...typography.caption,
    color: adminTheme.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  previewTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  consumerCardPreview: {
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  consumerCardImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  consumerCardImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: adminTheme.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consumerCardBody: {
    padding: spacing[4],
    gap: spacing[2],
  },
  consumerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  consumerBrandName: {
    ...typography.bodyMedium,
    color: adminTheme.textSecondary,
    fontSize: 13,
  },
  consumerTitle: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 16,
  },
  consumerDescription: {
    ...typography.body,
    color: adminTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  consumerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: 2,
  },
  consumerMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.bgCard,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  consumerMetaText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  consumerTerms: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  managementControls: {
    padding: spacing[4],
    gap: spacing[3],
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  subTabBtnActive: {
    backgroundColor: adminTheme.neon,
    borderColor: adminTheme.neon,
  },
  subTabText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontWeight: 'bold',
  },
  subTabTextActive: {
    color: adminTheme.textDark,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: adminTheme.neonLight,
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    ...typography.bodyMedium,
    color: adminTheme.neon,
    fontSize: 16,
    fontWeight: 'bold',
  },
  filterTabsRow: {
    flexDirection: 'row',
    padding: spacing[4],
    gap: spacing[2],
    backgroundColor: adminTheme.bgSidebar,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  reportFilterBtn: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  reportFilterBtnActive: {
    backgroundColor: adminTheme.neon,
    borderColor: adminTheme.neon,
  },
  reportFilterText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  reportFilterTextActive: {
    color: adminTheme.textDark,
  },
  reasonCardBox: {
    backgroundColor: adminTheme.errorBg,
    borderRadius: radii.md,
    padding: spacing[3],
    gap: 2,
    borderWidth: 1,
    borderColor: adminTheme.error + '40',
  },
  reasonLabel: {
    ...typography.caption,
    color: adminTheme.error,
    fontWeight: 'bold',
  },
  reasonBody: {
    ...typography.body,
    color: adminTheme.textPrimary,
    fontSize: 13,
  },
  activityFeedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: adminTheme.border,
    gap: spacing[3],
  },
  activityIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: adminTheme.bgSidebar,
    borderRadius: radii.xl,
    padding: spacing[6],
    gap: spacing[4],
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 17,
  },
  modalPrompt: {
    ...typography.body,
    color: adminTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalTextInput: {
    backgroundColor: adminTheme.bgInput,
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: adminTheme.border,
    minHeight: 100,
    color: adminTheme.textPrimary,
    ...typography.body,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  presetChipsWrap: {
    gap: 6,
    marginVertical: 4,
  },
  presetChipsTitle: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  presetChipActive: {
    backgroundColor: adminTheme.neonLight,
    borderColor: adminTheme.neon,
  },
  presetChipText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  presetChipTextActive: {
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  consumerPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    marginTop: 2,
  },
  consumerDiscountPrice: {
    ...typography.bodyMedium,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 15,
  },
  consumerOriginalPrice: {
    ...typography.caption,
    color: adminTheme.textMuted,
    textDecorationLine: 'line-through',
    fontSize: 12,
  },
  dealExtrasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  promoCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.neonLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: adminTheme.neonGlow,
  },
  promoCodeText: {
    ...typography.caption,
    color: adminTheme.neon,
    fontSize: 11,
    fontWeight: 'bold',
  },
  buyLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
    maxWidth: 220,
  },
  buyLinkText: {
    ...typography.caption,
    color: '#00E5FF',
    fontSize: 11,
  },
  rejectionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.warningBg,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: adminTheme.warning + '40',
  },
  rejectionNoticeText: {
    ...typography.caption,
    color: adminTheme.warning,
    fontSize: 11,
    flex: 1,
  },
});

const sidebarStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radii.full,
    marginBottom: 2,
  },
  itemActive: {
    backgroundColor: adminTheme.neon,
  },
  label: {
    ...typography.bodyMedium,
    color: adminTheme.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  labelActive: {
    color: adminTheme.textDark,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radii.full,
  },
  badgeNormal: {
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  badgeUrgent: {
    backgroundColor: adminTheme.warning,
  },
  badgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  badgeText: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeTextActive: {
    color: adminTheme.textDark,
  },
});

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 135,
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.xl,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: adminTheme.border,
    position: 'relative',
    overflow: 'hidden',
    gap: 4,
  },
  cardUrgent: {
    borderColor: adminTheme.warning + '80',
    backgroundColor: adminTheme.warningBg,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: {
    ...typography.h2,
    color: adminTheme.textPrimary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  label: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  urgentDot: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: adminTheme.warning,
  },
});

const quickNavStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgInput,
    borderWidth: 1,
    borderColor: adminTheme.borderLight,
  },
  btnActive: {
    backgroundColor: adminTheme.neon,
    borderColor: adminTheme.neon,
  },
  label: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },
  labelActive: {
    color: adminTheme.textDark,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.full,
    backgroundColor: adminTheme.warning,
  },
  badgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  badgeText: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontSize: 9,
    fontWeight: 'bold',
  },
  badgeTextActive: {
    color: adminTheme.textDark,
  },
});

const auditStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  actionTag: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  actionText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: 'bold',
  },
  detailsText: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontSize: 12,
  },
  bold: {
    fontWeight: 'bold',
  },
  reasonSub: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
  },
  dateText: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  text: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 12,
  },
});
