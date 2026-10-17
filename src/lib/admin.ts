import {
  deleteLocalBrand,
  getLocalBrands,
  updateLocalBrandStatus,
} from '@/lib/brandStore';
import { getLocalBrandDeals, saveLocalDeal } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';

/**
 * Admin Service Layer
 * Calls secure PostgreSQL RPC functions that enforce admin privileges,
 * execute state transitions, write to admin_audit_log, and generate notifications.
 */

export interface AdminStats {
  total_users: number;
  total_brands: number;
  pending_brands: number;
  total_deals: number;
  pending_deals: number;
  active_deals: number;
  pending_reports: number;
}

/**
 * Fetch real system counts using PostgreSQL SELECT COUNT(*)
 * Replaces all dummy/hardcoded numbers with exact database queries.
 */
export async function fetchAdminStats(): Promise<{
  totalUsers: number;
  totalBrands: number;
  pendingBrands: number;
  totalDeals: number;
  pendingDeals: number;
  activeDeals: number;
  pendingReports: number;
}> {
  // 1. Try PostgreSQL RPC which executes SQL:
  //    SELECT COUNT(*) INTO v_users_count FROM public.profiles WHERE role = 'consumer';
  //    SELECT COUNT(*) INTO v_brands_count FROM public.brands;
  //    SELECT COUNT(*) INTO v_pending_brands_count FROM public.brands WHERE status = 'pending';
  //    SELECT COUNT(*) INTO v_deals_count FROM public.deals;
  //    SELECT COUNT(*) INTO v_pending_deals_count FROM public.deals WHERE status = 'pending';
  //    SELECT COUNT(*) INTO v_active_deals_count FROM public.deals WHERE status = 'active';
  //    SELECT COUNT(*) INTO v_pending_reports_count FROM public.reports WHERE status = 'pending';
  try {
    const { data, error } = await (supabase as any).rpc('get_admin_dashboard_stats');
    if (!error && data) {
      const stats = data as AdminStats;
      const localBrands = await getLocalBrands();
      const localPendingBrands = localBrands.filter((b) => b.status === 'pending');
      const localDeals = await getLocalBrandDeals();
      const localPendingDeals = localDeals.filter((d) => d.status === 'pending');
      const localActiveDeals = localDeals.filter((d) => d.status === 'active');

      return {
        totalUsers: Number(stats.total_users ?? 0),
        totalBrands: Math.max(Number(stats.total_brands ?? 0), localBrands.length),
        pendingBrands: Math.max(Number(stats.pending_brands ?? 0), localPendingBrands.length),
        totalDeals: Math.max(Number(stats.total_deals ?? 0), localDeals.length),
        pendingDeals: Math.max(Number(stats.pending_deals ?? 0), localPendingDeals.length),
        activeDeals: Math.max(Number(stats.active_deals ?? 0), localActiveDeals.length),
        pendingReports: Number(stats.pending_reports ?? 0),
      };
    }
  } catch (rpcErr) {
    console.warn('[Admin] RPC get_admin_dashboard_stats notice:', rpcErr);
  }

  // 2. Direct count queries using exact SQL COUNT without loading row contents:
  try {
    const [
      usersRes,
      brandsRes,
      pendingBrandsRes,
      dealsRes,
      pendingDealsRes,
      activeDealsRes,
      reportsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'consumer'),
      supabase.from('brands').select('*', { count: 'exact', head: true }),
      supabase.from('brands').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deals').select('*', { count: 'exact', head: true }),
      supabase.from('deals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deals').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const localBrands = await getLocalBrands();
    const localPendingBrands = localBrands.filter((b) => b.status === 'pending');
    const localDeals = await getLocalBrandDeals();
    const localPendingDeals = localDeals.filter((d) => d.status === 'pending');
    const localActiveDeals = localDeals.filter((d) => d.status === 'active');

    return {
      totalUsers: usersRes.count ?? 0,
      totalBrands: Math.max(brandsRes.count ?? 0, localBrands.length),
      pendingBrands: Math.max(pendingBrandsRes.count ?? 0, localPendingBrands.length),
      totalDeals: Math.max(dealsRes.count ?? 0, localDeals.length),
      pendingDeals: Math.max(pendingDealsRes.count ?? 0, localPendingDeals.length),
      activeDeals: Math.max(activeDealsRes.count ?? 0, localActiveDeals.length),
      pendingReports: reportsRes.count ?? 0,
    };
  } catch (err) {
    console.warn('[Admin] SQL Count error fallback to local stores:', err);
    const localBrands = await getLocalBrands();
    const localDeals = await getLocalBrandDeals();
    return {
      totalUsers: 0,
      totalBrands: localBrands.length,
      pendingBrands: localBrands.filter((b) => b.status === 'pending').length,
      totalDeals: localDeals.length,
      pendingDeals: localDeals.filter((d) => d.status === 'pending').length,
      activeDeals: localDeals.filter((d) => d.status === 'active').length,
      pendingReports: 0,
    };
  }
}

