/**
 * Orquestador de Goleadores.
 * Extrae la información desde el scraper y la sincroniza con la base de datos de Wix.
 */

const { obtenerGoleadoresDefinitivo } = require('./src/scrapers/goleadores');

async function sincronizarGoleadores() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirGoleadores";

    try {
        console.log("⚙️  [Orquestador] Iniciando proceso de sincronización de Goleadores...");
        
        const goleadores = await obtenerGoleadoresDefinitivo();
        
        if (!goleadores || goleadores.length === 0) {
            console.log("⚠️ [Orquestador] El scraper no devolvió datos. Abortando subida.");
            return;
        }

        console.log(`\n📦 [Orquestador] Preparando paquete con ${goleadores.length} registros.`);
        console.log("📤 [Orquestador] Solicitando actualización a Wix...");

        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: goleadores })
        });

        const textResponse = await response.text();

        try {
            const result = JSON.parse(textResponse);
            if (response.ok) {
                console.log("\n✅ [Orquestador] ¡SINCRONIZACIÓN EXITOSA!");
                console.log("📝 Respuesta del Servidor Wix:", result);
            } else {
                console.error("\n❌ [Orquestador] Wix rechazó la petición.");
                console.error("Razón:", result);
            }
        } catch (jsonError) {
            console.error("\n❌ [Orquestador] Error al leer la respuesta JSON de Wix.");
            console.error("Respuesta cruda recibida:", textResponse);
        }

    } catch (error) {
        console.error("\n❌ [Orquestador] Proceso interrumpido por un error:", error.message);
    }
}

module.exports = { sincronizarGoleadores }

if (require.main === module) {
    sincronizarGoleadores();
}