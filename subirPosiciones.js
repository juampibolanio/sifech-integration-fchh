/**
 * Orquestador de Posiciones.
 * Solicita los datos limpios al scraper y los inyecta en la base de datos de Wix.
 */

const { obtenerPosicionesDefinitivo } = require('./src/scrapers/posiciones');

async function sincronizarPosiciones() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirPosiciones";

    try {
        console.log("⚙️  [Orquestador] Iniciando proceso de sincronización de Posiciones...");
        
        // 1. Ejecutar la extracción
        const posiciones = await obtenerPosicionesDefinitivo();
        
        if (!posiciones || posiciones.length === 0) {
            console.log("⚠️ [Orquestador] El scraper no devolvió equipos. Abortando subida.");
            return;
        }

        console.log(`\n📦 [Orquestador] Preparando paquete con ${posiciones.length} posiciones en total.`);
        console.log("📤 [Orquestador] Enviando datos a Wix...");

        // 2. Enviar datos vía POST a la API de Wix
        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: posiciones })
        });

        // 3. Validación de la respuesta del servidor
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
            console.error("Respuesta:", textResponse);
        }

    } catch (error) {
        console.error("\n❌ [Orquestador] El proceso falló:", error.message);
    }
}

module.exports = { sincronizarPosiciones }
// Ejecutar
if (require.main === module) {
    sincronizarPosiciones();
}