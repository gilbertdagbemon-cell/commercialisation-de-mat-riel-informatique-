import { supabase, getPublicVendors } from './supabase.js';
import { escapeHtml, digitsOnly, safeHttpUrl } from './utils.js';
import { renderProductsGrid, updateFavoriteCounter } from './product-ui.js';

async function loadHomeProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  const { data, error } = await supabase
    .from('products')
    .select('*, brands(name), categories(name), media(id,type,url,position,is_cover)')
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    console.error('Chargement produits:', error);
    grid.innerHTML = '<div class="empty-state">Impossible de charger les produits pour le moment.</div>';
    return;
  }

  renderProductsGrid(data || [], grid, { showStock: true });
}


async function loadHomeFilters() {
  const [brandResult, categoryResult] = await Promise.all([
    supabase
      .from('brands')
      .select('id,name')
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('categories')
      .select('id,name')
      .eq('is_active', true)
      .order('display_order')
      .order('name'),
  ]);

  if (brandResult.error) throw brandResult.error;
  if (categoryResult.error) throw categoryResult.error;

  const categories = document.getElementById('categories-chips');
  const brands = document.getElementById('brands-chips');

  if (categories) {
    categories.innerHTML =
      '<button type="button" class="chip active" data-filter-category="">Tous</button>' +
      (categoryResult.data || [])
        .map(c =>
          `<button type="button" class="chip" data-filter-category="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`
        )
        .join('');
  }

  if (brands) {
    brands.innerHTML =
      '<button type="button" class="chip active" data-filter-brand="">Toutes les marques</button>' +
      (brandResult.data || [])
        .map(b =>
          `<button type="button" class="chip" data-filter-brand="${escapeHtml(b.id)}">${escapeHtml(b.name)}</button>`
        )
        .join('');
  }

  const apply = async () => {
    const categoryId =
      categories?.querySelector('.chip.active')?.dataset.filterCategory || '';

    const brandId =
      brands?.querySelector('.chip.active')?.dataset.filterBrand || '';

    let query = supabase
      .from('products')
      .select('*, brands(name), categories(name), media(id,type,url,position,is_cover)')
      .eq('is_published', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(12);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data, error } = await query;

    if (error) throw error;

    renderProductsGrid(data || [], '#products-grid', {
      showStock: true
    });
  };

  [categories, brands].forEach(container =>
    container?.addEventListener('click', async event => {
      const chip = event.target.closest('.chip');

      if (!chip) return;

      container
        .querySelectorAll('.chip')
        .forEach(item => item.classList.remove('active'));

      chip.classList.add('active');

      try {
        await apply();
      } catch (error) {
        console.error('Filtre accueil:', error);
      }
    })
  );
}


/* =========================================================
   TÉMOIGNAGES CLIENTS
   ========================================================= */

async function loadTestimonials() {
  const carousel = document.getElementById('testimonials-grid');

  if (!carousel) return;

  try {
    /*
     * On essaie d'abord avec la colonne "verified".
     * Cette colonne doit être ajoutée dans Supabase avec le SQL
     * fourni séparément.
     */
    const { data, error } = await supabase
      .from('testimonials')
      .select(
        'id,name,author_role,content,rating,avatar_url,is_published,display_order,verified'
      )
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {

      /*
       * Si la colonne "verified" n'existe pas encore,
       * on recharge les témoignages sans cette colonne.
       *
       * Cela évite que toute la section plante avant
       * l'exécution du SQL Supabase.
       */
      if (
        error.code === '42703' ||
        /verified/i.test(error.message || '')
      ) {
        const fallback = await supabase
          .from('testimonials')
          .select(
            'id,name,author_role,content,rating,avatar_url,is_published,display_order'
          )
          .eq('is_published', true)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(12);

        if (fallback.error) {
          throw fallback.error;
        }

        renderTestimonials(fallback.data || [], carousel);
        return;
      }

      throw error;
    }

    renderTestimonials(data || [], carousel);

  } catch (error) {
    console.error('Chargement témoignages:', error);

    carousel.innerHTML = `
      <div class="testi-empty">
        Les témoignages sont momentanément indisponibles.
      </div>
    `;
  }
}


