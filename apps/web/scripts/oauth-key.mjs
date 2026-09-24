// Prints a new ES256 private key (JWK) for the confidential OAuth client.
// Store it as a secret (from apps/web):  node scripts/oauth-key.mjs | pnpm exec wrangler secret put OAUTH_PRIVATE_KEY
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
delete jwk.ext;
const kid = `spool-${new Date().toISOString().slice(0, 10)}`;
process.stdout.write(JSON.stringify({ ...jwk, key_ops: ['sign'], alg: 'ES256', kid }));