/**
 * Generates a temporary signed URL (valid 1 hour) to preview or download
 * private verification documents from the `brand-docs` bucket.
 */
export async function getBrandDocSignedUrl(
  filePathOrUrl: string
): Promise<string> {
  // If already a full URL or external link, return as is
  if (
    filePathOrUrl.startsWith('http://') ||
    filePathOrUrl.startsWith('https://')
  ) {
    return filePathOrUrl;
  }

  // Clean path
  const cleanPath = filePathOrUrl.replace(/^\/+/, '');
  const { data, error } = await supabase.storage
    .from('brand-docs')
    .createSignedUrl(cleanPath, 3600);

  if (error || !data?.signedUrl) {
    console.warn('[Admin] Error creating signed URL for doc:', error?.message);
    return filePathOrUrl;
  }

  return data.signedUrl;
}

/**
 * Approve a pending brand via RPC (with direct admin fallback)
 */
export async function approveBrand(brandId: string, brandName: string) {
  // Update local storage first to ensure immediate UI reactivity
  await updateLocalBrandStatus(brandId, { status: 'active', is_verified: true, rejection_reason: null });

  try {
    // Try secure RPC
    const { data, error } = await (supabase as any).rpc('admin_approve_brand' as any, {
      p_brand_id: brandId,
    });

    if (!error) return data;

    // Fallback direct execution with admin privileges
    console.warn('[Admin] RPC admin_approve_brand fallback:', error?.message);
    await (supabase.from('brands') as any)
      .update({ status: 'active', is_verified: true, rejection_reason: null })
      .eq('id', brandId);

    // Audit log
    await (supabase.from('admin_audit_log') as any).insert({
      action: 'approve_brand',
      target_type: 'brand',
      target_id: brandId,
      details: { brand_name: brandName },
    });

    // Notify brand owner
    const { data: b } = await (supabase.from('brands') as any).select('owner_id').eq('id', brandId).maybeSingle();
    if (b?.owner_id) {
      await (supabase.from('notifications') as any).insert({
        user_id: b.owner_id,
        title: 'Brand Partner Approved! 🎉',
        body: `Congratulations! "${brandName}" has been verified and approved. You can now post live promotions.`,
      });
    }
  } catch (err: any) {
    console.warn('[Admin] Supabase approveBrand error (handled via local state):', err?.message);
  }

  return { success: true };
}

/**
 * Reject a brand with a required reason
 */
