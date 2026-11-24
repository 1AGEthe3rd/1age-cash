/**
 * Serve the approved 1AGE Cash static experience alongside /api/cash/*.
 * This allows one HTTPS origin for account tokens, Stripe webhooks and the
 * original embedded World, without exposing the server's source/configuration.
 *
 * The existing GitHub Pages site remains unchanged until an authorized domain
 * cutover. NEVER serve the repository root with unfiltered express.static().
 */
import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const routes = new Set([
  '/index.html', '/application.html',
  '/cash-portal.css', '/cash-portal.mjs', '/cash-identity.mjs',
  '/cash.js', '/app-home.js',
  '/virtual-entry.css', '/virtual-entry.mjs',
  '/interface-motion.css', '/search-toggle.js',
  '/robots.txt'
]);
const directories = ['assets', 'apps', 'experiences/shared'];

export function attachCashSite(app) {
  app.get('/', (req, res) => res.sendFile(join(siteRoot, 'index.html')));
  app.get('/identity-sdk.mjs', (req, res) => res.sendFile(join(siteRoot, 'server/generated/keycloak.mjs')));
  for (const route of routes) {
    app.get(route, (req, res) => res.sendFile(join(siteRoot, route.slice(1))));
  }
  for (const dir of directories) {
    app.use('/' + dir, express.static(join(siteRoot, dir), {
      dotfiles: 'deny', fallthrough: false, index: false,
      setHeaders: res => res.set('X-Content-Type-Options', 'nosniff')
    }));
  }
  // Do not use a catch-all that could accidentally expose server/, migrations,
  // GitHub metadata, test credentials, source history or configuration files.
}
