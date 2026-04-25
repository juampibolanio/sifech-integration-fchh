const { obtenerResultados } = require('./src/scrapers/resultados');

async function empujarResultadosAWix() {
    // Apuntamos a la nueva función que creamos en Wix
    const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirResultados";

    try {
        console.log("🚀 Paso 1: Extrayendo resultados frescos del SIFECH...");
        const resultados = await obtenerResultados();
        
        console.log(`\n📦 Paso 2: Se extrajeron ${resultados.length} resultados listos para subir.`);
        console.log("📤 Paso 3: Preparando el paquete y enviando a Wix...");

        const response = await fetch(wixUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: resultados }) 
        });

        const result = await response.json();

        if (response.ok) {
            console.log("\n✅ ¡ÉXITO TOTAL! Wix recibió los resultados y respondió:");
            console.log(result);
        } else {
            console.error("\n❌ Wix rechazó el paquete. Razón:", result);
        }

    } catch (error) {
        console.error("\n❌ Error en el proceso de subida:", error.message);
    }
}

empujarResultadosAWix();