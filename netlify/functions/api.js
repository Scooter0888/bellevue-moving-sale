const REPO = 'Scooter0888/bellevue-moving-sale';
const BRANCH = 'main';

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

// List all items
async function listItems() {
  const res = await ghFetch(`contents/content/items?ref=${BRANCH}`);
  if (res.status === 404) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];

  const items = [];
  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    const fileRes = await ghFetch(`contents/content/items/${file.name}?ref=${BRANCH}`);
    const fileData = await fileRes.json();
    try {
      const content = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
      content._sha = fileData.sha;
      content._filename = file.name;
      items.push(content);
    } catch {}
  }
  return items;
}

// Upload image (base64)
async function uploadImage(filename, base64Data) {
  const path = `images/items/${filename}`;
  const existing = await getFile(path);
  const body = {
    message: `Upload image: ${filename}`,
    content: base64Data,
    branch: BRANCH,
  };
  if (existing) body.sha = existing.sha;
  const res = await ghFetch(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.json();
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return cors(200, {});
  }

  const path = event.path.replace('/.netlify/functions/api', '').replace(/^\//, '');
  const method = event.httpMethod;

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
    // GET items
    if (path === 'items' && method === 'GET') {
      const items = await listItems();
      return cors(200, items);
    }

    // POST item (create/update)
    if (path === 'items' && method === 'POST') {
      const item = JSON.parse(event.body);
      const slug = item.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      item.slug = slug;

      const filename = `${slug}.json`;
      const filePath = `content/items/${filename}`;
      const existing = await getFile(filePath);
      const sha = existing ? existing.sha : undefined;

      // Remove internal fields before saving
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
      await uploadImage(filename, data);
      return cors(200, { success: true, url: `/images/items/${filename}` });
    }

    return cors(404, { error: 'Not found' });
  } catch (err) {
    return cors(500, { error: err.message });
  }
};
