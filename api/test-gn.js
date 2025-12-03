export default async function handler(req, res) {
  try {
    const { GN_API_BASE, GN_ID, GN_USER, GN_PASS } = process.env;

    if (!GN_API_BASE || !GN_ID || !GN_USER || !GN_PASS) {
      return res.status(400).json({
        ok: false,
        error: "Faltan variables de entorno de Grupo Núcleo"
      });
    }

    // Ejemplo: probar autenticación o endpoint simple
    const url = `${GN_API_BASE}/API_V1/CreateOrder`; // o un endpoint de test si existe
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ID: GN_ID,
        USER: GN_USER,
        PASS: GN_PASS,
        test: true
      }),
    });

    const data = await response.text();

    return res.status(200).json({
      ok: true,
      message: "Conexión con Grupo Núcleo probada correctamente 🚀",
      response: data,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
