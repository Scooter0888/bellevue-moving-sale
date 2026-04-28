/* ============================================
   Moving Sale — App Logic
   ============================================ */

const PHONE = '+12065937974';
const PHONE2 = '+12064766423';

// --- Load Items ---
let allItems = [];

async function loadItems() {
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '<div class="loading-items"><div class="loading-spinner"></div><p>Loading items…</p></div>';
  try {
    const res = await fetch('/.netlify/functions/api/items');
    allItems = await res.json();
  } catch {
    allItems = [];
  }
  // Check URL hash for direct item link
  renderItems();
  checkHash();
}

// --- Render ---
function renderItems() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const category = document.querySelector('.filter-btn.active')?.dataset.category || 'all';
  const sort = document.getElementById('sortSelect').value;

  let items = allItems.filter(item => {
    const matchCat = category === 'all' || item.category.toLowerCase() === category;
    const matchSearch = !search ||
      item.title.toLowerCase().includes(search) ||
      item.description.toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  // Sort
  if (sort === 'price-low') items.sort((a, b) => a.price - b.price);
  else if (sort === 'price-high') items.sort((a, b) => b.price - a.price);
  else items.sort((a, b) => (b.order || 0) - (a.order || 0)); // newest = highest order

  const grid = document.getElementById('itemsGrid');
  const noResults = document.getElementById('noResults');

  if (items.length === 0) {
    grid.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';
  grid.innerHTML = items.map(item => {
    const slug = item.slug || slugify(item.title);
    const img = item.images && item.images.length > 0
      ? item.images[0]
      : '/images/placeholder.svg';
    const photoCount = item.images ? item.images.length : 0;

    const isComingSoon = item.category === 'Coming Soon';
    const cardClass = item.sold ? 'sold' : (isComingSoon ? 'coming-soon' : '');
    const availDateStr = item.availableDate ? formatDate(item.availableDate) : '';

    return `
      <div class="item-card ${cardClass}" data-slug="${slug}" onclick="openItem('${slug}')">
        ${item.sold ? '<span class="sold-badge">Sold</span>' : ''}
        ${isComingSoon && !item.sold ? '<span class="coming-soon-badge">Coming Soon</span>' : ''}
        <div class="item-image-wrap">
          <img src="${img}" alt="${item.title}" loading="lazy">
          ${photoCount > 1 ? `<span class="photo-count">${photoCount} photos</span>` : ''}
        </div>
        <div class="item-info">
          <div class="item-category">${item.itemNumber ? `<span class="item-number">${item.itemNumber}</span> ` : ''}${item.category}</div>
          <h3 class="item-title">${item.title}</h3>
          <div class="item-price">
            ${item.retailPrice ? `<span class="retail-price">$${item.retailPrice}${item.retailSource ? ' ' + item.retailSource : ''}</span> ` : ''}
            ${item.sold ? '<s>$' + item.price + '</s> SOLD' : '$' + item.price}
          </div>
          <div class="item-condition">${item.condition || ''}</div>
          ${isComingSoon ? `<div class="item-available-date">Coming Soon</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// --- Helpers ---
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function linkify(text) {
  // Escape HTML first, then convert URLs to links
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Open Item Modal ---
let currentGalleryIndex = 0;
let currentImages = [];

function openItem(slug) {
  const item = allItems.find(i => (i.slug || slugify(i.title)) === slug);
  if (!item) return;

  // Update URL hash
  history.pushState(null, '', '#' + slug);

  document.getElementById('modalCategory').textContent = (item.itemNumber ? item.itemNumber + ' — ' : '') + item.category;
  document.getElementById('modalTitle').textContent = item.title;
  const priceEl = document.getElementById('modalPrice');
  if (item.retailPrice) {
    priceEl.innerHTML = `<span class="retail-price">$${item.retailPrice}${item.retailSource ? ' ' + item.retailSource : ''}</span> ${item.sold ? `<s>$${item.price}</s> SOLD` : `$${item.price}`}`;
  } else {
    priceEl.textContent = item.sold ? `$${item.price} — SOLD` : `$${item.price}`;
  }
  document.getElementById('modalCondition').textContent = item.condition ? `Condition: ${item.condition}` : '';
  const isComingSoon = item.category === 'Coming Soon';
  const availEl = document.getElementById('modalAvailableDate');
  availEl.textContent = isComingSoon ? 'Coming Soon' : '';
  availEl.style.display = isComingSoon ? 'block' : 'none';
  document.getElementById('modalDescription').innerHTML = linkify(item.description || '');


  // Gallery
  currentImages = item.images && item.images.length > 0 ? item.images : ['/images/placeholder.svg'];
  currentGalleryIndex = 0;
  renderGallery();

  // SMS
  const smsBody = encodeURIComponent(`Hi! I'm interested in "${item.title}" ($${item.price}) from your moving sale.`);
  document.getElementById('modalSMS').href = `sms:${PHONE},${PHONE2}?body=${smsBody}`;

  // Share
  document.getElementById('modalShare').onclick = () => shareItem(item, slug);

  // Show
  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function renderGallery() {
  const gallery = document.getElementById('modalGallery');
  let html = currentImages.map((src, i) =>
    `<img src="${src}" alt="Photo ${i + 1}" class="${i === currentGalleryIndex ? 'active' : ''}" onclick="openLightbox('${src}')" style="cursor:zoom-in">`
  ).join('');

  if (currentImages.length > 1) {
    html += `<button class="gallery-nav prev" onclick="galleryNav(-1)">&lsaquo;</button>`;
    html += `<button class="gallery-nav next" onclick="galleryNav(1)">&rsaquo;</button>`;
    html += `<div class="gallery-dots">` +
      currentImages.map((_, i) =>
        `<button class="gallery-dot ${i === currentGalleryIndex ? 'active' : ''}" onclick="galleryGo(${i})"></button>`
      ).join('') +
      `</div>`;
  }
  gallery.innerHTML = html;
}

function galleryNav(dir) {
  currentGalleryIndex = (currentGalleryIndex + dir + currentImages.length) % currentImages.length;
  renderGallery();
}

function galleryGo(index) {
  currentGalleryIndex = index;
  renderGallery();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
  history.pushState(null, '', window.location.pathname);
}

// Share
async function shareItem(item, slug) {
  const url = window.location.origin + '/#' + slug;
  if (navigator.share) {
    try {
      await navigator.share({ title: item.title, text: `Check out ${item.title} — $${item.price}`, url });
    } catch {}
  } else {
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('modalShare');
    const orig = btn.innerHTML;
    btn.innerHTML = 'Link copied!';
    setTimeout(() => btn.innerHTML = orig, 2000);
  }
}

// --- Lightbox with swipe ---
let lightboxIndex = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

function openLightbox(src) {
  lightboxIndex = currentImages.indexOf(src);
  if (lightboxIndex < 0) lightboxIndex = 0;
  renderLightbox();
  document.getElementById('lightboxOverlay').classList.add('active');
}

function renderLightbox() {
  document.getElementById('lightboxImg').src = currentImages[lightboxIndex];
  const counter = document.getElementById('lightboxCounter');
  if (counter) {
    counter.textContent = currentImages.length > 1 ? `${lightboxIndex + 1} / ${currentImages.length}` : '';
  }
}

function lightboxNav(dir) {
  lightboxIndex = (lightboxIndex + dir + currentImages.length) % currentImages.length;
  renderLightbox();
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').classList.remove('active');
  document.getElementById('lightboxImg').src = '';
}

// Swipe handling
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('lightboxOverlay');

  overlay.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 10 || dy > 10) touchMoved = true;
  }, { passive: true });

  overlay.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(e.changedTouches[0].clientY - touchStartY);

    if (absDx > 50 && absDx > absDy) {
      // Horizontal swipe
      if (dx < 0) lightboxNav(1);  // swipe left = next
      else lightboxNav(-1);         // swipe right = prev
    } else if (!touchMoved) {
      closeLightbox();
    }
  });
});

// Deep link support
function checkHash() {
  const hash = window.location.hash.slice(1);
  if (hash) openItem(hash);
}

// --- Event Listeners ---
document.getElementById('searchInput').addEventListener('input', renderItems);
document.getElementById('sortSelect').addEventListener('change', renderItems);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderItems();
  });
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
document.addEventListener('keydown', (e) => {
  const lightboxOpen = document.getElementById('lightboxOverlay').classList.contains('active');
  if (e.key === 'Escape') { if (lightboxOpen) closeLightbox(); else closeModal(); }
  if (lightboxOpen) {
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
  } else if (document.getElementById('modalOverlay').classList.contains('active')) {
    if (e.key === 'ArrowLeft') galleryNav(-1);
    if (e.key === 'ArrowRight') galleryNav(1);
  }
});

window.addEventListener('hashchange', checkHash);

// --- Init ---
loadItems();
