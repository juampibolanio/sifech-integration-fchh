/**
 * Orquestador de Tarjetas.
 * Extrae la información desde el scraper y la sincroniza con la base de datos de Wix.
 */

const { obtenerTarjetasDefinitivo } = require('./src/scrapers/tarjetas');

async function sincronizarTarjetas() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirTarjetas";

    try {
        console.log("⚙️  [Orquestador] Iniciando proceso de sincronización de Tarjetas...");
        
        const tarjetas = await obtenerTarjetasDefinitivo();
        
        if (!tarjetas || tarjetas.length === 0) {
            console.log("⚠️ [Orquestador] El scraper no devolvió registros. Abortando subida.");
            return;
        }

        console.log(`\n📦 [Orquestador] Preparando paquete con ${tarjetas.length} registros en total.`);
        console.log("📤 [Orquestador] Enviando datos a Wix...");

        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: tarjetas })
        });

        const textResponse = await response.text();

        try {
            const result = JSON.parse(textResponse);
            if (response.ok) {
                console.log("\n✅ [Orquestador] ¡SINCRONIZACIÓN EXITOSA!");
                console.log("📝 Respuesta de Wix:", result);
            } else {
                console.error("\n❌ [Orquestador] Wix rechazó la petición.");
                console.error("Razón:", result);
            }
        } catch (error) {
            console.error("\n❌ [Orquestador] Error al procesar la respuesta de Wix (No es JSON válido).");
            console.error("Respuesta cruda:", textResponse);
        }

    } catch (error) {
        console.error("\n❌ [Orquestador] El proceso falló:", error.message);
    }
}

module.exports = { sincronizarTarjetas }

if (require.main === module) {
    sincronizarTarjetas();
}