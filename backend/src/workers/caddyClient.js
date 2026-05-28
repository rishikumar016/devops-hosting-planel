const axios = require('axios');

function getClient() {
  return axios.create({
    baseURL: process.env.CADDY_ADMIN_URL,
    timeout: 15000,
    validateStatus: () => true,
  });
}

function routeId(domain) {
  return `client-${String(domain).replace(/\./g, '-')}`;
}

function buildRoute({ domain, upstream }) {
  return {
    '@id': routeId(domain),
    match: [{ host: [domain] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: upstream }],
      },
    ],
    terminal: true,
  };
}

async function addRoute({ domain, upstream }) {
  if (!process.env.CADDY_ADMIN_URL) {
    throw new Error('CADDY_ADMIN_URL not set');
  }
  const http = getClient();
  const route = buildRoute({ domain, upstream });
  const id = routeId(domain);

  const patch = await http.patch(`/id/${encodeURIComponent(id)}`, route, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (patch.status >= 200 && patch.status < 300) {
    return { mode: 'patch', id, status: patch.status };
  }

  if (patch.status === 404 || patch.status >= 500) {
    const post = await http.post('/config/apps/http/servers/srv0/routes', route, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (post.status >= 200 && post.status < 300) {
      return { mode: 'append', id, status: post.status };
    }
    throw new Error(`Caddy addRoute fallback failed: ${post.status} ${JSON.stringify(post.data)}`);
  }
  throw new Error(`Caddy addRoute failed: ${patch.status} ${JSON.stringify(patch.data)}`);
}

async function removeRoute({ domain }) {
  if (!process.env.CADDY_ADMIN_URL) {
    throw new Error('CADDY_ADMIN_URL not set');
  }
  const http = getClient();
  const id = routeId(domain);
  const res = await http.delete(`/id/${encodeURIComponent(id)}`);
  if (res.status === 404) return false;
  if (res.status >= 200 && res.status < 300) return true;
  throw new Error(`Caddy removeRoute failed: ${res.status} ${JSON.stringify(res.data)}`);
}

module.exports = { addRoute, removeRoute, buildRoute, routeId };
