const { obtenerFixture } = require('./src/scrapers/fixture');

async function empujarAWix() {
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/importarFixture";

    try {
        console.log("🚀 Paso 1: Extrayendo y procesando datos frescos del SIFECH...");
        
        // El scraper ya hace todo el trabajo de limpieza (ETL) internamente
        const partidos = await obtenerFixture();
        
        console.log(`\n📦 Paso 2: Se extrajeron ${partidos.length} partidos limpios y listos para subir.`);
        console.log("📤 Paso 3: Preparando el paquete y enviando a Wix...");

        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Mandamos los partidos directamente
            body: JSON.stringify({ data: partidos }) 
        });

        const result = await response.json();

        if (response.ok) {
            console.log("\n✅ ¡ÉXITO TOTAL! Wix recibió los datos y respondió:");
            console.log(result);
        } else {
            console.error("\n❌ Wix rechazó el paquete. Razón:", result);
        }

    } catch (error) {
        console.error("\n❌ Error en el proceso de subida:", error.message);
    }
}

empujarAWix();