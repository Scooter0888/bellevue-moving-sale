const REPO = 'Scooter0888/bellevue-moving-sale';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

function getHeaders() {
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function checkAuth(event) {
  const pw = event.headers['x-admin-password'];
  return pw === process.env.ADMIN_PASSWORD;
}

// Convert stored /images/... paths to raw GitHub URLs so images always load
// regardless of whether the Netlify static deploy is current
function toRawUrl(path) {
  if (!path) return path;
  if (path.startsWith('http')) return path;
  return `${RAW_BASE}${path}`;
}

// GitHub API helpers
async function ghFetch(path, options = {}) {
  const url = `https://api.github.com/repos/${REPO}/${path}`;
  const res = await fetch(url, { headers: getHeaders(), ...options });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
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
  const res = await ghFetch(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.json();
}

async function deleteFile(path, sha, message) {
  const res = await ghFetch(`contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  return res.json();
}

// List all items — fetches each item file in parallel for speed
async function listItems() {
  const res = await ghFetch(`contents/content/items?ref=${BRANCH}`);
  if (res.status === 404) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];

  const jsonFiles = files.filter(f => f.name.endsWith('.json'));

  const results = await Promise.all(jsonFiles.map(async (file) => {
    try {
      const fileRes = await ghFetch(`contents/content/items/${file.name}?ref=${BRANCH}`);
      const fileData = await fileRes.json();
      const content = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
      // Translate image paths to raw GitHub URLs so they load without a redeploy
      if (content.images) {
        content.images = content.images.map(toRawUrl);
      }
      content._sha = fileData.sha;
      content._filename = file.name;
      return content;
    } catch {
      return null;
    }
  }));

  return results.filter(Boolean);
}

// Upload image — returns raw GitHub URL so it's immediately accessible
async function uploadImage(filename, base64Data) {
  const path = `images/items/${filename}`;
  const existing = await getFile(path);
  const body = {
    message: `Upload image: ${filename}`,
    content: base64Data,
    branch: BRANCH,
  };
  if (existing) body.sha = existing.sha;
  await ghFetch(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return `${RAW_BASE}/images/items/${filename}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return cors(200, {});
  }

  const path = event.path.replace('/.netlify/functions/api', '').replace(/^\//, '');
  const method = event.httpMethod;

  // PUBLIC: GET items — no auth required, powers the public storefront
  if (path === 'items' && method === 'GET') {
    try {
      const items = await listItems();
      return cors(200, items);
    } catch (err) {
      return cors(500, { error: err.message });
    }
  }

  // Login check
  if (path === 'login' && method === 'POST') {
    const { password } = JSON.parse(event.body || '{}');
    if (password === process.env.ADMIN_PASSWORD) {
      return cors(200, { success: true });
    }
    return cors(401, { error: 'Wrong password' });
  }

  // All other routes need auth
  if (!checkAuth(event)) {
    return cors(401, { error: 'Unauthorized' });
  }

  try {
    // POST item (create/update)
    if (path === 'items' && method === 'POST') {
      const item = JSON.parse(event.body);
      const slug = item.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      item.slug = slug;

      const filename = `${slug}.json`;
      const filePath = `content/items/${filename}`;
      const existing = await getFile(filePath);
      const sha = existing ? existing.sha : undefined;

      const saveItem = { ...item };
      delete saveItem._sha;
      delete saveItem._filename;

      await putFile(filePath, JSON.stringify(saveItem, null, 2), `${existing ? 'Update' : 'Add'} item: ${item.title}`, sha);
      return cors(200, { success: true, slug });
    }

    // DELETE item
    if (path.startsWith('items/') && method === 'DELETE') {
      const slug = path.replace('items/', '');
      const filePath = `content/items/${slug}.json`;
      const existing = await getFile(filePath);
      if (!existing) return cors(404, { error: 'Item not found' });
      await deleteFile(filePath, existing.sha, `Delete item: ${slug}`);
      return cors(200, { success: true });
    }

    // POST upload image
    if (path === 'upload' && method === 'POST') {
      const { filename, data } = JSON.parse(event.body);
      const url = await uploadImage(filename, data);
      return cors(200, { success: true, url });
    }

    return cors(404, { error: 'Not found' });
  } catch (err) {
    return cors(500, { error: err.message });
  }
};
