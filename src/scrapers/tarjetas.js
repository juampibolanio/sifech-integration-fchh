const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

/**
 * Formatea nombres de jugadores a Title Case (ej: "Garcia, María Eugenia")
 * Asegura un espacio después de la coma.
 */
function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    let nombre = nombreCompleto.replace(/,\s*/g, ', ');
    return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
        return match.toUpperCase();
    });
}

/**
 * Limpia caracteres mal codificados del sistema SIFECH.
 */
function limpiarTorneo(torneoCrudo) {
    if (!torneoCrudo) return "";
    return torneoCrudo.replace(/\?/g, 'ó').trim(); 
}

/**
 * Scraper principal de Tarjetas.
 * Extrae jugadores sancionados, interpreta categorías agrupadas y ordena por gravedad de tarjeta.
 * @returns {Promise<Array>} Array de objetos con las tarjetas formateadas.
 */
async function obtenerTarjetasDefinitivo() {
    console.log("🚀 [Scraper] Encendiendo Puppeteer para buscar Tarjetas...");

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    try {
        // 1. Navegación inicial
        console.log("🌐 [Scraper] Entrando a la página oficial de SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

        // 2. Cargar tabla de Tarjetas
        console.log("🖱️ [Scraper] Forzando la carga de la Tabla de Tarjetas...");
        const hizoClic = await page.evaluate(() => {
            const enlaceSecreto = document.querySelector('a[href*="grid_tabla_tarjetas"]');
            if (enlaceSecreto) {
                enlaceSecreto.click();
                return true;
            }
            return false;
        });

        if (!hizoClic) throw new Error("No encontré el enlace de tarjetas.");
        await new Promise((r) => setTimeout(r, 6000));

        // 3. Localizar Iframe
        let iframeTarjetas = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_tarjetas")) {
                iframeTarjetas = frame;
                break;
            }
        }

        if (!iframeTarjetas) throw new Error("No se encontró el Iframe de tarjetas.");

        // 4. Paginación (Intento de expandir a 500 filas)
        console.log("🔓 [Scraper] Interactuando con el menú desplegable 'Ver X líneas'...");
        const paginacionExitosa = await iframeTarjetas.evaluate(() => {
            let selectPag = document.querySelector('select[name="nmgp_quant_linhas"]');
            if (selectPag) {
                let opt = document.createElement('option');
                opt.value = "500";
                opt.innerHTML = "500";
                selectPag.appendChild(opt);
                selectPag.value = "500";
                selectPag.dispatchEvent(new Event('change'));
                return true;
            }
            return false;
        });

        if (paginacionExitosa) {
            console.log("⏳ [Scraper] Esperando 8 segundos a que la tabla se expanda a 500 filas...");
            await new Promise((r) => setTimeout(r, 8000));
            for (const frame of page.frames()) {
                if (frame.url().includes("grid_tabla_tarjetas")) { iframeTarjetas = frame; break; }
            }
        } else {
            console.log("⚠️ [Scraper] No se encontró la paginación (son pocos registros). Extrayendo lo visible...");
        }

        // 5. Extracción de datos
        console.log("📥 [Scraper] ¡Tabla localizada! Extrayendo datos...");
        const html = await iframeTarjetas.content();
        const $ = cheerio.load(html);

        const tarjetasCrudas = [];
        let currentCategoria = "General";

        $("tr").each((i, fila) => {
            
            // Extractor "Todoterreno" de Categorías
            if (!$(fila).hasClass("scGridFieldOdd") && !$(fila).hasClass("scGridFieldEven")) {
                let tdsFila = [];
                $(fila).find("td").each((j, celda) => {
                    let t = $(celda).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
                    if (t !== "") tdsFila.push(t);
                });

                let textoFilaUnido = tdsFila.join(" ");
                
                if (textoFilaUnido.match(/^Categor[ií]a/i)) {
                    currentCategoria = textoFilaUnido.replace(/^Categor[ií]a\s*:?\s*/i, "").trim();
                }
            }

            // Extracción de jugadores sancionados
            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                let textosFila = [];
                $(fila).find("td").each((j, celda) => {
                    let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                    if (texto !== "") textosFila.push(texto);
                });

                if (textosFila.length >= 6 && textosFila[1] !== "Nombre") {
                    let jugadorCrudo = textosFila[1];
                    let clubCrudo = textosFila[2];
                    
                    let torneoFila = textosFila[6] ? limpiarTorneo(textosFila[6]) : "Campeonato Oficial";
                    let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                    let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo); 
                    let jugadorLimpio = formatearNombre(jugadorCrudo);

                    tarjetasCrudas.push({
                        torneo: torneoFila, 
                        categoria: categoriaLimpia,
                        jugador: jugadorLimpio,
                        equipo: equipoLimpio,
                        verde: parseInt(textosFila[3]) || 0,
                        amarilla: parseInt(textosFila[4]) || 0,
                        roja: parseInt(textosFila[5]) || 0
                    });
                }
            }
        });

        // 6. Ordenamiento
        console.log("🧹 [Scraper] Ordenando tarjetas (Rojas > Amarillas > Verdes)...");
        tarjetasCrudas.sort((a, b) => {
            if (b.roja !== a.roja) return b.roja - a.roja;
            if (b.amarilla !== a.amarilla) return b.amarilla - a.amarilla;
            return b.verde - a.verde;
        });

        console.log(`🎉 [Scraper] ¡EXTRACCIÓN FINALIZADA! Se procesaron ${tarjetasCrudas.length} jugadores con tarjetas.`);
        await browser.close();
        
        return tarjetasCrudas;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        await browser.close();
        throw error; // Lanza el error al orquestador
    }
}

// Exportamos el módulo
module.exports = { obtenerTarjetasDefinitivo };

// Bloque para pruebas locales aisladas
if (require.main === module) {
    obtenerTarjetasDefinitivo()
        .then(data => {
            if(data.length > 0) console.log("👉 Muestra del primer sancionado:", data[0]);
        })
        .catch(console.error);
}