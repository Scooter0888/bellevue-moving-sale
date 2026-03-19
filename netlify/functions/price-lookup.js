const REPO = 'Scooter0888/bellevue-moving-sale';
const BRANCH = 'main';
const DAILY_LIMIT = 100;

function ghHeaders() {
  return {
    'Authorization': `token ${process.env.GITHUB_PAT}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function cors(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

// Search Google for product price
async function searchPrice(productName) {
  const query = encodeURIComponent(`${productName} price USD buy`);
  const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${query}&num=5`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.log(`Google API error: ${res.status} ${text}`);
    return null;
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;

  // Try to extract price from snippets and titles
  let bestPrice = null;
  let bestSource = '';

  for (const item of data.items) {
    const text = `${item.title || ''} ${item.snippet || ''}`;
    const link = item.link || '';

    // Find dollar amounts like $123, $1,234, $123.99
    const priceMatches = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (!priceMatches) continue;

    for (const match of priceMatches) {
      const price = parseFloat(match.replace(/[$,]/g, ''));
      // Filter out unreasonable prices (under $5 or over $50,000)
      if (price < 5 || price > 50000) continue;

      // Determine source from URL
      let source = 'Other';
      if (link.includes('amazon.com')) source = 'Amazon';
      else if (link.includes('bestbuy.com')) source = 'Best Buy';
      else if (link.includes('walmart.com')) source = 'Walmart';
      else if (link.includes('target.com')) source = 'Target';
      else if (link.includes('ikea.com')) source = 'IKEA';
      else if (link.includes('costco.com')) source = 'Costco';

      // Prefer Amazon, then other major retailers, then any
      const sourcePriority = { 'Amazon': 5, 'Best Buy': 4, 'Walmart': 4, 'Target': 3, 'IKEA': 3, 'Costco': 3, 'Other': 1 };
      const currentPriority = sourcePriority[bestSource] || 0;
      const newPriority = sourcePriority[source] || 0;

      if (!bestPrice || newPriority > currentPriority) {
        bestPrice = Math.round(price);
        bestSource = source;
      }
    }
  }

  if (bestPrice) {
    return { retailPrice: bestPrice, retailSource: bestSource };
  }
  return null;
}

// GitHub helpers
async function ghFetch(path, options = {}) {
  const url = `https://api.github.com/repos/${REPO}/${path}`;
  const res = await fetch(url, { headers: ghHeaders(), ...options });
  return res;
}

async function getFile(path) {
  const res = await ghFetch(`contents/${path}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  return res.json();
}

async function putFile(path, content, message, sha) {
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  return ghFetch(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(200, {});

  // Auth check
  const pw = event.headers['x-admin-password'];
  if (pw !== process.env.ADMIN_PASSWORD) {
    return cors(401, { error: 'Unauthorized' });
  }

  try {
    // Get all items
    const res = await ghFetch(`contents/content/items?ref=${BRANCH}`);
    if (res.status === 404) return cors(200, { message: 'No items found', updated: [] });
    const files = await res.json();
    if (!Array.isArray(files)) return cors(200, { message: 'No items', updated: [] });

    const updated = [];
    let searchCount = 0;

    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;

      const fileRes = await ghFetch(`contents/content/items/${file.name}?ref=${BRANCH}`);
      const fileData = await fileRes.json();
      const item = JSON.parse(Buffer.from(fileData.content, 'base64').toString());

      // Skip items that already have a retail price
      if (item.retailPrice && item.retailPrice > 0) continue;

      // Check daily limit
      if (searchCount >= DAILY_LIMIT) {
        console.log('Daily search limit reached');
        break;
      }

      console.log(`Looking up price for: ${item.title}`);
      searchCount++;

      const result = await searchPrice(item.title);
      if (result) {
        item.retailPrice = result.retailPrice;
        item.retailSource = result.retailSource;

        await putFile(
          `content/items/${file.name}`,
          JSON.stringify(item, null, 2),
          `Auto price: ${item.title} — $${result.retailPrice} ${result.retailSource}`,
          fileData.sha
        );

        updated.push({
          title: item.title,
          retailPrice: result.retailPrice,
          retailSource: result.retailSource,
        });

        console.log(`Updated ${item.title}: $${result.retailPrice} ${result.retailSource}`);
      } else {
        console.log(`No price found for: ${item.title}`);
      }
    }

    return cors(200, {
      message: `Checked ${searchCount} items, updated ${updated.length}`,
      searchesUsed: searchCount,
      updated,
    });
  } catch (err) {
    console.error(err);
    return cors(500, { error: err.message });
  }
};
