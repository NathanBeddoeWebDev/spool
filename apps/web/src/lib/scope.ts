import { OAUTH_SCOPE } from '@spool/core';

export { OAUTH_SCOPE };

export function clientMetadata(opts: {
  clientId: string;
  clientName: string;
  clientUri: string;
  redirectUris: string[];
  /** Makes this a confidential client that signs its token requests with these keys. */
  jwksUri?: string;
}) {
  return {
    client_id: opts.clientId,
    client_name: opts.clientName,
    client_uri: opts.clientUri,
    logo_uri: `${opts.clientUri}/favicon.svg`,
    redirect_uris: opts.redirectUris,
    scope: OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    dpop_bound_access_tokens: true,
    ...(opts.jwksUri
      ? {
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_signing_alg: 'ES256',
          jwks_uri: opts.jwksUri,
        }
      : { token_endpoint_auth_method: 'none' }),
  };
}