/*
 * Génère les initiales du client.
 *
 * Exemple :
 * "Honvo Amen"       → HA
 * "D'ALMEAIDA Georgio" → DG
 * "Koffi"            → K
 */
function getTestimonialInitials(name) {
  const parts = String(name || 'Client')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map(part =>
      part
        .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '')
        .charAt(0)
    )
    .join('')
    .toUpperCase();

  return initials || 'CL';
}


/*
 * Génère les 5 étoiles.
 */
function renderTestimonialStars(rating) {
  const value = Math.max(
    1,
    Math.min(5, Number(rating) || 5)
  );

  return Array.from(
    { length: 5 },
    (_, index) =>
      `<i class="bx ${
        index < value ? 'bxs-star' : 'bx-star'
      }" aria-hidden="true"></i>`
  ).join('');
}


/*
 * Affiche les témoignages dans le carrousel.
 */
function renderTestimonials(items, carousel) {

  if (!items.length) {
    carousel.innerHTML = `
      <div class="testi-empty">
        Aucun témoignage publié pour le moment.
      </div>
    `;

    updateTestimonialsNavigation();
    return;
  }

  carousel.innerHTML = items
    .map(item => {

      const name = String(
        item.name || 'Client'
      ).trim();

      const initials = getTestimonialInitials(name);

      /*
       * Si avatar_url existe :
       * → on affiche la photo.
       *
       * Si avatar_url est vide :
       * → on affiche les initiales.
       *
       * IMPORTANT :
       * aucun logo OrdiMarket n'est utilisé comme
       * photo de remplacement.
       */
      const avatarUrl = safeHttpUrl(
        item.avatar_url || '',
        ''
      );

      const rating = Math.max(
        1,
        Math.min(5, Number(item.rating) || 5)
      );

      /*
       * Par défaut, un ancien témoignage est considéré
       * comme vérifié.
       *
       * Si verified = false dans Supabase,
       * le badge ne sera pas affiché.
       */
      const verified = item.verified !== false;

      let avatarHtml;

      if (avatarUrl) {

        avatarHtml = `
          <img
            class="testi-avatar"
            src="${escapeHtml(avatarUrl)}"
            alt="Photo de ${escapeHtml(name)}"
            loading="lazy"
            width="54"
            height="54"
            data-initials="${escapeHtml(initials)}"
          >
        `;

      } else {

        avatarHtml = `
          <span
            class="testi-avatar testi-avatar-initials"
            aria-label="Avatar de ${escapeHtml(name)}"
          >
            ${escapeHtml(initials)}
          </span>
        `;
      }

      return `
        <article class="testi-card">

          <div class="testi-head">

            ${avatarHtml}

            <div class="testi-info">

              <strong>
                ${escapeHtml(name)}
              </strong>

              <span>
                ${escapeHtml(
                  item.author_role || 'Client'
                )}
              </span>

            </div>

          </div>


          <div class="testi-meta">

            <div
              class="testi-stars"
              aria-label="${rating} sur 5"
            >
              ${renderTestimonialStars(rating)}
            </div>

            ${
              verified
                ? `
                  <span class="testi-verified">
                    <i
                      class="bx bx-check-circle"
                      aria-hidden="true"
                    ></i>
                    Achat vérifié
                  </span>
                `
                : ''
            }

          </div>


          <p class="testi-comment">
            ${escapeHtml(item.content || '')}
          </p>


          <i
            class="bx bxs-quote-alt-right testi-quote"
            aria-hidden="true"
          ></i>

        </article>
      `;
    })
    .join('');


  /*
   * Si une photo existe mais que son URL ne fonctionne pas,
   * on remplace automatiquement la photo par les initiales.
   */
  carousel
    .querySelectorAll('img[data-initials]')
    .forEach(img => {

      img.addEventListener(
        'error',
        () => {

          const fallback =
            document.createElement('span');

          fallback.className =
            'testi-avatar testi-avatar-initials';

          fallback.textContent =
            img.dataset.initials || 'CL';

          fallback.setAttribute(
            'aria-label',
            img.alt || 'Avatar client'
          );

          img.replaceWith(fallback);

        },
        { once: true }
      );

    });


  setupTestimonialsCarousel();
}


/*
 * Configure les boutons précédent / suivant
 * et le défilement du carrousel.
 */
