/**
 * Orquestador de Resultados.
 * Extrae la información desde el scraper y la sincroniza con la base de datos de Wix.
 */

const { obtenerResultados } = require('./src/scrapers/resultados');

async function sincronizarResultados() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirResultados";

    try {
        console.log("⚙️  [Orquestador] Iniciando proceso de sincronización de Resultados...");
        
        const resultados = await obtenerResultados();
        
        if (!resultados || resultados.length === 0) {
            console.log("⚠️ [Orquestador] El scraper no devolvió resultados. Abortando subida.");
            return;
        }

        console.log(`\n📦 [Orquestador] Preparando paquete con ${resultados.length} resultados listos.`);
        console.log("📤 [Orquestador] Enviando datos a Wix...");

        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: resultados }) 
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

module.exports = { sincronizarResultados }
if (require.main === module) {
    sincronizarResultados();
}