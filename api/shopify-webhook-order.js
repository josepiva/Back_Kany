export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Método no permitido" });
    }

    const order = req.body;
    console.log("🟢 Pedido recibido desde Shopify:", order.id);

    // Crear parámetros para GN (form-data x-www-form-urlencoded)
    const params = new URLSearchParams();

    // Auth
    params.append("ID", process.env.GN_ID);
    params.append("USER", process.env.GN_USER);
    params.append("PASS", process.env.GN_PASS);

    // Datos del pedido
    params.append("order_id", order.id);
    params.append("cliente", order.customer?.email || "");
    params.append("total", order.total_price || "");

    // Items uno por uno
    order.line_items.forEach((item, i) => {
      const n = i + 1;
      params.append(`SKU${n}`, item.sku || item.variant_id || "");
      params.append(`CANT${n}`, item.quantity);
    });

    console.log("📦 Payload enviado a GN:");
    console.log(params.toString());

    // Enviar a GN
    const gnResponse = await fetch(process.env.GN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const responseText = await gnResponse.text();

    console.log("📨 Respuesta de GN:");
    console.log(responseText);

    return res.status(200).json({
      ok: true,
      message: "Pedido recibido y enviado a Grupo Núcleo",
      gnResponse: responseText,
    });

  } catch (error) {
    console.error("❌ Error en el webhook:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
