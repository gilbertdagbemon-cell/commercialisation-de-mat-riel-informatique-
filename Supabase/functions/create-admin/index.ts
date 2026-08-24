import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://gilbertdagbemon-cell.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization');
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !authorization) {
    return json({ error: 'Configuration serveur ou authentification manquante.' }, 500);
  }

  // Client lié à la session de l'appelant : vérification serveur du super_admin.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Session administrateur invalide.' }, 401);

  const { data: callerAdmin, error: callerError } = await callerClient
    .from('admins').select('id,role,is_active').eq('auth_user_id', userData.user.id).maybeSingle();
  if (callerError || !callerAdmin || callerAdmin.role !== 'super_admin' || !callerAdmin.is_active) {
    return json({ error: 'Action réservée au super administrateur.' }, 403);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'Données JSON invalides.' }, 400); }

  const email = String(payload.email ?? '').trim().toLowerCase();
  const fullName = String(payload.full_name ?? '').trim();
  const role = payload.role === 'vendeur' ? 'vendeur' : payload.role === 'admin' ? 'admin' : '';
  if (!fullName) return json({ error: 'Le nom complet est obligatoire.' }, 400);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Adresse email invalide.' }, 400);
  if (!role) return json({ error: 'Rôle invalide. Utilisez admin ou vendeur.' }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectTo = 'https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-/admin/set-password.html';
  const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (createAuthError || !createdAuth.user) {
    return json({ error: createAuthError?.message || 'Impossible d’envoyer l’invitation.' }, 400);
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
    role, is_active: payload.is_active !== false,
    show_public_contact: payload.show_public_contact !== false,
    avatar_url: String(payload.avatar_url ?? '').trim() || null,
  };

  const { data: adminRow, error: insertError } = await adminClient.from('admins').insert(row).select(
    'id,auth_user_id,email,full_name,phone,whatsapp,facebook_url,instagram_url,tiktok_url,telegram_url,youtube_url,linkedin_url,role,role_title,avatar_url,is_active,show_public_contact,display_order'
  ).single();

  if (insertError || !adminRow) {
    await adminClient.auth.admin.deleteUser(authUserId);
    return json({ error: insertError?.message || 'Impossible de créer la fiche administrateur.' }, 400);
  }

  return json({ admin: adminRow }, 201);
});
