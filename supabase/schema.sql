-- ⚠️ ATTENTION : CE SCRIPT SUPPRIME TOUTES LES DONNÉES EXISTANTES (DROP CASCADE).
-- NE JAMAIS L’EXÉCUTER SUR LA BASE DE PRODUCTION SANS SAUVEGARDE PRÉALABLE.
-- À utiliser uniquement pour une réinitialisation complète volontaire.

-- ============================================================
-- ORDIMARKET
-- SCHÉMA SQL FINAL
-- ============================================================
-- Tables :
--   admins
--   brands
--   categories
--   products
--   media
--   testimonials
--   subscribers
--   notification_logs (si elle existe déjà)
--
-- Sécurité :
--   RLS
--   is_admin()
--   is_super_admin()
--   protection du rôle admin
--   RPC public_admin_contacts()
--   Storage sécurisé


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- 2. NETTOYAGE
-- ============================================================

drop function if exists public.set_updated_at() cascade;
drop function if exists public.public_admin_contacts() cascade;
drop function if exists public.prevent_admin_role_escalation() cascade;
drop function if exists public.is_super_admin() cascade;
drop function if exists public.is_admin() cascade;

drop table if exists public.media cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;
drop table if exists public.brands cascade;
drop table if exists public.testimonials cascade;
drop table if exists public.faqs cascade;
drop table if exists public.notification_logs cascade;
drop table if exists public.subscribers cascade;
drop table if exists public.admins cascade;


-- ============================================================
-- 3. FONCTION updated_at
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ============================================================
-- 4. TABLE ADMINS
-- ============================================================

