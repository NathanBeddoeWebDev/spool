import { OAUTH_SCOPE } from '@spool/core';

export { OAUTH_SCOPE };

export function clientMetadata(opts: {
  clientId: string;
  clientName: string;
  clientUri: string;
  redirectUris: string[];
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
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  };
}
