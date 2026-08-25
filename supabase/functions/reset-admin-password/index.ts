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
      console.error('reset-admin-password: caller lookup failed', callerError);
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

    const targetAdminId = String(payload.admin_id ?? '').trim();
    if (!targetAdminId) return json(req, { error: 'Administrateur cible manquant.' }, 400);

    const { data: targetAdmin, error: targetError } = await adminClient
      .from('admins')
      .select('id,auth_user_id,email,full_name,role')
      .eq('id', targetAdminId)
      .maybeSingle();

    if (targetError) {
      console.error('reset-admin-password: target lookup failed', targetError);
      return json(req, { error: 'Impossible de retrouver ce compte administrateur.' }, 500);
    }
    if (!targetAdmin) return json(req, { error: 'Administrateur introuvable.' }, 404);

    // Un super_admin ne peut pas réinitialiser le mot de passe d'un autre
    // super_admin par ce canal (protection contre la prise de contrôle
    // croisée entre comptes de plus haut niveau).
    if (targetAdmin.role === 'super_admin' && targetAdmin.auth_user_id !== userData.user.id) {
      return json(req, { error: 'Impossible de réinitialiser le mot de passe d’un autre super administrateur.' }, 403);
    }

    const temporaryPassword = generateTemporaryPassword();

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetAdmin.auth_user_id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (updateError) {
      console.error('reset-admin-password: updateUserById failed', updateError);
      return json(req, { error: updateError.message || 'Impossible de réinitialiser le mot de passe.' }, 400);
    }

    // Le mot de passe temporaire n'est renvoyé qu'ici, dans cette réponse unique.
    // Il n'est stocké nulle part (ni logs, ni base) au-delà de cet appel.
    return json(req, {
      admin: { id: targetAdmin.id, email: targetAdmin.email, full_name: targetAdmin.full_name },
      temporary_password: temporaryPassword,
    }, 200);
  } catch (error) {
    console.error('reset-admin-password: unexpected error', error);
    return json(req, { error: 'Erreur interne lors de la réinitialisation du mot de passe.' }, 500);
  }
});

/**
 * Génère un mot de passe temporaire aléatoire et robuste (16 caractères,
 * majuscules + minuscules + chiffres + symbole) à l'aide de l'API Web
 * Crypto disponible nativement dans l'environnement Deno Edge.
 */
function generateTemporaryPassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I/O pour éviter les confusions
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_+=';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string) => charset[randomIndex(charset.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const remainingLength = Math.max(length - required.length, 0);
  const rest = Array.from({ length: remainingLength }, () => pick(all));

  return shuffle([...required, ...rest]).join('');
}

function randomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