create table public.admins (
    id uuid primary key default gen_random_uuid(),

    auth_user_id uuid not null unique
        references auth.users(id)
        on delete cascade,

    full_name text not null,

    email text,

    phone text,

    whatsapp text,

    facebook_url text,

    instagram_url text,

    tiktok_url text,

    telegram_url text,

    youtube_url text,

    linkedin_url text,

    role_title text not null default 'Conseiller Ventes',

    display_order integer not null default 0,

    role text not null default 'admin'
        check (
            role in (
                'admin',
                'super_admin',
                'vendeur'
            )
        ),

    avatar_url text,

    is_active boolean not null default true,

    show_public_contact boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index admins_auth_user_id_idx
on public.admins(auth_user_id);

create index admins_active_idx
on public.admins(is_active);

create index admins_role_idx
on public.admins(role);

create trigger admins_set_updated_at
before update on public.admins
for each row
execute function public.set_updated_at();


-- ============================================================
-- 5. BRANDS
-- ============================================================

create table public.brands (
    id uuid primary key default gen_random_uuid(),

    name text not null unique,

    slug text not null unique,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index brands_name_idx
on public.brands(name);

create index brands_active_idx
on public.brands(is_active);

create trigger brands_set_updated_at
before update on public.brands
for each row
execute function public.set_updated_at();


-- ============================================================
-- 6. CATEGORIES
-- ============================================================

create table public.categories (
    id uuid primary key default gen_random_uuid(),

    name text not null unique,

    slug text not null unique,

    display_order integer not null default 0,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index categories_order_idx
on public.categories(display_order);

create index categories_active_idx
on public.categories(is_active);

create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();


-- ============================================================
-- 7. PRODUCTS
-- ============================================================

create table public.products (
    id uuid primary key default gen_random_uuid(),

    title text not null,

    slug text not null unique,

    brand_id uuid
        references public.brands(id)
        on delete set null,

    category_id uuid
        references public.categories(id)
        on delete set null,

    price numeric(12,2)
        check (
            price is null
            or price >= 0
        ),

    stock integer not null default 0
        check (stock >= 0),

    condition text not null default 'occasion'
        check (
            condition in (
                'neuf',
                'quasi-neuf',
                'occasion'
            )
        ),

    description text,

    specs jsonb not null default '{}'::jsonb,

    is_published boolean not null default false,

    is_featured boolean not null default false,

    created_by uuid
        references public.admins(id)
        on delete set null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index products_brand_id_idx
on public.products(brand_id);

create index products_category_id_idx
on public.products(category_id);

create index products_published_idx
on public.products(is_published);

create index products_featured_idx
on public.products(is_featured);

create index products_created_at_idx
on public.products(created_at desc);

create index products_stock_idx
on public.products(stock);

create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();


-- ============================================================
-- 8. MEDIA
-- ============================================================

create table public.media (
    id uuid primary key default gen_random_uuid(),

    product_id uuid not null
        references public.products(id)
        on delete cascade,

    type text not null
        check (
            type in (
                'image',
                'video'
            )
        ),

    url text not null,

    position integer not null default 0
        check (position >= 0),

    is_cover boolean not null default false,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index media_product_id_idx
on public.media(product_id);

create index media_position_idx
on public.media(product_id, position);

create trigger media_set_updated_at
before update on public.media
for each row
execute function public.set_updated_at();


create unique index media_one_cover_per_product_idx
on public.media(product_id)
where is_cover = true;


-- ============================================================
-- 8A. PRODUCT REVIEWS
-- ============================================================

create table public.product_reviews (
    id uuid primary key default gen_random_uuid(),

    product_id uuid not null
        references public.products(id)
        on delete cascade,

    author_name text not null
        check (
            char_length(author_name) between 2 and 100
        ),

    rating integer not null
        check (
            rating between 1 and 5
        ),

    comment text not null
        check (
            char_length(comment) between 1 and 1000
        ),

    is_published boolean not null default false,

    created_at timestamptz not null default now()
);

create index product_reviews_product_id_idx
on public.product_reviews(product_id);

create index product_reviews_published_idx
on public.product_reviews(is_published);

create index product_reviews_created_at_idx
on public.product_reviews(created_at desc);


-- ============================================================
-- 9. TESTIMONIALS
-- ============================================================

create table public.testimonials (
    id uuid primary key default gen_random_uuid(),

    name text not null,

    author_role text default 'Client',

    content text not null,


    avatar_url text,

    rating integer not null default 5
        check (
            rating between 1 and 5
        ),

    display_order integer not null default 0,

    is_published boolean not null default true,

    created_by uuid references public.admins(id) on delete set null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index testimonials_order_idx
on public.testimonials(display_order);

create index testimonials_published_idx
on public.testimonials(is_published);

create trigger testimonials_set_updated_at
before update on public.testimonials
for each row
execute function public.set_updated_at();


-- ============================================================
-- 10. FAQ
-- ============================================================

create table public.faqs (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    answer text not null,
    display_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index faqs_active_order_idx
on public.faqs(is_active, display_order);


-- ============================================================
-- 10. NEWSLETTER
-- ============================================================

create table public.subscribers (
    id uuid primary key default gen_random_uuid(),

    email text not null unique,

    is_active boolean not null default true,

    unsubscribe_token uuid not null default gen_random_uuid() unique,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index subscribers_email_idx
on public.subscribers(email);

create index subscribers_active_idx
on public.subscribers(is_active);

create trigger subscribers_set_updated_at
before update on public.subscribers
for each row
execute function public.set_updated_at();


create unique index idx_subscribers_email_lower
on public.subscribers(lower(trim(email)));


-- ============================================================
-- 10B. JOURNAL DES NOTIFICATIONS
-- ============================================================

create table public.notification_logs (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete set null,
    sent_to_count integer not null default 0,
    status text not null default 'sent' check (status in ('sent','partial','failed')),
    sent_at timestamptz not null default now()
);

create index notification_logs_product_idx on public.notification_logs(product_id);
create index notification_logs_status_idx on public.notification_logs(status);


-- ============================================================
-- 11. FONCTION is_admin()
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admins
        where auth_user_id = auth.uid()
          and is_active = true
    );
$$;

revoke all on function public.is_admin() from public;

grant execute
on function public.is_admin()
to anon, authenticated;


-- ============================================================
-- 12. FONCTION is_super_admin()
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admins
        where auth_user_id = auth.uid()
          and role = 'super_admin'
          and is_active = true
    );
$$;

revoke all on function public.is_super_admin() from public;

grant execute
on function public.is_super_admin()
to authenticated;


-- ============================================================
-- 13. PROTECTION DU RÔLE ADMIN
-- ============================================================

create or replace function public.prevent_admin_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

    -- Le super_admin peut modifier les rôles.
    if public.is_super_admin() then
        return new;
    end if;

    -- Un simple admin ne peut pas modifier son propre rôle.
    if old.role is distinct from new.role then
        raise exception
            'Modification du rôle interdite pour un administrateur.';
    end if;

    return new;

end;
$$;


drop trigger if exists protect_admin_role
on public.admins;


create trigger protect_admin_role
before update on public.admins
for each row
execute function public.prevent_admin_role_escalation();


-- ============================================================
-- 14. RPC CONTACTS PUBLICS DU FOOTER
-- ============================================================
-- Cette fonction n'expose que les informations nécessaires.
--
-- IMPORTANT :
-- Elle utilise les colonnes réellement présentes dans admins :
--   full_name
--   avatar_url
--   whatsapp
--   phone
--   show_public_contact
--
-- ============================================================

create or replace function public.public_admin_contacts()
returns table (
    full_name text,
    role_title text,
    photo_url text,
    whatsapp_number text,
    phone text,
    facebook_url text,
    instagram_url text,
    tiktok_url text,
    telegram_url text,
    youtube_url text,
    linkedin_url text,
    display_order integer
)
language sql
stable
security definer
set search_path = public
as $$
    select
        a.full_name,
        a.role_title,
        a.avatar_url,
        a.whatsapp,
        a.phone,
        a.facebook_url,
        a.instagram_url,
        a.tiktok_url,
        a.telegram_url,
        a.youtube_url,
        a.linkedin_url,
        a.display_order
    from public.admins a
    where a.is_active = true
      and a.show_public_contact = true
    order by a.full_name asc;
$$;


revoke all
on function public.public_admin_contacts()
from public;


grant execute
on function public.public_admin_contacts()
to anon, authenticated;


-- ============================================================
-- 15. RLS
-- ============================================================

alter table public.admins enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.media enable row level security;
alter table public.product_reviews enable row level security;
alter table public.testimonials enable row level security;
alter table public.faqs enable row level security;
alter table public.subscribers enable row level security;
alter table public.notification_logs enable row level security;


-- ============================================================
-- 16. ADMINS — POLICIES
-- ============================================================

create policy "admins_select_own"
on public.admins
for select
to authenticated
using (
    auth.uid() = auth_user_id
);


create policy "admins_select_super_admin"
on public.admins
for select
to authenticated
using (
    public.is_super_admin()
);


create policy "admins_update_own"
on public.admins
for update
to authenticated
using (
    auth.uid() = auth_user_id
)
with check (
    auth.uid() = auth_user_id
);


create policy "admins_update_super_admin"
on public.admins
for update
to authenticated
using (
    public.is_super_admin()
)
with check (
    public.is_super_admin()
);


create policy "admins_insert_super_admin"
on public.admins
for insert
to authenticated
with check (
    public.is_super_admin()
);


create policy "admins_delete_super_admin"
on public.admins
for delete
to authenticated
using (
    public.is_super_admin()
);


-- ============================================================
-- 17. BRANDS — POLICIES
-- ============================================================

create policy "brands_public_read"
on public.brands
for select
to anon, authenticated
using (
    is_active = true
);


create policy "brands_admin_insert"
on public.brands
for insert
to authenticated
with check (
    public.is_admin()
);


create policy "brands_admin_update"
on public.brands
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "brands_admin_delete"
on public.brands
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- 18. CATEGORIES — POLICIES
-- ============================================================

create policy "categories_public_read"
on public.categories
for select
to anon, authenticated
using (
    is_active = true
);


create policy "categories_admin_insert"
on public.categories
for insert
to authenticated
with check (
    public.is_admin()
);


create policy "categories_admin_update"
on public.categories
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "categories_admin_delete"
on public.categories
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- 19. PRODUCTS — POLICIES
-- ============================================================

create policy "products_public_read"
on public.products
for select
to anon, authenticated
using (
    is_published = true
);


create policy "products_admin_read"
on public.products
for select
to authenticated
using (
    public.is_admin()
);


create policy "products_admin_insert"
on public.products
for insert
to authenticated
with check (
    public.is_admin()
);


create policy "products_admin_update"
on public.products
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "products_admin_delete"
on public.products
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- 20. MEDIA — POLICIES
-- ============================================================

create policy "media_public_read"
on public.media
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.products p
        where p.id = media.product_id
          and p.is_published = true
    )
);


create policy "media_admin_read"
on public.media
for select
to authenticated
using (
    public.is_admin()
);


create policy "media_admin_insert"
on public.media
for insert
to authenticated
with check (
    public.is_admin()
);


create policy "media_admin_update"
on public.media
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "media_admin_delete"
on public.media
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- PRODUCT REVIEWS — POLICIES
-- ============================================================

create policy "product_reviews_public_read"
on public.product_reviews
for select
to anon, authenticated
using (
    is_published = true
);


create policy "product_reviews_public_insert"
on public.product_reviews
for insert
to anon, authenticated
with check (
    is_published = false
    and char_length(author_name) between 2 and 100
    and char_length(comment) between 1 and 1000
);


create policy "product_reviews_admin_read"
on public.product_reviews
for select
to authenticated
using (
    public.is_admin()
);


create policy "product_reviews_admin_update"
on public.product_reviews
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "product_reviews_admin_delete"
on public.product_reviews
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- 21. TESTIMONIALS — POLICIES
-- ============================================================

create policy "testimonials_public_read"
on public.testimonials
for select
to anon, authenticated
using (
    is_published = true
);


create policy "testimonials_admin_read"
on public.testimonials
for select
to authenticated
using (
    public.is_admin()
);


create policy "testimonials_admin_insert"
on public.testimonials
for insert
to authenticated
with check (
    public.is_admin()
);


create policy "testimonials_admin_update"
on public.testimonials
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "testimonials_admin_delete"
on public.testimonials
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- FAQ — POLICIES
-- ============================================================

create policy "faqs_public_read"
on public.faqs
for select
to anon, authenticated
using (is_active = true);

create policy "faqs_admin_insert"
on public.faqs
for insert
to authenticated
with check (public.is_admin());

create policy "faqs_admin_update"
on public.faqs
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "faqs_admin_delete"
on public.faqs
for delete
to authenticated
using (public.is_admin());


-- ============================================================
-- 22. SUBSCRIBERS — POLICIES
-- ============================================================

create policy "subscribers_public_insert"
on public.subscribers
for insert
to anon, authenticated
with check (
    length(trim(email)) between 5 and 254
    and position('@' in trim(email)) > 1
    and position(
        '.' in split_part(trim(email), '@', 2)
    ) > 1
);


create policy "subscribers_admin_select"
on public.subscribers
for select
to authenticated
using (
    public.is_admin()
);


create policy "subscribers_admin_update"
on public.subscribers
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


create policy "subscribers_admin_delete"
on public.subscribers
for delete
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- NOTIFICATION LOGS — ADMIN ONLY
-- ============================================================

create policy "notification_logs_admin_select"
on public.notification_logs
for select
to authenticated
using (public.is_admin());

create policy "notification_logs_admin_insert"
on public.notification_logs
for insert
to authenticated
with check (public.is_admin());


-- ============================================================
-- 23. STORAGE — BUCKETS
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public
)
values
    (
        'product-media',
        'product-media',
        true
    ),
    (
        'admin-avatars',
        'admin-avatars',
        true
    )
on conflict (id)
do update set
    public = excluded.public;


-- ============================================================
-- 24. STORAGE — NETTOYAGE DES POLICIES
-- ============================================================

drop policy if exists "product_media_public_read"
on storage.objects;

drop policy if exists "product_media_admin_insert"
on storage.objects;

drop policy if exists "product_media_admin_update"
on storage.objects;

drop policy if exists "product_media_admin_delete"
on storage.objects;

drop policy if exists "admin_avatars_public_read"
on storage.objects;

drop policy if exists "admin_avatars_admin_insert"
on storage.objects;

drop policy if exists "admin_avatars_admin_update"
on storage.objects;

drop policy if exists "admin_avatars_admin_delete"
on storage.objects;


-- Ancienne policy éventuellement créée auparavant.
drop policy if exists "Lecture des admins pour authentification"
on public.admins;


-- ============================================================
-- 25. STORAGE — PRODUCT MEDIA
-- ============================================================

create policy "product_media_public_read"
on storage.objects
for select
to public
using (
    bucket_id = 'product-media'
);


create policy "product_media_admin_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'product-media'
    and public.is_admin()
);


create policy "product_media_admin_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'product-media'
    and public.is_admin()
)
with check (
    bucket_id = 'product-media'
    and public.is_admin()
);


create policy "product_media_admin_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'product-media'
    and public.is_admin()
);


