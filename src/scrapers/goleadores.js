const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos } = require("../utils/diccionarios");

/**
 * Formatea nombres de jugadores a Title Case (ej: "Perez, Juan")
 * Asegura un espacio después de la coma.
 */
function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    let nombre = nombreCompleto.replace(/,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, match => match.toUpperCase());
}

/**
 * Scraper principal de goleadores.
 * Extrae datos, los limpia, los agrupa por torneo/categoría y calcula el Top 10.
 * @returns {Promise<Array>} Array de objetos con los goleadores filtrados.
 */
async function obtenerGoleadoresDefinitivo() {
    console.log("🚀 [Scraper] Iniciando navegador (Puppeteer) para Goleadores...");
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    try {
        console.log("🌐 [Scraper] Accediendo a SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

        const hizoClic = await page.evaluate(() => {
            const enlaceSecreto = document.querySelector('a[href*="grid_tabla_goleadores"]');
            if (enlaceSecreto) {
                enlaceSecreto.click();
                return true;
            }
            return false;
        });

        if (!hizoClic) throw new Error("Enlace de Goleadores no encontrado en el menú.");
        await new Promise((r) => setTimeout(r, 6000));

        let iframeGoleadores = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_goleadores")) {
                iframeGoleadores = frame;
                break;
            }
        }

        if (!iframeGoleadores) throw new Error("El Iframe de Goleadores no cargó correctamente.");

        // =======================================================
        // SOLUCIÓN 1: INYECTAR LOS 500 REGISTROS
        // =======================================================
        console.log("🔓 [Scraper] Inyectando la opción de 500 registros en el menú...");
        const paginacionExitosa = await iframeGoleadores.evaluate(() => {
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

        if (!paginacionExitosa) {
            console.log("⚠️ [Scraper] No se encontró el paginador. Extrayendo lo visible...");
        } else {
            console.log("⏳ [Scraper] Esperando 8 segundos a que carguen todos los goleadores...");
            await new Promise((r) => setTimeout(r, 8000));

            for (const frame of page.frames()) {
                if (frame.url().includes("grid_tabla_goleadores")) {
                    iframeGoleadores = frame;
                    break;
                }
            }
        }

        console.log("📥 [Scraper] Leyendo tabla y aplicando diccionarios...");
        const html = await iframeGoleadores.content();
        const $ = cheerio.load(html);

        const goleadoresCrudos = [];
        const idsGuardados = new Set();
        let currentTorneo = "CAMPEONATO Oficial Capital";
        let currentCategoria = "General";

        $("tr").each((_, fila) => {
            // =======================================================
            // SOLUCIÓN 2: EL LECTOR DE TÍTULOS INDESTRUCTIBLE
            // =======================================================
            const blockFontTds = $(fila).find(".scGridBlockFont td");
            if (blockFontTds.length > 0) {
                let labelEncontrado = "";
                let valorEncontrado = "";

                blockFontTds.each((idx, td) => {
                    let txt = $(td).text().trim();
                    if (txt === "Torneo" || txt === "Categoria" || txt === "Categoría") {
                        labelEncontrado = txt;
                        for (let k = idx + 1; k < blockFontTds.length; k++) {
                            let nextTxt = $(blockFontTds[k]).text().trim();
                            if (nextTxt !== "" && nextTxt !== ":") {
                                valorEncontrado = nextTxt;
                                break;
                            }
                        }
                    }
                });

                if (labelEncontrado === "Torneo") currentTorneo = valorEncontrado;
                if (labelEncontrado === "Categoria" || labelEncontrado === "Categoría") currentCategoria = valorEncontrado;
            }

            // Detección de jugadores
            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                let textosFila = [];
                $(fila).find("td").each((_, celda) => {
                    let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                    if (texto !== "") textosFila.push(texto);
                });

                if (textosFila.length >= 4) {
                    let jugCrudo = textosFila[1];
                    let clubCrudo = textosFila[2];
                    let golesCrudos = textosFila[textosFila.length - 1];

                    // Filtrar cabeceras y validar que tenga goles
                    if (jugCrudo !== "Jugador" && !isNaN(parseInt(golesCrudos))) {
                        let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                        let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo);
                        let nombreLimpio = formatearNombre(jugCrudo);

                        let uid = `${categoriaLimpia}-${nombreLimpio}-${equipoLimpio}-${currentTorneo}`;

                        if (!idsGuardados.has(uid)) {
                            idsGuardados.add(uid);
                            goleadoresCrudos.push({
                                torneo: currentTorneo, // Nombre crudo, igual que en Resultados
                                categoria: categoriaLimpia,
                                posicion: 0,
                                jugador: nombreLimpio,
                                equipo: equipoLimpio,
                                goles: parseInt(golesCrudos) || 0,
                            });
                        }
                    }
                }
            }
        });

        // 5. Agrupamiento y cálculo del Top 10
        console.log("🧹 [Scraper] Calculando Top 10 por Torneo y Categoría...");
        const goleadoresAgrupados = {};

        goleadoresCrudos.forEach(jugador => {
            let llaveGrupo = `${jugador.torneo}|${jugador.categoria}`;
            if (!goleadoresAgrupados[llaveGrupo]) {
                goleadoresAgrupados[llaveGrupo] = [];
            }
            goleadoresAgrupados[llaveGrupo].push(jugador);
        });

        let goleadoresTop10 = [];

        for (const llave in goleadoresAgrupados) {
            let jugadoresCat = goleadoresAgrupados[llave];
            
            // Orden descendente por cantidad de goles
            jugadoresCat.sort((a, b) => b.goles - a.goles);

            // Cortar en 10 y asignar posición real
            let top10 = jugadoresCat.slice(0, 10).map((jugador, index) => {
                jugador.posicion = index + 1;
                return jugador;
            });

            goleadoresTop10 = goleadoresTop10.concat(top10);
        }

        console.log(`🎉 [Scraper] Extracción exitosa. Registros finales: ${goleadoresTop10.length}`);
        await browser.close();
        
        return goleadoresTop10;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        await browser.close();
        throw error;
    }
}

module.exports = { obtenerGoleadoresDefinitivo };