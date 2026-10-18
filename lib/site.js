// Canonical public URLs for links out of the hub.
//
// SUITE_URL points at the main Abetworks site (header CTA, footer, product
// upsells). It defaults to the canonical domain; set SUITE_URL at deploy time
// ONLY while the DNS switch is mid-flight (e.g. point it at
// https://abetworks-website.onrender.com in the Render dashboard).
export const SUITE_URL = (process.env.SUITE_URL || 'https://abetworks.in').replace(/\/+$/, '');