-- ============================================================
-- 26. STORAGE — ADMIN AVATARS
-- ============================================================

create policy "admin_avatars_public_read"
on storage.objects
for select
to public
using (
    bucket_id = 'admin-avatars'
);


create policy "admin_avatars_admin_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'admin-avatars'
    and public.is_admin()
);


create policy "admin_avatars_admin_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'admin-avatars'
    and public.is_admin()
)
with check (
    bucket_id = 'admin-avatars'
    and public.is_admin()
);


create policy "admin_avatars_admin_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'admin-avatars'
    and public.is_admin()
);


-- ============================================================
-- 27. MARQUES DE BASE
-- ============================================================

insert into public.brands (
    name,
    slug
)
values
    ('HP', 'hp'),
    ('Dell', 'dell'),
    ('Lenovo', 'lenovo'),
    ('ASUS', 'asus'),
    ('Acer', 'acer'),
    ('Apple', 'apple'),
    ('MSI', 'msi'),
    ('Microsoft', 'microsoft'),
    ('Samsung', 'samsung'),
    ('Toshiba', 'toshiba')
on conflict (slug)
do nothing;


-- ============================================================
-- 28. CATÉGORIES DE BASE
-- ============================================================

insert into public.categories (
    name,
    slug,
    display_order
)
values
    (
        'Ordinateurs portables',
        'ordinateurs-portables',
        1
    ),
    (
        'Ordinateurs de bureau',
        'ordinateurs-de-bureau',
        2
    ),
    (
        'PC Gaming',
        'pc-gaming',
        3
    ),
    (
        'MacBook',
        'macbook',
        4
    ),
    (
        'Accessoires informatiques',
        'accessoires-informatiques',
        5
    ),
    (
        'Périphériques',
        'peripheriques',
        6
    )
on conflict (slug)
do nothing;


-- ============================================================
-- 29. DROITS
-- ============================================================

grant usage
on schema public
to anon, authenticated;


grant select
on public.brands
to anon, authenticated;


grant select
on public.categories
to anon, authenticated;


grant select
on public.products
to anon, authenticated;


grant select
on public.media
to anon, authenticated;


grant select, insert
on public.product_reviews
to anon, authenticated;


grant select, update, delete
on public.product_reviews
to authenticated;


grant select
on public.testimonials
to anon, authenticated;


grant insert
on public.subscribers
to anon, authenticated;


grant select, insert, update, delete
on public.brands
to authenticated;


grant select, insert, update, delete
on public.categories
to authenticated;


grant select, insert, update, delete
on public.products
to authenticated;


grant select, insert, update, delete
on public.media
to authenticated;


grant select, insert, update, delete
on public.testimonials
to authenticated;


grant select, update, delete
on public.subscribers
to authenticated;

grant select, insert
on public.notification_logs
to authenticated;


grant select, update
on public.admins
to authenticated;
