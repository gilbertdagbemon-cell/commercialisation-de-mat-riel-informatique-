import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// CORS — headers appliqués à TOUTES les réponses, y compris les erreurs.
// ---------------------------------------------------------------------------
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
});

const text = (body: string, status = 200) => new Response(body, {
  status,
  headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' },
});

const esc = (value: unknown = '') => String(value).replace(/[&<>'"]/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
}[c] as string));

const specsToText = (specs: unknown, description: unknown) => {
  if (typeof specs === 'string') return specs;
  if (specs && typeof specs === 'object') {
    const value = specs as Record<string, unknown>;
    if (typeof value.text === 'string') return value.text;
    return Object.entries(value)
      .map(([key, val]) => `${key} : ${Array.isArray(val) ? val.join(', ') : String(val ?? '')}`)
      .filter(Boolean)
      .join('\n');
  }
  return String(description ?? '');
};

Deno.serve(async (req) => {
  // ---- Preflight CORS ----
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Filet de sécurité global : le produit est DÉJÀ enregistré en base au
  // moment où cette fonction est appelée. Un souci de notification ne doit
  // donc jamais remonter comme une erreur bloquante côté frontend.
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.error('notify-new-product: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY manquant(s)');
      return json({ success: true, notificationSent: false, warning: 'Configuration serveur incomplète (identifiants Supabase manquants).' });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // ------------------------------------------------------------------
    // GET => lien de désabonnement (page texte publique, hors contrat JSON)
    // ------------------------------------------------------------------
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('unsubscribe');
      if (!token) return text('Lien de désabonnement invalide.', 400);

      const { data, error } = await adminClient
        .from('subscribers')
        .update({ is_active: false })
        .eq('unsubscribe_token', token)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('notify-new-product: erreur désabonnement', error);
        return text('Impossible de traiter le désabonnement.', 500);
      }
      return text(
        data ? 'Vous êtes bien désabonné(e) des notifications OrdiMarket.' : 'Lien de désabonnement invalide ou déjà utilisé.',
        data ? 200 : 404,
      );
    }

    if (req.method !== 'POST') {
      return json({ success: true, notificationSent: false, warning: 'Méthode non autorisée.' });
    }

    // ------------------------------------------------------------------
    // 1) Vérification du secret Resend AVANT tout traitement
    // ------------------------------------------------------------------
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const siteUrl = (Deno.env.get('SITE_URL') || 'https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-').replace(/\/$/, '');
    const from = Deno.env.get('MAIL_FROM') || 'OrdiMarket <onboarding@resend.dev>';

    if (!resendKey) {
      console.error('notify-new-product: RESEND_API_KEY non configurée');
      return json({ success: true, notificationSent: false, warning: 'RESEND_API_KEY manquante côté serveur : email non envoyé.' });
    }

    // ------------------------------------------------------------------
    // 2) Authentification de l'appelant (admin connecté)
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: true, notificationSent: false, warning: 'Requête non authentifiée : email non envoyé.' });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      console.error('notify-new-product: erreur auth', authError);
      return json({ success: true, notificationSent: false, warning: 'Session invalide ou expirée : email non envoyé.' });
    }

    const { data: admin, error: adminError } = await adminClient
      .from('admins')
      .select('id,role,is_active')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (adminError || !admin || !admin.is_active || !['admin', 'super_admin', 'vendeur'].includes(admin.role)) {
      console.error('notify-new-product: accès refusé', adminError);
      return json({ success: true, notificationSent: false, warning: 'Accès administrateur requis : email non envoyé.' });
    }

    // ------------------------------------------------------------------
    // 3) Corps de la requête
    // ------------------------------------------------------------------
    let body: { product_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ success: true, notificationSent: false, warning: 'Corps de requête JSON invalide.' });
    }
    if (!body.product_id) {
      return json({ success: true, notificationSent: false, warning: 'product_id manquant : email non envoyé.' });
    }

    // ------------------------------------------------------------------
    // 4) Déduplication (déjà notifié pour ce produit)
    // ------------------------------------------------------------------
    const { data: existing } = await adminClient
      .from('notification_logs')
      .select('id,status,sent_to_count')
      .eq('product_id', body.product_id)
      .in('status', ['sent', 'partial'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return json({ success: true, notificationSent: true, alreadySent: true, sent_to_count: existing.sent_to_count || 0 });
    }

    // ------------------------------------------------------------------
    // 5) Récupération du produit
    // ------------------------------------------------------------------
    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('id,title,specs,description,price,is_published,is_featured,media(url,type,is_cover,position)')
      .eq('id', body.product_id)
      .single();

    if (productError || !product) {
      console.error('notify-new-product: produit introuvable', productError);
      return json({ success: true, notificationSent: false, warning: 'Produit introuvable : email non envoyé.' });
    }

    if (!product.is_published) {
      return json({ success: true, notificationSent: false, warning: 'Produit non publié : notification ignorée.' });
    }

    // ------------------------------------------------------------------
    // 6) Récupération des abonnés actifs
    // ------------------------------------------------------------------
    const { data: subscribers, error: subscriberError } = await adminClient
      .from('subscribers')
      .select('email,unsubscribe_token')
      .eq('is_active', true);

    if (subscriberError) {
      console.error('notify-new-product: erreur récupération abonnés', subscriberError);
      return json({ success: true, notificationSent: false, warning: 'Impossible de récupérer la liste des abonnés.' });
    }

    if (!subscribers?.length) {
      await adminClient.from('notification_logs')
        .insert({ product_id: product.id, sent_to_count: 0, status: 'sent' })
        .then(({ error }) => { if (error) console.error('notify-new-product: log insert error', error); });
      return json({ success: true, notificationSent: false, warning: 'Aucun abonné actif : email non envoyé.' });
    }

    // ------------------------------------------------------------------
    // 7) Construction et envoi des emails via Resend
    // ------------------------------------------------------------------
    const cover = (product.media || [])
      .filter((m: any) => m.type === 'image')
      .sort((a: any, b: any) => Number(b.is_cover) - Number(a.is_cover) || Number(a.position) - Number(b.position))[0];
    const coverUrl = cover?.url || '';
    const productUrl = `${siteUrl}/catalogue.html?search=${encodeURIComponent(product.title)}`;
    const price = Number(product.price || 0).toLocaleString('fr-FR');
    const specs = specsToText(product.specs, product.description);
    const subject = `🆕 Nouveau produit disponible chez OrdiMarket : ${product.title}`;

    let sent = 0;
    let lastResendError: string | null = null;

    for (const subscriber of subscribers) {
      const unsubscribeUrl = `${supabaseUrl}/functions/v1/notify-new-product?unsubscribe=${encodeURIComponent(subscriber.unsubscribe_token)}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#16202a">
        <div style="padding:20px 0;border-bottom:3px solid #219AE9"><h2 style="margin:0;color:#219AE9">OrdiMarket</h2></div>
        <h1 style="font-size:24px">🆕 Nouveau produit disponible</h1>
        ${coverUrl ? `<img src="${esc(coverUrl)}" alt="${esc(product.title)}" style="width:100%;max-height:360px;object-fit:cover;border-radius:12px">` : ''}
        <h2>${esc(product.title)}</h2>
        <p><strong style="font-size:20px;color:#FD6E05">${esc(price)} FCFA</strong></p>
        ${specs ? `<div style="white-space:pre-wrap;line-height:1.6">${esc(specs)}</div>` : ''}
        <p style="margin-top:24px"><a href="${esc(productUrl)}" style="display:inline-block;padding:12px 18px;background:#FD6E05;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Voir le produit</a></p>
        <hr><p style="font-size:12px;color:#68707a">Vous recevez cet e-mail car vous êtes inscrit(e) aux notifications OrdiMarket.<br><a href="${esc(unsubscribeUrl)}">Se désabonner</a></p>
      </div>`;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [subscriber.email], subject, html }),
        });

        if (response.ok) {
          sent++;
        } else {
          const errText = await response.text().catch(() => response.statusText);
          lastResendError = `Resend ${response.status}: ${errText}`;
          console.error('notify-new-product: erreur API Resend', lastResendError);
        }
      } catch (err) {
        lastResendError = err instanceof Error ? err.message : String(err);
        console.error('notify-new-product: échec fetch Resend', lastResendError);
      }
    }

    const status = sent === subscribers.length ? 'sent' : sent > 0 ? 'partial' : 'failed';

    await adminClient
      .from('notification_logs')
      .insert({ product_id: product.id, sent_to_count: sent, status })
      .then(({ error }) => { if (error) console.error('notify-new-product: log insert error', error); });

    if (sent === 0) {
      return json({
        success: true,
        notificationSent: false,
        warning: lastResendError
          ? `Échec de l'envoi via Resend : ${lastResendError}`
          : "Échec de l'envoi des emails (raison inconnue).",
      });
    }

    return json({
      success: true,
      notificationSent: true,
      partial: status === 'partial',
      sent_to_count: sent,
      total: subscribers.length,
      warning: status === 'partial' ? `Envoyé à ${sent}/${subscribers.length} abonnés seulement.` : undefined,
    });
  } catch (error) {
    // Ultime filet de sécurité : jamais de 500 pour un souci de notification.
    console.error('notify-new-product: erreur inattendue', error);
    return json({
      success: true,
      notificationSent: false,
      warning: error instanceof Error ? error.message : 'Erreur inattendue lors de l\'envoi de la notification.',
    });
  }
});