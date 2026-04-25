const express = require("express");
const { obtenerFixture } = require("./src/scrapers/fixture");

const app = express();
const PORT = 3000;

app.get("/api/fixture", async (req, res) => {
  try {
    console.log("🟢 Petición recibida en /api/fixture");

    const datosPartidos = await obtenerFixture();

    res.json({
      success: true,
      total: datosPartidos.length,
      data: datosPartidos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error extrayendo datos del SIFECH",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor API levantado en http://localhost:${PORT}`);
  console.log(`👉 Probá entrando a: http://localhost:${PORT}/api/fixture`);
});
