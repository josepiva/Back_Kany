import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
export default async function handler(req, res) {
  try {
    const { SHOPIFY_STORE_URL, SHOPIFY_TOKEN } = process.env;

    if (!SHOPIFY_STORE_URL || !SHOPIFY_TOKEN) {
      return res.status(400).json({
        ok: false,
        error: "Faltan variables de entorno (SHOPIFY_STORE_URL o SHOPIFY_TOKEN)"
      });
    }

    // Construir la URL de la API de Shopify
    const url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/shop.json`;

    // Hacer la solicitud con el token
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    });

    // Leer la respuesta
    const data = await response.json();

    // Si la respuesta no fue exitosa, devolver el error
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.errors || "Error al conectar con Shopify"
      });
    }

    // Devolver el nombre de la tienda si todo salió bien
    return res.status(200).json({
      ok: true,
      message: "Conexión con Shopify exitosa 🚀",
      shop: data.shop
    });

  } catch (error) {
    console.error("Error conectando con Shopify:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
