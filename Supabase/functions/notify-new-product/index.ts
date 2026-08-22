import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500);

  const adminClient = createClient(supabaseUrl, serviceKey);

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('unsubscribe');
    if (!token) return new Response('Lien de désabonnement invalide.', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
    const { data, error } = await adminClient.from('subscribers').update({ is_active: false }).eq('unsubscribe_token', token).select('id').maybeSingle();
    if (error) return new Response('Impossible de traiter le désabonnement.', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response(data ? 'Vous êtes bien désabonné(e) des notifications OrdiMarket.' : 'Lien de désabonnement invalide ou déjà utilisé.', { status: data ? 200 : 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-').replace(/\/$/, '');
  const from = Deno.env.get('MAIL_FROM') || 'OrdiMarket <onboarding@resend.dev>';
  if (!resendKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: admin, error: adminError } = await adminClient
    .from('admins').select('id,role,is_active').eq('auth_user_id', user.id).maybeSingle();
  if (adminError || !admin || !admin.is_active || !['admin', 'super_admin', 'vendeur'].includes(admin.role)) {
    return json({ error: 'Administrator access required' }, 403);
  }

  let body: { product_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.product_id) return json({ error: 'product_id is required' }, 400);

  const { data: existing } = await adminClient.from('notification_logs')
    .select('id,status,sent_to_count').eq('product_id', body.product_id)
    .in('status', ['sent', 'partial']).limit(1).maybeSingle();
  if (existing) return json({ ok: true, already_sent: true, sent_to_count: existing.sent_to_count || 0 });

  const { data: product, error: productError } = await adminClient
    .from('products')
    .select('id,title,specs,description,price,is_published,is_featured,media(url,type,is_cover,position)')
    .eq('id', body.product_id).single();
  if (productError || !product) return json({ error: 'Product not found' }, 404);
  if (!product.is_published) return json({ ok: true, skipped: true, reason: 'Product is not published' });

  const { data: subscribers, error: subscriberError } = await adminClient
    .from('subscribers').select('email,unsubscribe_token').eq('is_active', true);
  if (subscriberError) return json({ error: subscriberError.message }, 500);

  if (!subscribers?.length) {
    await adminClient.from('notification_logs').insert({ product_id: product.id, sent_to_count: 0, status: 'sent' });
    return json({ ok: true, sent_to_count: 0 });
  }

  const cover = (product.media || []).filter((m: any) => m.type === 'image').sort((a: any, b: any) => Number(b.is_cover) - Number(a.is_cover) || Number(a.position) - Number(b.position))[0];
  const coverUrl = cover?.url || '';
  const productUrl = `${siteUrl}/catalogue.html?search=${encodeURIComponent(product.title)}`;
  const price = Number(product.price || 0).toLocaleString('fr-FR');
  const specs = specsToText(product.specs, product.description);
  const subject = `🆕 Nouveau produit disponible chez OrdiMarket : ${product.title}`;
  let sent = 0;

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
      if (response.ok) sent++;
    } catch (error) {
      console.error('Resend:', error);
    }
  }

  const status = sent === subscribers.length ? 'sent' : sent > 0 ? 'partial' : 'failed';
  await adminClient.from('notification_logs').insert({ product_id: product.id, sent_to_count: sent, status });
  return json({ ok: status !== 'failed', status, sent_to_count: sent, total: subscribers.length });
});
