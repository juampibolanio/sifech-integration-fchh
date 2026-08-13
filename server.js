const express = require("express");

const { sincronizarFixture } = require("./subirFixture");
const { sincronizarResultados } = require("./subirResultados");
const { sincronizarPosiciones } = require("./subirPosiciones");
const { sincronizarGoleadores } = require("./subirGoleadores");
const { sincronizarTarjetas } = require("./subirTarjetas");

let sincronizacionEnCurso = false;

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.status(200).send("Servidor de SIFECH despierto y operativo");
});

const API_KEY_SECRETA = process.env.API_KEY;

function verificarAPIKey(req, res, next) {
    const llaveRecibida = req.query.key || req.headers['x-api-key'];
    
    if (llaveRecibida === API_KEY_SECRETA) {
        next();
    } else {
        console.warn("⚠️ [Servidor] Intento de acceso denegado (Llave incorrecta).");
        res.status(401).json({ success: false, message: "Acceso no autorizado." });
    }
}

app.use('/api/sync', verificarAPIKey);

// ==========================================
// RUTAS DE SINCRONIZACIÓN INDIVIDUAL
// ==========================================

app.get("/api/sync/fixture", async (req, res) => {
    console.log("🟢 [Servidor] Petición recibida: Sincronizar Fixture");
    try {
        await sincronizarFixture();
        res.json({ success: true, message: "Sincronización de Fixture completada." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/sync/resultados", async (req, res) => {
    console.log("🟢 [Servidor] Petición recibida: Sincronizar Resultados");
    try {
        await sincronizarResultados();
        res.json({ success: true, message: "Sincronización de Resultados completada." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/sync/posiciones", async (req, res) => {
    console.log("🟢 [Servidor] Petición recibida: Sincronizar Posiciones");
    try {
        await sincronizarPosiciones();
        res.json({ success: true, message: "Sincronización de Posiciones completada." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/sync/goleadores", async (req, res) => {
    console.log("🟢 [Servidor] Petición recibida: Sincronizar Goleadores");
    try {
        await sincronizarGoleadores();
        res.json({ success: true, message: "Sincronización de Goleadores completada." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/sync/tarjetas", async (req, res) => {
    console.log("🟢 [Servidor] Petición recibida: Sincronizar Tarjetas");
    try {
        await sincronizarTarjetas();
        res.json({ success: true, message: "Sincronización de Tarjetas completada." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// RUTA DE SINCRONIZACIÓN GLOBAL 
// ==========================================

app.get("/api/sync/todo", async (req, res) => {
    if (sincronizacionEnCurso) {
        console.warn("⚠️ [Servidor] Intento de sincronización rechazado. Ya hay una en curso.");
        return res.status(429).json({ 
            success: false, 
            message: "Ya hay una sincronización ejecutándose. Por favor, esperá a que termine." 
        });
    }

    sincronizacionEnCurso = true;
    console.log("☢️ [Servidor] Petición recibida: SINCRONIZACIÓN GLOBAL INICIADA");
    res.json({ success: true, message: "Sincronización global iniciada en segundo plano." });

    try {
        console.log("1/5 - Actualizando Fixture...");
        await sincronizarFixture();
        
        console.log("2/5 - Actualizando Resultados...");
        await sincronizarResultados();
        
        console.log("3/5 - Actualizando Posiciones...");
        await sincronizarPosiciones();
        
        console.log("4/5 - Actualizando Goleadores...");
        await sincronizarGoleadores();
        
        console.log("5/5 - Actualizando Tarjetas...");
        await sincronizarTarjetas();

        console.log("✅ [Servidor] Sincronización Global Completada al 100%");
    } catch (error) {
        console.error("💥 [Servidor] Error durante la sincronización global:", error.message);
    } finally {
        sincronizacionEnCurso = false;
        console.log("🔓 [Servidor] Candado liberado. Listo para nuevas peticiones.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor API levantado en http://localhost:${PORT}`);

});