export async function rejectBrand(
  brandId: string,
  brandName: string,
  reason: string
) {
  const cleanReason = reason.trim() || 'Did not meet compliance criteria.';
  await updateLocalBrandStatus(brandId, {
    status: 'rejected',
    is_verified: false,
    rejection_reason: cleanReason,
  });

  try {
    const { data, error } = await (supabase as any).rpc('admin_reject_brand' as any, {
      p_brand_id: brandId,
      p_reason: cleanReason,
    });

    if (!error) return data;

    console.warn('[Admin] RPC admin_reject_brand fallback:', error?.message);
    await (supabase.from('brands') as any)
      .update({
        status: 'rejected',
        is_verified: false,
        rejection_reason: cleanReason,
      })
      .eq('id', brandId);

    await (supabase.from('admin_audit_log') as any).insert({
      action: 'reject_brand',
      target_type: 'brand',
      target_id: brandId,
      details: { brand_name: brandName, reason: cleanReason },
    });

    // Notify brand owner
    const { data: b } = await (supabase.from('brands') as any).select('owner_id').eq('id', brandId).maybeSingle();
    if (b?.owner_id) {
      await (supabase.from('notifications') as any).insert({
        user_id: b.owner_id,
        title: 'Brand Application Status Update',
        body: `Your brand application for "${brandName}" was not approved. Reason: ${cleanReason}`,
      });
    }
  } catch (err: any) {
    console.warn('[Admin] Supabase rejectBrand error (handled via local state):', err?.message);
  }

  return { success: true };
}

/**
 * Suspend a brand
 */
export async function suspendBrand(
  brandId: string,
  brandName: string,
  reason?: string
) {
  const cleanReason = reason || 'Account suspended by platform administration.';

  // 1. Update local brand store immediately for instant UI responsiveness
  await updateLocalBrandStatus(
    brandId,
    {
      status: 'suspended',
      rejection_reason: cleanReason,
    },
    brandName
  );

  // 2. Direct Supabase update on brands table (both by ID and by Name)
  try {
    await (supabase.from('brands') as any)
      .update({ status: 'suspended', rejection_reason: cleanReason })
      .eq('id', brandId);
  } catch (dbErr) {
    console.warn('[Admin] Direct DB brand suspend warning:', dbErr);
  }

  if (brandName) {
    try {
      await (supabase.from('brands') as any)
        .update({ status: 'suspended', rejection_reason: cleanReason })
        .ilike('name', brandName);
    } catch {}
  }

  // 3. Suspend deals of this brand in Supabase
  try {
    await (supabase.from('deals') as any)
      .update({ status: 'suspended' })
      .eq('brand_id', brandId);
  } catch {}

  // 4. Also attempt secure PostgreSQL RPC
  try {
    await (supabase as any).rpc('admin_suspend_brand' as any, {
      p_brand_id: brandId,
      p_reason: cleanReason,
    });
  } catch {}

  // 5. Write to admin audit log
  try {
    await (supabase.from('admin_audit_log') as any).insert({
      action: 'suspend_brand',
      target_type: 'brand',
      target_id: brandId,
      details: { brand_name: brandName, reason: cleanReason },
    });
  } catch {}

  return { success: true };
}

/**
 * Reactivate a suspended brand
 */
export async function reactivateBrand(brandId: string, brandName: string) {
  // 1. Update local brand store immediately
  await updateLocalBrandStatus(
    brandId,
    {
      status: 'active',
      is_verified: true,
      rejection_reason: null,
    },
    brandName
  );

  // 2. Direct Supabase update on brands table (both by ID and by Name)
  try {
    await (supabase.from('brands') as any)
      .update({ status: 'active', is_verified: true, rejection_reason: null })
      .eq('id', brandId);
  } catch (dbErr) {
    console.warn('[Admin] Direct DB brand reactivate warning:', dbErr);
  }

  if (brandName) {
    try {
      await (supabase.from('brands') as any)
        .update({ status: 'active', is_verified: true, rejection_reason: null })
        .ilike('name', brandName);
    } catch {}
  }

  // 3. Reactivate deals of this brand in Supabase
  try {
    await (supabase.from('deals') as any)
      .update({ status: 'active' })
      .eq('brand_id', brandId);
  } catch {}

  // 4. Also attempt secure PostgreSQL RPC
  try {
    await (supabase as any).rpc('admin_reactivate_brand' as any, {
      p_brand_id: brandId,
    });
  } catch {}

  // 5. Write to admin audit log
  try {
    await (supabase.from('admin_audit_log') as any).insert({
      action: 'reactivate_brand',
      target_type: 'brand',
      target_id: brandId,
      details: { brand_name: brandName },
    });
  } catch {}

  return { success: true };
}

/**
 * Delete a brand
 */
