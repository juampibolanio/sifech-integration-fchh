/**
 * Orquestador de Fixture.
 * Extrae la información desde el scraper y la sincroniza con la base de datos de Wix.
 */

const { obtenerFixture } = require('./src/scrapers/fixture');

async function sincronizarFixture() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirFixture";

    try {
        console.log("⚙️  [Orquestador] Iniciando proceso de sincronización de Fixture...");
        
        // 1. Ejecutar la extracción (ETL)
        const partidos = await obtenerFixture();
        
        if (!partidos || partidos.length === 0) {
            console.log("⚠️ [Orquestador] El scraper no devolvió partidos. Abortando subida.");
            return;
        }

        console.log(`\n📦 [Orquestador] Preparando paquete con ${partidos.length} partidos limpios.`);
        console.log("📤 [Orquestador] Enviando datos a Wix...");

        // 2. Enviar datos vía POST
        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: partidos }) 
        });

        // 3. Validación robusta de la respuesta del servidor
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

// Ejecutar
sincronizarFixture();