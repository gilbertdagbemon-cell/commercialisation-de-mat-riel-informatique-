import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://gilbertdagbemon-cell.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://gilbertdagbemon-cell.github.io';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Méthode non autorisée.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return json(req, { error: 'Configuration serveur Supabase incomplète.' }, 500);
    }

    const authorization = req.headers.get('Authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return json(req, { error: 'En-tête Authorization manquant ou invalide.' }, 401);
    }
    const accessToken = match[1].trim();
    if (!accessToken) {
      return json(req, { error: 'Jeton d’authentification manquant.' }, 401);
    }

    // Le client service_role reste strictement côté Edge Function.
    // Le JWT de l'appelant est validé explicitement avec auth.getUser(jwt).
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return json(req, { error: 'Session administrateur invalide ou expirée.' }, 401);
    }

    const { data: callerAdmin, error: callerError } = await adminClient
      .from('admins')
      .select('id,role,is_active')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (callerError) {
      console.error('create-admin: caller lookup failed', callerError);
      return json(req, { error: 'Impossible de vérifier les droits administrateur.' }, 500);
    }

    if (!callerAdmin || callerAdmin.role !== 'super_admin' || !callerAdmin.is_active) {
      return json(req, { error: 'Action réservée au super administrateur.' }, 403);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json(req, { error: 'Données JSON invalides.' }, 400);
    }

    const email = String(payload.email ?? '').trim().toLowerCase();
    const fullName = String(payload.full_name ?? '').trim();
    const role = payload.role === 'vendeur' ? 'vendeur' : payload.role === 'admin' ? 'admin' : '';

    if (!fullName) return json(req, { error: 'Le nom complet est obligatoire.' }, 400);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json(req, { error: 'Adresse email invalide.' }, 400);
    if (!role) return json(req, { error: 'Rôle invalide. Utilisez admin ou vendeur.' }, 400);

    const redirectTo = 'https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-/admin/set-password.html';

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName },
    });

    if (createAuthError || !createdAuth.user) {
      console.error('create-admin: invite failed', createAuthError);
      return json(req, { error: createAuthError?.message || 'Impossible d’envoyer l’invitation.' }, 400);
    }

    const authUserId = createdAuth.user.id;
    const row = {
      auth_user_id: authUserId,
      full_name: fullName,
      email,
      phone: String(payload.phone ?? '').trim() || null,
      whatsapp: String(payload.whatsapp ?? '').trim() || null,
      facebook_url: String(payload.facebook_url ?? '').trim() || null,
      instagram_url: String(payload.instagram_url ?? '').trim() || null,
      tiktok_url: String(payload.tiktok_url ?? '').trim() || null,
      telegram_url: String(payload.telegram_url ?? '').trim() || null,
      youtube_url: String(payload.youtube_url ?? '').trim() || null,
      linkedin_url: String(payload.linkedin_url ?? '').trim() || null,
      role_title: String(payload.role_title ?? '').trim() || 'Conseiller Ventes',
      display_order: Number.isFinite(Number(payload.display_order)) ? Number(payload.display_order) : 0,
      role,
      is_active: payload.is_active !== false,
      show_public_contact: payload.show_public_contact !== false,
      avatar_url: String(payload.avatar_url ?? '').trim() || null,
    };

    const { data: adminRow, error: insertError } = await adminClient
      .from('admins')
      .insert(row)
      .select('id,auth_user_id,email,full_name,phone,whatsapp,facebook_url,instagram_url,tiktok_url,telegram_url,youtube_url,linkedin_url,role,role_title,avatar_url,is_active,show_public_contact,display_order')
      .single();

    if (insertError || !adminRow) {
      console.error('create-admin: admins insert failed', insertError);
      // Rollback : ne pas laisser un utilisateur Auth orphelin si la fiche admins échoue.
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(authUserId);
      if (rollbackError) console.error('create-admin: rollback failed', rollbackError);
      return json(req, { error: insertError?.message || 'Impossible de créer la fiche administrateur.' }, 400);
    }

    return json(req, { admin: adminRow }, 201);
  } catch (error) {
    console.error('create-admin: unexpected error', error);
    return json(req, { error: 'Erreur interne lors de la création du compte administrateur.' }, 500);
  }
});