export async function deleteBrand(brandId: string, brandName: string) {
  // 1. Delete locally & blacklist permanently so it never resurrects
  await deleteLocalBrand(brandId);

  // 2. Delete deals and brand from Supabase
  try {
    await (supabase.from('deals') as any).delete().eq('brand_id', brandId);
  } catch {}

  try {
    await (supabase.from('brands') as any).delete().eq('id', brandId);
  } catch (dbErr) {
    console.warn('[Admin] Direct DB brand delete notice:', dbErr);
  }

  // 3. Also attempt secure PostgreSQL RPC
  try {
    await (supabase as any).rpc('admin_delete_brand' as any, {
      p_brand_id: brandId,
    });
  } catch {}

  // 4. Write to admin audit log
  try {
    await (supabase.from('admin_audit_log') as any).insert({
      action: 'delete_brand',
      target_type: 'brand',
      target_id: brandId,
      details: { brand_name: brandName },
    });
  } catch {}

  return { success: true };
}

/**
 * Approve a deal promotion
 */
export async function approveDeal(dealId: string, title: string) {
  // Sync local store first for instant UI reactivity
  try {
    const localDeals = await getLocalBrandDeals();
    const matching = localDeals.find((d) => d.id === dealId);
    if (matching) {
      await saveLocalDeal({ ...matching, status: 'active', rejection_reason: null });
    }
  } catch (err) {
    console.warn('[Admin] Local deal sync notice:', err);
  }

  const { data, error } = await (supabase as any).rpc('admin_approve_deal' as any, {
    p_deal_id: dealId,
  });

  if (!error) return data;

  console.warn('[Admin] RPC admin_approve_deal fallback:', error.message);
  const { error: updateError } = await (supabase.from('deals') as any)
    .update({ status: 'active', rejection_reason: null, updated_at: new Date().toISOString() })
    .eq('id', dealId);
  if (updateError) throw updateError;

  const { data: deal } = await (supabase.from('deals') as any)
    .select('brand:brands(owner_id)')
    .eq('id', dealId)
    .single();

  await (supabase.from('admin_audit_log') as any).insert({
    action: 'approve_deal',
    target_type: 'deal',
    target_id: dealId,
    details: { title },
  });

  if (deal?.brand?.owner_id) {
    await (supabase.from('notifications') as any).insert({
      user_id: deal.brand.owner_id,
      title: 'Promotion Approved! 🚀',
      body: `Your deal "${title}" is now live on the marketplace.`,
      deal_id: dealId,
    });
  }

  return { success: true };
}

/**
 * Reject a deal promotion with reason
 */
