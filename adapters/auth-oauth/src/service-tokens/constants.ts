// The auth core routes a bearer by its first characters, so it needs a static-token prefix, though
// boxxy refuses a file with a static token. It must not start with, or be the start of, the `svca_`
// of each access token that the core issues to a service client.
export const serviceTokenPrefix = 'boxxy_svc_';
