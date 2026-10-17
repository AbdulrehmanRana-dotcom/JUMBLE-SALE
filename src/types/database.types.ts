export type UserRole = 'consumer' | 'brand' | 'admin';
export type BrandStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type DealType = 'online' | 'in_store';
export type DealStatus = 'draft' | 'pending' | 'active' | 'rejected' | 'expired' | 'suspended';
export type InteractionType = 'view' | 'click' | 'save' | 'like' | 'report';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  full_name?: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  push_token: string | null;
  brand_name?: string | null;
  brand_phone?: string | null;
  brand_website?: string | null;
  brand_status?: BrandStatus | 'pending' | 'approved';
  notifications_enabled?: boolean;
  created_at: string;
}

export interface Brand {
  id: string;
  owner_id: string;
  name: string;
  business_email: string;
  contact_number: string | null;
  category: string | null;
  social_links: Record<string, any> | null;
  logo_url: string | null;
  verification_doc_urls: string[] | null;
  status: BrandStatus;
  is_verified: boolean;
  rejection_reason: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
}

export interface Deal {
  id: string;
  brand_id: string;
  title: string;
  description: string;
  category_id: string | null;
  discount_pct: number;
  discount_percentage?: number | null;
  original_price?: number | null;
  discount_price?: number | null;
  promo_code?: string | null;
  banner_url?: string | null;
  start_date: string;
  end_date: string;
  deal_type: DealType;
  city: string | null;
  image_urls: string[] | null;
  terms: string | null;
  status: DealStatus;
  rejection_reason: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  brand?: Brand & Profile;
  category?: Category;
  is_saved?: boolean;
  is_liked?: boolean;
  buy_url?: string | null;
  website_url?: string | null;
}

export type Promotion = Deal;

export interface Follow {
  user_id: string;
  brand_id: string;
  created_at: string;
}

export interface SavedDeal {
  user_id: string;
  deal_id: string;
  created_at: string;
}

export interface Like {
  user_id: string;
  deal_id: string;
  created_at: string;
}

export interface Interaction {
  id: string;
  user_id: string | null;
  deal_id: string;
  type: InteractionType;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string | null;
  deal_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
}

export interface Comment {
  id: string;
  deal_id: string;
  user_id?: string | null;
  user_name: string;
  user_avatar?: string | null;
  text: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  deal_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  deal_context_id: string | null;
  created_at: string;
}

export interface UserPreference {
  user_id: string;
  favorite_categories: string[] | null;
  preferred_cities: string[] | null;
  preference_vector?: number[] | null;
  updated_at: string;
}

export interface RecommendationDeal {
  id: string;
  brand_id: string;
  brand_name: string;
  brand_logo: string | null;
  category_id: string | null;
  category_name: string | null;
  title: string;
  description: string;
  discount_pct: number;
  deal_type: DealType;
  city: string | null;
  image_urls: string[] | null;
  start_date: string;
  end_date: string;
  status: DealStatus;
  terms: string | null;
  recommendation_score: number;
  recommendation_reason: string;
}

export interface AnalyticsDaily {
  id: string;
  date: string;
  deal_id: string | null;
  brand_id: string | null;
  views_count: number;
  clicks_count: number;
  saves_count: number;
  likes_count: number;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
      };
      brands: {
        Row: Brand;
        Insert: Partial<Brand> & { owner_id: string; name: string; business_email: string };
        Update: Partial<Brand>;
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & { name: string };
        Update: Partial<Category>;
      };
      deals: {
        Row: Deal;
        Insert: Partial<Deal> & { brand_id: string; title: string; description: string; discount_pct: number; end_date: string };
        Update: Partial<Deal>;
      };
      promotions: {
        Row: Deal;
        Insert: Partial<Deal> & { brand_id: string; title: string; description: string; discount_pct: number; end_date: string };
        Update: Partial<Deal>;
      };
      follows: {
        Row: Follow;
        Insert: Follow;
        Update: Partial<Follow>;
      };
      saved_deals: {
        Row: SavedDeal;
        Insert: SavedDeal;
        Update: Partial<SavedDeal>;
      };
      likes: {
        Row: Like;
        Insert: Like;
        Update: Partial<Like>;
      };
      comments: {
        Row: Comment;
        Insert: Partial<Comment> & { deal_id: string; text: string };
        Update: Partial<Comment>;
      };
      interactions: {
        Row: Interaction;
        Insert: Omit<Interaction, 'id' | 'created_at'>;
        Update: Partial<Interaction>;
      };
      reports: {
        Row: Report;
        Insert: Omit<Report, 'id' | 'created_at'>;
        Update: Partial<Report>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Notification>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'>;
        Update: Partial<ChatMessage>;
      };
      user_preferences: {
        Row: UserPreference;
        Insert: UserPreference;
        Update: Partial<UserPreference>;
      };
      analytics_daily: {
        Row: AnalyticsDaily;
        Insert: Omit<AnalyticsDaily, 'id' | 'created_at'>;
        Update: Partial<AnalyticsDaily>;
      };
      admin_audit_log: {
        Row: AdminAuditLog;
        Insert: Omit<AdminAuditLog, 'id' | 'created_at'>;
        Update: Partial<AdminAuditLog>;
      };
    };
    Functions: {
      get_active_deals: {
        Args: {
          p_category_id?: string;
          p_city?: string;
          p_search?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: string;
          brand_id: string;
          title: string;
          description: string;
          category_id: string | null;
          discount_pct: number;
          start_date: string;
          end_date: string;
          deal_type: DealType;
          city: string | null;
          image_urls: string[] | null;
          terms: string | null;
          status: DealStatus;
          created_at: string;
          brand_name: string;
          brand_logo: string | null;
        }[];
      };
      get_admin_dashboard_stats: {
        Args: Record<string, never>;
        Returns: Record<string, any>;
      };
      admin_approve_brand: {
        Args: { p_brand_id: string };
        Returns: Record<string, any>;
      };
      admin_reject_brand: {
        Args: { p_brand_id: string; p_reason: string };
        Returns: Record<string, any>;
      };
      admin_suspend_brand: {
        Args: { p_brand_id: string; p_reason?: string | null };
        Returns: Record<string, any>;
      };
      admin_reactivate_brand: {
        Args: { p_brand_id: string };
        Returns: Record<string, any>;
      };
      admin_delete_brand: {
        Args: { p_brand_id: string };
        Returns: Record<string, any>;
      };
      admin_approve_deal: {
        Args: { p_deal_id: string };
        Returns: Record<string, any>;
      };
      admin_reject_deal: {
        Args: { p_deal_id: string; p_reason: string };
        Returns: Record<string, any>;
      };
      admin_suspend_deal: {
        Args: { p_deal_id: string; p_reason?: string | null };
        Returns: Record<string, any>;
      };
      admin_set_user_status: {
        Args: { p_user_id: string; p_is_active: boolean; p_reason?: string | null };
        Returns: Record<string, any>;
      };
      admin_delete_user: {
        Args: { p_user_id: string };
        Returns: Record<string, any>;
      };
      admin_resolve_report: {
        Args: { p_report_id: string; p_action: string; p_reason?: string | null };
        Returns: Record<string, any>;
      };
    };
  };
};
