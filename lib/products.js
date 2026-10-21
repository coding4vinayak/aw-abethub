// Where each Abetworks product actually lives.
//
// The hub's upsells used to point at `${SUITE_URL}/products/<slug>/` — paths
// the marketing site's repository has never had. It has no `/products/`
// directory at all: its pages are `services/*.html`, a blog page and a company
// page. So every one of those links was a 404 waiting to happen, on the pages
// where a buyer is most likely to click: the money path of the funnel.
//
// Each product's home is the host that actually serves it. The list is kept
// here, in one place, because a link that is right in one file and wrong in
// another is how this happened in the first place.
//
// The domains are the ones the pricing sheet states (aw-deploy
// `sales/pricing-sheet.md`), and the fleet blueprint declares a service for
// each — so every host here is one we deploy, and after deploy day it answers.
//
// NuCRM is the exception, and it is an honest one: it is the company's
// flagship CRM, but it lives in another repository and has no public home this
// app can verify. Rather than link a page that would 404, it links the
// company's contact form — which is how a buyer actually starts on a product
// with no public page.
import { SUITE_URL } from './site.js';

/** The host that serves each product. Keys are the suite's slugs. */
export const PRODUCT_HOMES = {
  abetanalytics: 'https://analytics.abetworks.in/',
  leadworks: 'https://leadworks.abetworks.in/',
  leadgenius: 'https://leadgenius.abetworks.in/',
  abetagent: 'https://abetagent.abetworks.in/',
  abetconnect: 'https://connect.abetworks.in/',
  abetflow: 'https://flow.abetworks.in/',
  abetapi: 'https://api.abetworks.in/',
};

/**
 * NuCRM: the flagship CRM, with no public page of its own to link to.
 *
 * The company's contact form is a working form (it is what the contact page
 * embeds), so a visitor who clicks lands somewhere that reaches a human.
 */
export const NUCRM_CONTACT = `${SUITE_URL}/services/contact.html`;

/** The home of a suite product, by slug. */
export function productHome(slug) {
  return PRODUCT_HOMES[slug] ?? null;
}
