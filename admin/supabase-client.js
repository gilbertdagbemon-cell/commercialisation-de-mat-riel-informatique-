import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKETS } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const BUCKET_MEDIA = STORAGE_BUCKETS.productMedia;
const BUCKET_AVATARS = STORAGE_BUCKETS.adminAvatars;

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `produit-${crypto.randomUUID()}`;
}

function uniqueSlug(value) { return `${slugify(value)}-${crypto.randomUUID().slice(0, 8)}`; }

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function getCurrentAdmin() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) return null;
  const { data, error } = await supabase
    .from('admins')
    .select('id,auth_user_id,email,full_name,phone,whatsapp,facebook_url,instagram_url,tiktok_url,telegram_url,youtube_url,linkedin_url,role,role_title,avatar_url,is_active,show_public_contact,display_order')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  return { ...session.user, ...data };
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    await supabase.auth.signOut();
    window.location.replace('login.html');
    return null;
  }
  return admin;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function listBrands() {
  return throwIfError(await supabase.from('brands').select('id,name,slug,is_active').order('name')) || [];
}

export async function createBrand(name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Nom de marque invalide.');
  return throwIfError(await supabase.from('brands').insert({ name: clean, slug: uniqueSlug(clean) }).select().single());
}

export async function listCategories() {
  return throwIfError(await supabase.from('categories').select('id,name,slug,is_active,display_order').order('display_order').order('name')) || [];
}

export async function createCategory(name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Nom de catégorie invalide.');
  return throwIfError(await supabase.from('categories').insert({ name: clean, slug: uniqueSlug(clean) }).select().single());
}

const PRODUCT_SELECT = '*, brands(id,name), categories(id,name), media(id,product_id,type,url,position,is_cover)';

export async function countActiveSubscribers() {
  const { count, error } = await supabase.from('subscribers').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (error) throw error;
  return count || 0;
}

export async function listFaqsAdmin() {
  return throwIfError(await supabase
    .from('faqs')
    .select('id,question,answer,display_order,is_active,created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })) || [];
}

export async function createFaq(payload) {
  const question = String(payload?.question ?? '').trim();
  const answer = String(payload?.answer ?? '').trim();
  if (!question || !answer) throw new Error('La question et la réponse sont obligatoires.');
  return throwIfError(await supabase.from('faqs').insert({
    question,
    answer,
    display_order: Number.isFinite(Number(payload?.display_order)) ? Number(payload.display_order) : 0,
    is_active: payload?.is_active !== false,
  }).select().single());
}

export async function updateFaq(id, payload) {
  const question = String(payload?.question ?? '').trim();
  const answer = String(payload?.answer ?? '').trim();
  if (!id || !question || !answer) throw new Error('La question et la réponse sont obligatoires.');
  return throwIfError(await supabase.from('faqs').update({
    question,
    answer,
    display_order: Number.isFinite(Number(payload?.display_order)) ? Number(payload.display_order) : 0,
    is_active: payload?.is_active !== false,
  }).eq('id', id).select().single());
}

export async function deleteFaq(id) {
  if (!id) throw new Error('FAQ invalide.');
  return throwIfError(await supabase.from('faqs').delete().eq('id', id).select('id').single());
}

export async function deactivateSubscriber(id, admin) {
  if (admin?.role !== 'super_admin') throw new Error('Action réservée au super administrateur.');
  if (!id) throw new Error('Abonné invalide.');
  return throwIfError(await supabase.from('subscribers').update({ is_active: false }).eq('id', id).eq('is_active', true).select('id,email,is_active').single());
}

export async function listAdmins() {
  return throwIfError(await supabase.from('admins').select('id,auth_user_id,email,full_name,role,is_active').order('full_name')) || [];
}

export async function updateAdminAccount(id, payload) {
  const role = payload.role === 'vendeur' ? 'vendeur' : 'admin';
  return throwIfError(await supabase.from('admins').update({ role, is_active: Boolean(payload.is_active) }).eq('id', id).select('id,auth_user_id,email,full_name,role,is_active').single());
}

export async function listProducts() {
  return throwIfError(await supabase.from('products').select(PRODUCT_SELECT).order('created_at', { ascending: false })) || [];
}

export async function getProduct(id) {
  return throwIfError(await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).single());
}

export async function createProduct(payload) {
  const title = String(payload.title ?? '').trim();
  if (!title) throw new Error('Titre du produit obligatoire.');
  const row = {
    title,
    slug: uniqueSlug(title),
    brand_id: payload.brand_id || null,
    category_id: payload.category_id || null,
    price: payload.price ?? null,
    stock: payload.stock ?? 0,
    condition: payload.condition || 'occasion',
    description: payload.description || null,
    specs: payload.specs || {},
    is_published: Boolean(payload.is_published),
    is_featured: Boolean(payload.is_featured),
    created_by: payload.created_by || null,
  };
  return throwIfError(await supabase.from('products').insert(row).select(PRODUCT_SELECT).single());
}

export async function updateProduct(id, payload) {
  const row = {
    title: String(payload.title ?? '').trim(),
    brand_id: payload.brand_id || null,
    category_id: payload.category_id || null,
    price: payload.price ?? null,
    stock: payload.stock ?? 0,
    condition: payload.condition || 'occasion',
    description: payload.description || null,
    specs: payload.specs || {},
    is_published: Boolean(payload.is_published),
    is_featured: Boolean(payload.is_featured),
  };
  return throwIfError(await supabase.from('products').update(row).eq('id', id).select(PRODUCT_SELECT).single());
}

export async function deleteProduct(id) {
  const product = await getProduct(id);
  const media = product.media || [];
  const paths = media.map(mediaPath).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET_MEDIA).remove(paths).catch(() => {});
  return throwIfError(await supabase.from('products').delete().eq('id', id).select('id').single());
}