function setupTestimonialsCarousel() {

  const carousel =
    document.getElementById('testimonials-grid');

  const previousBtn =
    document.getElementById('testimonials-prev');

  const nextBtn =
    document.getElementById('testimonials-next');

  if (
    !carousel ||
    !previousBtn ||
    !nextBtn
  ) {
    return;
  }


  /*
   * Détermine automatiquement la largeur
   * d'une carte + l'espace entre les cartes.
   */
  const getScrollAmount = () => {

    const card =
      carousel.querySelector('.testi-card');

    if (!card) {
      return Math.max(
        carousel.clientWidth * 0.85,
        260
      );
    }

    const gap =
      parseFloat(
        getComputedStyle(carousel).gap
      ) || 0;

    return (
      card.getBoundingClientRect().width +
      gap
    );
  };


  /*
   * Bouton précédent.
   */
  previousBtn.onclick = () => {

    carousel.scrollBy({
      left: -getScrollAmount(),
      behavior: 'smooth'
    });

  };


  /*
   * Bouton suivant.
   */
  nextBtn.onclick = () => {

    carousel.scrollBy({
      left: getScrollAmount(),
      behavior: 'smooth'
    });

  };


  updateTestimonialsNavigation();


  /*
   * Met à jour l'état des boutons pendant
   * le défilement manuel/tactile.
   */
  carousel.addEventListener(
    'scroll',
    updateTestimonialsNavigation,
    { passive: true }
  );


  /*
   * Recalcule les boutons si la fenêtre
   * change de taille.
   */
  window.addEventListener(
    'resize',
    updateTestimonialsNavigation
  );
}


/*
 * Active/désactive les boutons selon la position
 * du carrousel.
 */
function updateTestimonialsNavigation() {

  const carousel =
    document.getElementById('testimonials-grid');

  const previousBtn =
    document.getElementById('testimonials-prev');

  const nextBtn =
    document.getElementById('testimonials-next');

  if (
    !carousel ||
    !previousBtn ||
    !nextBtn
  ) {
    return;
  }


  const maxScroll = Math.max(
    0,
    carousel.scrollWidth -
      carousel.clientWidth
  );


  /*
   * On est au début.
   */
  previousBtn.disabled =
    carousel.scrollLeft <= 5;


  /*
   * On est à la fin ou il n'y a pas
   * suffisamment de contenu pour défiler.
   */
  nextBtn.disabled =
    maxScroll <= 5 ||
    carousel.scrollLeft >= maxScroll - 5;
}


/* =========================================================
   FAQ
   ========================================================= */

async function loadFaqs() {
  const list = document.getElementById('faq-list');

  if (!list) return;

  const { data, error } = await supabase
    .from('faqs')
    .select('id,question,answer')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Chargement FAQ:', error);

    list.innerHTML =
      '<p class="faq-empty">La FAQ est momentanément indisponible.</p>';

    return;
  }

  if (!data?.length) {
    list.innerHTML =
      '<p class="faq-empty">Aucune question fréquente pour le moment.</p>';

    return;
  }

  list.innerHTML = data
    .map(
      item =>
        `
        <details class="faq-item">

          <summary aria-expanded="false">
            ${escapeHtml(item.question)}

            <i
              class="bx bx-chevron-down"
              aria-hidden="true"
            ></i>
          </summary>

          <div class="faq-answer">
            ${escapeHtml(item.answer).replace(
              /\n/g,
              '<br>'
            )}
          </div>

        </details>
        `
    )
    .join('');


  list
    .querySelectorAll('.faq-item')
    .forEach(item => {

      const summary =
        item.querySelector('summary');

      item.addEventListener(
        'toggle',
        () =>
          summary?.setAttribute(
            'aria-expanded',
            String(item.open)
          )
      );

    });
}


/* =========================================================
   SÉLECTION DU CONSEILLER
   ========================================================= */

