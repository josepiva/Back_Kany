import express from "express";
import crypto from "crypto";
import getRawBody from "raw-body";

// ---------------------- CONFIG ----------------------
const SHOP = process.env.SHOPIFY_STORE_URL;               // ej: a9efmv-rm.myshopify.com
const SHOP_TOKEN = process.env.SHOPIFY_TOKEN;
const LOCATION_ID = Number(process.env.SHOPIFY_LOCATION_ID);

const GN = {
  base: process.env.GN_API_BASE || "https://api.gruponucleosa.com",
  id: Number(process.env.GN_ID),
  user: process.env.GN_USER,
  pass: process.env.GN_PASS,
  token: null,
  exp: 0
};

const GN_ORDER_CREATE_PATH = process.env.GN_ORDER_CREATE_PATH || "/API_V1/CreateOrder";
const USD_ARS_RATE = Number(process.env.USD_ARS_RATE || 0); // 0 = no convierte
const GN_USD_RATE_URL = process.env.GN_USD_RATE_URL || "";  // si lo tenés

// ----------------------------------------------------

const app = express();

// Usamos JSON normal para endpoints "propios"
app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks/")) return next(); // el webhook necesita raw body
  express.json({ limit: "2mb" })(req, res, next);
});

// ===== Utilidades =====
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Shopify GraphQL helper
async function shopifyGraphQL(query, variables = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOP_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await r.json();
  if (!r.ok || data.errors) {
    throw new Error(`Shopify GraphQL error: ${r.status} ${JSON.stringify(data)}`);
  }
  return data.data;
}

// Obtener variant e inventoryItem por SKU (rápido con GraphQL)
async function findVariantBySKU(sku) {
  const q = `
    query($q:String!) {
      productVariants(first: 1, query: $q) {
        nodes {
          id
          sku
          inventoryItem { id }
        }
      }
    }`;
  const data = await shopifyGraphQL(q, { q: `sku:${sku}` });
  const node = data.productVariants?.nodes?.[0];
  if (!node) return null;

  // ids vienen como GIDs, extraemos los números
  const variantIdNum = Number(node.id.split("/").pop());
  const inventoryItemIdNum = Number(node.inventoryItem.id.split("/").pop());
  return { variant_id: variantIdNum, inventory_item_id: inventoryItemIdNum };
}

// Setear stock (REST, simple)
async function shopifySetStock(inventory_item_id, available) {
  const url = `https://${SHOP}/admin/api/2025-01/inventory_levels/set.json`;
  const body = {
    location_id: LOCATION_ID,
    inventory_item_id,
    available: Number(available)
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOP_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Shopify set stock ${r.status} ${await r.text()}`);
}

// Actualizar precio de una variante (REST)
async function shopifySetPrice(variant_id, price) {
  const url = `https://${SHOP}/admin/api/2025-01/variants/${variant_id}.json`;
  const body = { variant: { id: variant_id, price: Number(price).toFixed(2) } };
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": SHOP_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Shopify set price ${r.status} ${await r.text()}`);
}

// Login a Grupo Núcleo (token dura ~15 min → cacheamos 14)
async function gnGetToken() {
  const now = Date.now();
  if (GN.token && GN.exp > now) return GN.token;

  const r = await fetch(`${GN.base}/Authentication/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: GN.id, username: GN.user, password: GN.pass })
  });

  if (!r.ok) throw new Error(`GN login ${r.status} ${await r.text()}`);

  const txt = (await r.text()).trim();
  try {
    const j = JSON.parse(txt);
    GN.token = j.token || j.accessToken || j.Token || txt;
  } catch {
    GN.token = txt; // algunos ambientes devuelven el token "puro"
  }
  GN.exp = now + 14 * 60 * 1000;
  return GN.token;
}

// Obtener catálogo con stock de GN
async function gnGetCatalog() {
  const token = await gnGetToken();
  const r = await fetch(`${GN.base}/API_V1/GetCatalog`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" }
  });
  if (!r.ok) throw new Error(`GN catalog ${r.status} ${await r.text()}`);
  return r.json();
}

// Obtener cotización (opcional)
async function getUsdArsRate() {
  if (USD_ARS_RATE > 0) return USD_ARS_RATE;
  if (!GN_USD_RATE_URL) return 0; // sin conversión
  try {
    const r = await fetch(GN_USD_RATE_URL);
    if (!r.ok) return 0;
    const data = await r.json();
    // Ajustá según la respuesta real del endpoint:
    return Number(data?.rate || data?.valor || 0);
  } catch {
    return 0;
  }
}

// ================== ENDPOINTS ==================

// health
app.get("/api/health", (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// login GN (debug)
app.get("/api/gn/login", async (_, res) => {
  try {
    const t = await gnGetToken();
    res.json({ ok: true, token_preview: t.slice(0, 14) + "..." });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Sincronizar stock + precio desde GN → Shopify
app.get("/api/sync/stock", async (_, res) => {
  try {
    const catalog = await gnGetCatalog();
    const usdRate = await getUsdArsRate();
    let updated = 0, missing = [], priced = 0;

    for (const item of catalog) {
      const sku = String(item.codigo || "").trim();
      if (!sku) continue;

      const ids = await findVariantBySKU(sku);
      if (!ids) { missing.push(sku); continue; }

      // STOCK: elegí depósito (ej. CABA)
      const stock = Number(item.stock_caba ?? item.stock_mdp ?? 0);
      await shopifySetStock(ids.inventory_item_id, stock);

      // PRECIO: precioNeto_USD + IVA (si viene)
      const baseUSD = Number(item.precioNeto_USD ?? 0);
      const ivaPct = Number(item.impuestos?.[0]?.imp_porcentaje ?? 0);
      let price = baseUSD * (1 + ivaPct / 100);

      // Si querés ARS, multiplicá por cotización si existe
      if (usdRate > 0) price = price * usdRate;

      await shopifySetPrice(ids.variant_id, price);
      updated++;
      priced++;

      // rate limit friendly
      await sleep(120); // 8-9 req/seg promedio
    }

    res.json({ ok: true, updated, priced, missing });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ====== Verificación HMAC para Webhooks de Shopify ======
async function verifyShopifyWebhook(req, res, next) {
  try {
    const raw = await getRawBody(req);
    const hmac = req.get("X-Shopify-Hmac-Sha256") || "";
    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(raw, "utf8")
      .digest("base64");

    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
      return res.status(401).send("Invalid HMAC");
    }
    // Guardamos raw para parsear manual luego
    req.rawBody = raw.toString("utf8");
    next();
  } catch (e) {
    res.status(400).send("Bad request");
  }
}

// Webhook: orders/create → enviar a GN (ajustar payload según manual)
app.post("/api/webhooks/order-created", verifyShopifyWebhook, async (req, res) => {
  try {
    const order = JSON.parse(req.rawBody);
    const token = await gnGetToken();

    const payload = {
      shop_order_id: order.id,
      order_name: order.name,
      currency: order.currency,
      total_price: order.total_price,
      customer: {
        email: order.email,
        first_name: order?.customer?.first_name,
        last_name: order?.customer?.last_name,
        phone: order?.customer?.phone
      },
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      items: (order.line_items || []).map(li => ({
        sku: li.sku,
        quantity: li.quantity,
        price: li.price
      }))
    };

    const r = await fetch(`${GN.base}${GN_ORDER_CREATE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) throw new Error(`GN order ${r.status} ${await r.text()}`);
    res.status(200).send("OK");
  } catch (e) {
    console.error("order-created webhook error:", e);
    res.status(500).send("ERR");
  }
});

export default app;
