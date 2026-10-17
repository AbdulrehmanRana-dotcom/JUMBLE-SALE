// Supabase Edge Function: send-notification
// Dispatches Expo Push Notifications and syncs in-app notifications
// Respects per-user notifications on/off preference (notifications_enabled).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

interface NotificationRequest {
  type?: 'new_deal' | 'decision' | 'expiring_deal' | 'general';
  user_id?: string;
  user_ids?: string[];
  title: string;
  body: string;
  deal_id?: string | null;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const apikeyHeader = req.headers.get('apikey') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // 1. Authorization check: Either service role key OR authenticated admin
    let isAuthorized = false;
    if (supabaseServiceKey && (token === supabaseServiceKey || apikeyHeader === supabaseServiceKey)) {
      isAuthorized = true;
    } else if (authHeader) {
      // Check if user is an admin
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: profile } = await authClient
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'admin') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Dispatching notifications requires admin privileges or service role access.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

    const payload: NotificationRequest = await req.json();
    const { title, body, deal_id, data = {} } = payload;

    if (!title || typeof title !== 'string' || title.trim().length === 0 || !body || typeof body !== 'string' || body.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: Title and body are required non-empty strings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (title.length > 120 || body.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: Title max 120 chars, Body max 500 chars.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine target recipient IDs
    const targetUserIds: string[] = [];
    if (payload.user_id && typeof payload.user_id === 'string') targetUserIds.push(payload.user_id);
    if (payload.user_ids && Array.isArray(payload.user_ids)) {
      targetUserIds.push(...payload.user_ids.filter((id) => typeof id === 'string'));
    }

    const uniqueUserIds = Array.from(new Set(targetUserIds)).filter(Boolean);

    if (uniqueUserIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one valid target user_id is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (uniqueUserIds.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: Maximum 500 recipients allowed per batch.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch user notification preferences and push tokens
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, push_token, is_active, notifications_enabled')
      .in('id', uniqueUserIds);

    if (profileErr) {
      throw new Error(`Failed to load recipient profiles: ${profileErr.message}`);
    }

    // 2. Filter active users with notifications_enabled != false
    const eligibleProfiles = (profiles || []).filter(
      (p: { id: string; push_token?: string | null; is_active?: boolean; notifications_enabled?: boolean }) =>
        p.is_active !== false && p.notifications_enabled !== false
    );

    if (eligibleProfiles.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No eligible recipients (users opted out or suspended).',
          sent_push: 0,
          delivered_in_app: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Insert in-app notifications
    const inAppRows = eligibleProfiles.map((p: { id: string }) => ({
      user_id: p.id,
      title,
      body,
      deal_id: deal_id || null,
      is_read: false,
    }));

    const { error: notifErr } = await supabase
      .from('notifications')
      .insert(inAppRows);

    if (notifErr) {
      console.warn('[EdgeFunction] Error inserting in-app notifications:', notifErr.message);
    }

    // 4. Prepare Expo Push Messages
    const pushMessages: ExpoPushMessage[] = [];
    for (const profile of eligibleProfiles) {
      if (
        profile.push_token &&
        typeof profile.push_token === 'string' &&
        profile.push_token.startsWith('ExponentPushToken')
      ) {
        pushMessages.push({
          to: profile.push_token,
          sound: 'default',
          title,
          body,
          data: {
            ...data,
            dealId: deal_id || null,
            notificationType: payload.type || 'general',
          },
        });
      }
    }

    // 5. Send Push via Expo Push Service
    let expoResponse = null;
    if (pushMessages.length > 0) {
      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });
        expoResponse = await expoRes.json();
      } catch (expoErr) {
        console.error('[EdgeFunction] Expo push network error:', expoErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered_in_app: inAppRows.length,
        sent_push: pushMessages.length,
        skipped_opt_out: uniqueUserIds.length - eligibleProfiles.length,
        expo_response: expoResponse,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal notification error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