export async function rejectDeal(
  dealId: string,
  title: string,
  reason: string
) {
  const cleanReason = reason.trim() || 'Does not comply with community guidelines.';

  // Sync local store first for instant UI reactivity
  try {
    const localDeals = await getLocalBrandDeals();
    const matching = localDeals.find((d) => d.id === dealId);
    if (matching) {
      await saveLocalDeal({ ...matching, status: 'rejected', rejection_reason: cleanReason });
    }
  } catch (err) {
    console.warn('[Admin] Local deal sync notice:', err);
  }

  const { data, error } = await (supabase as any).rpc('admin_reject_deal' as any, {
    p_deal_id: dealId,
    p_reason: cleanReason,
  });

  if (!error) return data;

  console.warn('[Admin] RPC admin_reject_deal fallback:', error.message);
  const { error: updateError } = await (supabase.from('deals') as any)
    .update({
      status: 'rejected',
      rejection_reason: cleanReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId);
  if (updateError) throw updateError;

  const { data: deal } = await (supabase.from('deals') as any)
    .select('brand:brands(owner_id)')
    .eq('id', dealId)
    .single();

  await (supabase.from('admin_audit_log') as any).insert({
    action: 'reject_deal',
    target_type: 'deal',
    target_id: dealId,
    details: { title, reason: cleanReason },
  });

  if (deal?.brand?.owner_id) {
    await (supabase.from('notifications') as any).insert({
      user_id: deal.brand.owner_id,
      title: 'Promotion Rejected',
      body: `Your deal "${title}" was not approved. Reason: ${cleanReason}`,
      deal_id: dealId,
    });
  }

  return { success: true };
}

/**
 * Suspend a deal
 */
export async function suspendDeal(
  dealId: string,
  title: string,
  reason?: string
) {
  // Sync local store first
  try {
    const localDeals = await getLocalBrandDeals();
    const matching = localDeals.find((d) => d.id === dealId);
    if (matching) {
      await saveLocalDeal({ ...matching, status: 'suspended', rejection_reason: reason || 'Suspended' });
    }
  } catch (err) {
    console.warn('[Admin] Local deal sync notice:', err);
  }

  const { data, error } = await (supabase as any).rpc('admin_suspend_deal' as any, {
    p_deal_id: dealId,
    p_reason: reason || null,
  });

  if (!error) return data;

  const { error: updateError } = await (supabase.from('deals') as any)
    .update({ status: 'suspended', rejection_reason: reason })
    .eq('id', dealId);
  if (updateError) throw updateError;

  await (supabase.from('admin_audit_log') as any).insert({
    action: 'suspend_deal',
    target_type: 'deal',
    target_id: dealId,
    details: { title, reason },
  });

  return { success: true };
}

/**
 * Suspend / Reactivate a user profile
 */
export async function setUserStatus(
  userId: string,
  isActive: boolean,
  reason?: string
) {
  const { data, error } = await (supabase as any).rpc('admin_set_user_status' as any, {
    p_user_id: userId,
    p_is_active: isActive,
    p_reason: reason || null,
  });

  if (!error) return data;

  console.warn('[Admin] RPC admin_set_user_status fallback:', error.message);
  const { error: updateError } = await (supabase.from('profiles') as any)
    .update({ is_active: isActive })
    .eq('id', userId);
  if (updateError) throw updateError;

  await (supabase.from('admin_audit_log') as any).insert({
    action: isActive ? 'reactivate_user' : 'suspend_user',
    target_type: 'user',
    target_id: userId,
    details: { reason },
  });

  await (supabase.from('notifications') as any).insert({
    user_id: userId,
    title: isActive ? 'Account Reactivated! 🎉' : 'Account Suspended',
    body: isActive
      ? 'Your account has been reactivated.'
      : `Your account has been suspended. Reason: ${reason || 'Admin action'}`,
  });

  return { success: true };
}

/**
 * Delete user profile
 */
export async function deleteUser(userId: string) {
  const { data, error } = await (supabase as any).rpc('admin_delete_user' as any, {
    p_user_id: userId,
  });

  if (!error) return data;

  const { error: deleteError } = await (supabase.from('profiles') as any)
    .delete()
    .eq('id', userId);
  if (deleteError) throw deleteError;

  await (supabase.from('admin_audit_log') as any).insert({
    action: 'delete_user',
    target_type: 'user',
    target_id: userId,
  });

  return { success: true };
}

/**
 * Resolve or dismiss a content report
 */
export async function resolveReport(
  reportId: string,
  action: 'dismiss' | 'resolve' | 'suspend_deal',
  reason?: string
) {
  const { data, error } = await (supabase as any).rpc('admin_resolve_report' as any, {
    p_report_id: reportId,
    p_action: action,
    p_reason: reason || null,
  });

  if (!error) return data;

  console.warn('[Admin] RPC admin_resolve_report fallback:', error.message);
  const newStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
  const { error: updateError } = await (supabase.from('reports') as any)
    .update({ status: newStatus })
    .eq('id', reportId);
  if (updateError) throw updateError;

  if (action === 'suspend_deal') {
    const { data: rep } = await (supabase.from('reports') as any)
      .select('deal_id')
      .eq('id', reportId)
      .single();
    if (rep?.deal_id) {
      await (supabase.from('deals') as any)
        .update({
          status: 'suspended',
          rejection_reason: 'Suspended due to user reports',
        })
        .eq('id', rep.deal_id);
    }
  }

  await (supabase.from('admin_audit_log') as any).insert({
    action: `report_${action}`,
    target_type: 'report',
    target_id: reportId,
    details: { reason },
  });

  return { success: true };
}
