import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function formatPriceFCFA(price) {
  if (price === null || price === undefined || price === '') return 'Prix sur demande';
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) return 'Prix sur demande';
  return `${new Intl.NumberFormat('fr-FR').format(numericPrice)} FCFA`;
}

export async function getPublicVendors() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_admin_contacts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    // Les coordonnées publiques des vendeurs sont optionnelles :
    // une indisponibilité de la RPC ne doit pas bloquer le site.
    return [];
  }
}
export async function submitProductReview({ productId, authorName, rating, comment }) {
  const payload = {
    product_id: productId,
    author_name: String(authorName || '').trim(),
    rating: Math.max(1, Math.min(5, Number(rating) || 0)),
    comment: String(comment || '').trim(),
    is_published: false,
  };

  if (!payload.product_id || !payload.author_name || !payload.rating || !payload.comment) {
    throw new Error('Veuillez renseigner le nom, une note et un commentaire.');
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .insert(payload)
    .select('id,product_id,author_name,rating,comment,is_published,created_at')
    .single();

  if (error) throw error;
  return data;
}
