const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IMAGE_RE = /^[a-z0-9._\-\/]+(:[a-zA-Z0-9._-]+)?$/;

function validateDeployInput(body) {
  const errors = {};
  const data = {};

  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';
  if (clientName.length < 2) errors.clientName = 'clientName must be at least 2 characters';
  data.clientName = clientName;

  const domain = typeof body?.domain === 'string' ? body.domain.trim().toLowerCase() : '';
  if (!DOMAIN_RE.test(domain)) errors.domain = 'domain must be a valid DNS name (e.g. app.example.com)';
  data.domain = domain;

  const image = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!IMAGE_RE.test(image)) errors.image = 'image must look like repo[:tag] (lowercase, dots/slashes/dashes only)';
  data.image = image;

  return { ok: Object.keys(errors).length === 0, errors, data };
}

module.exports = { validateDeployInput, DOMAIN_RE, IMAGE_RE };
