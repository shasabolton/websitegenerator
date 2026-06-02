/**
 * Optional: copy to `githubAuth.config.js` and set clientId here instead of the hub UI.
 * The site generator hub also lets you paste your Client ID in the browser (saved in localStorage).
 * Create an app at https://github.com/settings/developers (OAuth Apps, not GitHub Apps).
 * Authorization callback URL must match where you open the site generator, e.g.:
 *   http://127.0.0.1:5500/tools/siteGenerator/index.html
 * The Client ID is public; do not put the client secret in front-end code (PKCE is used instead).
 */
window.githubAuthConfig = {
  // Optional: paste a personal access token here (avoid committing real tokens to git).
  accessToken: "",
  // Legacy OAuth (not used by default UI):
  clientId: "",
};