function safeFileName(name) {
  return String(name || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'file';
}

function validateUpload(file, avatar = false) {
  if (!file) throw new Error('Fichier manquant.');
  const max = avatar ? 5 * 1024 * 1024 : (file.type.startsWith('video/') ? 50 : 10) * 1024 * 1024;
  if (!avatar && !file.type.startsWith('image/') && !file.type.startsWith('video/')) throw new Error('Format de média non supporté.');
  if (avatar && !file.type.startsWith('image/')) throw new Error('L’avatar doit être une image.');
  if (file.size > max) throw new Error(`Fichier trop volumineux (maximum ${Math.round(max / 1024 / 1024)} Mo).`);
}

function mediaPath(media) {
  const marker = `/storage/v1/object/public/${BUCKET_MEDIA}/`;
  const index = String(media?.url || '').indexOf(marker);
  return index >= 0 ? decodeURIComponent(String(media.url).slice(index + marker.length)) : '';
}

export async function uploadProductMedia(productId, file, { position = 0, isCover = false } = {}) {
  validateUpload(file);
  const path = `${productId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET_MEDIA).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;
  const { data: publicData } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(path);
  const row = { product_id: productId, type: file.type.startsWith('video/') ? 'video' : 'image', url: publicData.publicUrl, position, is_cover: Boolean(isCover) };
  try {
    return throwIfError(await supabase.from('media').insert(row).select().single());
  } catch (error) {
    await supabase.storage.from(BUCKET_MEDIA).remove([path]).catch(() => {});
    throw error;
  }
}

export async function setMediaCover(productId, mediaId) {
  throwIfError(await supabase.from('media').update({ is_cover: false }).eq('product_id', productId));
  return throwIfError(await supabase.from('media').update({ is_cover: true }).eq('id', mediaId).eq('product_id', productId).select().single());
}

export async function deleteMedia(mediaId, url) {
  const path = mediaPath({ url });
  if (path) await supabase.storage.from(BUCKET_MEDIA).remove([path]).catch(() => {});
  return throwIfError(await supabase.from('media').delete().eq('id', mediaId).select('id').single());
}

export async function listTestimonials() {
  return throwIfError(await supabase.from('testimonials').select('id,name,author_role,content,rating,is_published,display_order,avatar_url').order('display_order').order('created_at', { ascending: false })) || [];
}

export async function createTestimonial(payload) {
  return throwIfError(await supabase.from('testimonials').insert({
    name: String(payload.name || '').trim(), author_role: String(payload.author_role || '').trim() || 'Client',
    content: String(payload.content || '').trim(), rating: Number(payload.rating) || 5,
    is_published: Boolean(payload.is_published), created_by: payload.created_by || null,
  }).select().single());
}

export async function updateTestimonial(id, payload) {
  return throwIfError(await supabase.from('testimonials').update({
    name: String(payload.name || '').trim(), author_role: String(payload.author_role || '').trim() || 'Client',
    content: String(payload.content || '').trim(), rating: Number(payload.rating) || 5,
    is_published: Boolean(payload.is_published),
  }).eq('id', id).select().single());
}

export async function deleteTestimonial(id) {
  return throwIfError(await supabase.from('testimonials').delete().eq('id', id).select('id').single());
}

export async function listProductReviews() {
  return throwIfError(
    await supabase
      .from('product_reviews')
      .select('*, products(title)')
      .order('created_at', { ascending: false })
  ) || [];
}

export async function publishReview(id) {
  return throwIfError(
    await supabase.from('product_reviews').update({ is_published: true }).eq('id', id).select().single()
  );
}

export async function unpublishReview(id) {
  return throwIfError(
    await supabase.from('product_reviews').update({ is_published: false }).eq('id', id).select().single()
  );
}

export async function deleteReview(id) {
  return throwIfError(
    await supabase.from('product_reviews').delete().eq('id', id).select('id').single()
  );
}

export async function updateOwnProfile(id, payload) {
  const allowed = {
    full_name: String(payload.full_name ?? '').trim(),
    phone: String(payload.phone ?? '').trim() || null,
    whatsapp: String(payload.whatsapp ?? '').trim() || null,
    role_title: String(payload.role_title ?? '').trim() || 'Conseiller Ventes',
    facebook_url: String(payload.facebook_url ?? '').trim() || null,
    instagram_url: String(payload.instagram_url ?? '').trim() || null,
    tiktok_url: String(payload.tiktok_url ?? '').trim() || null,
    telegram_url: String(payload.telegram_url ?? '').trim() || null,
    youtube_url: String(payload.youtube_url ?? '').trim() || null,
    linkedin_url: String(payload.linkedin_url ?? '').trim() || null,
    show_public_contact: Boolean(payload.show_public_contact),
  };
  return throwIfError(await supabase.from('admins').update(allowed).eq('id', id).select('id,auth_user_id,email,full_name,phone,whatsapp,facebook_url,instagram_url,tiktok_url,telegram_url,youtube_url,linkedin_url,role,role_title,avatar_url,is_active,show_public_contact,display_order').single());
}

function avatarPathFromUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET_AVATARS}/`;
  const raw = String(url || '');
  const index = raw.indexOf(marker);
  return index >= 0 ? decodeURIComponent(raw.slice(index + marker.length)) : '';
}

export async function uploadAdminAvatar(adminId, file) {
  validateUpload(file, true);
  const { data: current, error: currentError } = await supabase
    .from('admins')
    .select('avatar_url')
    .eq('id', adminId)
    .single();
  if (currentError) throw currentError;

  const path = `${adminId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET_AVATARS)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_AVATARS).getPublicUrl(path);
  const updated = await supabase
    .from('admins')
    .update({ avatar_url: data.publicUrl })
    .eq('id', adminId)
    .select('id,avatar_url')
    .single();

  if (updated.error) {
    await supabase.storage.from(BUCKET_AVATARS).remove([path]).catch(() => {});
    throw updated.error;
  }

  const previousPath = avatarPathFromUrl(current?.avatar_url);
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(BUCKET_AVATARS).remove([previousPath]).catch(() => {});
  }

  return data.publicUrl;
}

export async function notifyNewProduct(productId) {
  const { data, error } = await supabase.functions.invoke('notify-new-product', { body: { product_id: productId } });
  if (error) throw error;
  return data;
}
