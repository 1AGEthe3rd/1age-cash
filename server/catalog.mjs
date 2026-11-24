/**
 * Closed-loop, first-party Cash catalog.
 * No products are enabled unless an administrator deploys an approved list.
 * A client can never choose the price or designate a payee.
 */
const SKU = /^[a-z][a-z0-9_-]{2,63}$/;
const APPS = new Set(['world', 'games', 'quest', 'page', 'space', 'design', 'store']);
const MAX_PRICE_MINOR = 25000;

export function parseCatalog(source) {
  if (!source || source.trim() === '') return Object.freeze([]);
  let entries;
  try { entries = JSON.parse(source); } catch { throw new TypeError('Invalid CASH_CATALOG_JSON'); }
  if (!Array.isArray(entries) || entries.length > 100) {
    throw new TypeError('Cash catalog must be an array with at most 100 items');
  }
  const used = new Set();
  const products = entries.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        !SKU.test(row.sku || '') || used.has(row.sku) ||
        typeof row.name !== 'string' || row.name.trim().length < 3 ||
        row.name.trim().length > 100 ||
        !Number.isSafeInteger(row.price_minor) || row.price_minor < 1 ||
        row.price_minor > MAX_PRICE_MINOR ||
        !APPS.has(row.app) || row.first_party !== true ||
        row.non_transferable !== true) {
      throw new TypeError('Catalog has an invalid or duplicate first-party Cash product');
    }
    used.add(row.sku);
    return Object.freeze({
      sku: row.sku, name: row.name.trim(), app: row.app,
      price_minor: row.price_minor,
      first_party: true, non_transferable: true,
      one_per_account: true
    });
  });
  return Object.freeze(products);
}

export function findProduct(catalog, sku) {
  return typeof sku === 'string' ? catalog.find(item => item.sku === sku) : undefined;
}
