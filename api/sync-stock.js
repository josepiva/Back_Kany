export default async function handler(req, res) {
  try {
    console.log("🚀 Iniciando sincronización GN → Shopify");

    // 1️⃣ Obtener token JWT
    const authRes = await fetch("https://api.gruponucleosa.com/API_V1/Auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID: process.env.GN_ID,
        USER: process.env.GN_USER,
        PASS: process.env.GN_PASS
      })
    });

    const auth = await authRes.json();

    if (!auth.token) {
      console.log("❌ Falló autenticación:", auth);
      return res.status(500).json({ ok: false, error: "No se obtuvo token de GN" });
    }

    console.log("🔑 Token recibido de GN");

    // 2️⃣ Obtener catálogo usando el Bearer recién generado
    const catalogRes = await fetch(
      "https://api.gruponucleosa.com/API_V1/GetCatalog",
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${auth.token}`,
          "Accept": "*/*"
        }
      }
    );

    const catalogText = await catalogRes.text();
    console.log("📥 Respuesta cruda de GN (primeros 200 chars):", catalogText.slice(0, 200));

    const catalog = JSON.parse(catalogText);

    return res.status(200).json({
      ok: true,
      items: catalog.length,
      firstItem: catalog[0]
    });

  } catch (e) {
    console.log("❌ Error en sync:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}






















// export default async function handler(req, res) {
//   try {
//     console.log("🚀 Iniciando sincronización de stock GN → Shopify");

//     // 1. Obtener catálogo de GN
//     const url = `${process.env.GN_STOCK_URL}?ID=${process.env.GN_ID}&USER=${process.env.GN_USER}&PASS=${process.env.GN_PASS}`;
//     const gnRes = await fetch(url);
//     const gnData = await gnRes.json();

//     console.log(`📦 Productos recibidos desde GN: ${gnData.length}`);

//     // 2. Procesar productos
//     for (const item of gnData) {
//       const sku = item.codigo;
//       const stock = (item.stock_mdp || 0) + (item.stock_caba || 0);

//       console.log(`🔄 SKU ${sku} => Stock GN: ${stock}`);

//       // 3. Buscar variante en Shopify por SKU
//       const shopifyRes = await fetch(
//         `${process.env.SHOPIFY_TOKEN}/products.json?sku=${sku}`,
//         {
//           headers: {
//             "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       const shopifyData = await shopifyRes.json();

//       if (!shopifyData.products || shopifyData.products.length === 0) {
//         console.log(`⚠ SKU ${sku} no existe en Shopify`);
//         continue; // saltamos
//       }

//       // 4. Encontrar variante por SKU
//       const product = shopifyData.products[0];
//       const variant = product.variants.find(v => v.sku == sku);

//       if (!variant) {
//         console.log(`⚠ Producto encontrado pero sin variante con SKU ${sku}`);
//         continue;
//       }

//       // 5. Actualizar stock en Shopify
//       console.log(`📝 Actualizando stock Shopify → SKU ${sku}: ${stock}`);

//       await fetch(
//         `${process.env.SHOPIFY_TOKEN}/inventory_levels/set.json`,
//         {
//           method: "POST",
//           headers: {
//             "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             location_id: 1, // si usás Shopify default
//             inventory_item_id: variant.inventory_item_id,
//             available: stock
//           }),
//         }
//       );
//     }

//     return res.status(200).json({
//       ok: true,
//       message: "Sincronización completada 🚀",
//     });

//   } catch (error) {
//     console.error("❌ Error en la sincronización:", error);
//     return res.status(500).json({ ok: false, error: error.message });
//   }
// }
