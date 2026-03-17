/* ============================================
   Moving Sale — App Logic
   ============================================ */

const PHONE = '+12065937974';
const EMAIL = 'cuttingthrough8@gmail.com';
const DEADLINE = new Date('2026-05-10T23:59:59');

// --- Countdown ---
function updateCountdown() {
  const now = new Date();
  const diff = DEADLINE - now;
  if (diff <= 0) {
    document.getElementById('countdown').textContent = 'Sale has ended!';
    return;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  document.getElementById('countdown').textContent = `${days} day${days !== 1 ? 's' : ''} left!`;
}
updateCountdown();
setInterval(updateCountdown, 60000);

// --- Load Items ---
let allItems = [];

async function loadItems() {
  try {
    const res = await fetch('/content/items.json');
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

    return `
      <div class="item-card ${item.sold ? 'sold' : ''}" data-slug="${slug}" onclick="openItem('${slug}')">
        ${item.sold ? '<span class="sold-badge">Sold</span>' : ''}
        <div class="item-image-wrap">
          <img src="${img}" alt="${item.title}" loading="lazy">
          ${photoCount > 1 ? `<span class="photo-count">${photoCount} photos</span>` : ''}
        </div>
        <div class="item-info">
          <div class="item-category">${item.category}</div>
          <h3 class="item-title">${item.title}</h3>
          <div class="item-price">${item.sold ? '<s>$' + item.price + '</s> SOLD' : '$' + item.price}</div>
          <div class="item-condition">${item.condition || ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- Slug helper ---
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// --- Open Item Modal ---
let currentGalleryIndex = 0;
let currentImages = [];

function openItem(slug) {
  const item = allItems.find(i => (i.slug || slugify(i.title)) === slug);
  if (!item) return;

  // Update URL hash
  history.pushState(null, '', '#' + slug);

  document.getElementById('modalCategory').textContent = item.category;
  document.getElementById('modalTitle').textContent = item.title;
  document.getElementById('modalPrice').textContent = item.sold ? `$${item.price} — SOLD` : `$${item.price}`;
  document.getElementById('modalCondition').textContent = item.condition ? `Condition: ${item.condition}` : '';
  document.getElementById('modalDescription').textContent = item.description || '';

  // SMS link
  const smsBody = encodeURIComponent(`Hi! I'm interested in "${item.title}" ($${item.price}) from your moving sale.`);
  document.getElementById('modalSMS').href = `sms:${PHONE}?body=${smsBody}`;

  // Email link
  const emailSubject = encodeURIComponent(`Enquiry: ${item.title} — Moving Sale`);
  const emailBody = encodeURIComponent(`Hi,\n\nI'm interested in "${item.title}" listed at $${item.price}.\n\nPlease let me know if it's still available.\n\nThanks!`);
  document.getElementById('modalEmail').href = `mailto:${EMAIL}?subject=${emailSubject}&body=${emailBody}`;

  // Gallery
  currentImages = item.images && item.images.length > 0 ? item.images : ['/images/placeholder.svg'];
  currentGalleryIndex = 0;
  renderGallery();

  // Share
  document.getElementById('modalShare').onclick = () => shareItem(item, slug);

  // Show
  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function renderGallery() {
  const gallery = document.getElementById('modalGallery');
  let html = currentImages.map((src, i) =>
    `<img src="${src}" alt="Photo ${i + 1}" class="${i === currentGalleryIndex ? 'active' : ''}">`
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
  if (e.key === 'Escape') closeModal();
  if (document.getElementById('modalOverlay').classList.contains('active')) {
    if (e.key === 'ArrowLeft') galleryNav(-1);
    if (e.key === 'ArrowRight') galleryNav(1);
  }
});

window.addEventListener('hashchange', checkHash);

// --- Init ---
loadItems();
