// api/shopify-test-connection.js
export default async function handler(req, res) {
  const STORE_URL = process.env.SHOPIFY_STORE_URL;
  const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN; // <- admite ambos

  if (!STORE_URL || !TOKEN) {
    return res.status(400).json({
      ok: false,
      error: 'Faltan variables de entorno (SHOPIFY_STORE_URL o SHOPIFY_TOKEN)',
    });
  }

  try {
    const r = await fetch(`https://${STORE_URL}/admin/api/2024-07/shop.json`, {
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    });
    const data = await r.json();
    return res.status(200).json({ ok: true, shop: data.shop?.name || data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