async function initVendorPicker() {

  const select =
    document.getElementById('vendor-select');

  const card =
    document.getElementById('selected-vendor');

  if (!select || !card) return;

  try {

    const vendors =
      await getPublicVendors();


    select.innerHTML =
      '<option value="">Choisir un conseiller</option>' +
      vendors
        .map(
          (v, i) =>
            `
            <option value="${i}">
              ${escapeHtml(v.full_name)}
              —
              ${escapeHtml(
                v.role_title ||
                'Conseiller Ventes'
              )}
            </option>
            `
        )
        .join('');


    const render = () => {

      const vendor =
        vendors[Number(select.value)];


      if (!vendor) {

        card.hidden = true;
        card.innerHTML = '';

        return;
      }


      const whatsapp = digitsOnly(
        vendor.whatsapp_number ||
        vendor.phone ||
        ''
      );


      const href = whatsapp
        ? `https://wa.me/${whatsapp}`
        : '#';


      card.hidden = false;


      card.innerHTML = `
        <div class="vendor-picker-person">

          <img
            src="${escapeHtml(
              safeHttpUrl(
                vendor.photo_url || '',
                'ordimarket-logo.png'
              )
            )}"
            alt="${escapeHtml(
              vendor.full_name
            )}"
          >

          <div>

            <strong>
              ${escapeHtml(
                vendor.full_name
              )}
            </strong>

            <span>
              ${escapeHtml(
                vendor.role_title ||
                'Conseiller Ventes'
              )}
            </span>

          </div>

        </div>

        ${
          whatsapp
            ? `
              <a
                class="vendor-whatsapp"
                href="${escapeHtml(href)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class='bx bxl-whatsapp'></i>
                WhatsApp
              </a>
            `
            : ''
        }
      `;
    };


    select.addEventListener(
      'change',
      render
    );

  } catch (_) {

    /*
     * Fallback silencieux :
     * le reste de la page doit rester fonctionnel
     * même si la RPC publique des vendeurs échoue.
     */
    select.innerHTML =
      '<option value="">Choisir un conseiller</option>';

    card.hidden = true;
    card.innerHTML = '';
  }
}


/* =========================================================
   NEWSLETTER
   ========================================================= */

async function subscribe(event) {

  event.preventDefault();

  const form = event.currentTarget;

  const input =
    form.querySelector(
      'input[type="email"]'
    );

  const email =
    input?.value.trim().toLowerCase() || '';

  if (!email) return;


  const button =
    form.querySelector('button');

  button.disabled = true;


  try {

    const { error } =
      await supabase
        .from('subscribers')
        .insert({ email });


    /*
     * 23505 = adresse déjà inscrite.
     * On ne considère pas cela comme une erreur
     * bloquante pour l'utilisateur.
     */
    if (
      error &&
      error.code !== '23505'
    ) {
      throw error;
    }


    form.reset();

    button.textContent =
      'Inscrit !';


    setTimeout(
      () => {
        button.textContent =
          "S'inscrire";
      },
      2200
    );

  } catch (error) {

    console.error(
      'Inscription newsletter:',
      error
    );

    button.textContent =
      'Réessayer';


    setTimeout(
      () => {
        button.textContent =
          "S'inscrire";
      },
      2200
    );

  } finally {

    button.disabled = false;

  }
}


/* =========================================================
   INITIALISATION DE LA PAGE D'ACCUEIL
   ========================================================= */

function initHome() {

  /*
   * Newsletter principale.
   */
  document
    .getElementById('subscribe-form')
    ?.addEventListener(
      'submit',
      subscribe
    );


  /*
   * Newsletter du footer.
   */
  document
    .getElementById('footer-subscribe-form')
    ?.addEventListener(
      'submit',
      subscribe
    );


  /*
   * Bouton de recherche.
   */
  document
    .getElementById('search-trigger')
    ?.addEventListener(
      'click',
      event => {

        event.preventDefault();

        window.location.href =
          'catalogue.html#catalog-search';

      }
    );


  /*
   * Compteur des favoris.
   */
  updateFavoriteCounter();


  /*
   * Sélection du conseiller.
   */
  initVendorPicker();


  /*
   * Chargement simultané :
   * - filtres
   * - produits
   * - témoignages
   * - FAQ
   */
  Promise.all([
    loadHomeFilters(),
    loadHomeProducts(),
    loadTestimonials(),
    loadFaqs()
  ]).catch(console.error);
}


/*
 * Lance l'initialisation lorsque le DOM est prêt.
 */
if (
  document.readyState === 'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    initHome,
    { once: true }
  );
} else {
  initHome();
}