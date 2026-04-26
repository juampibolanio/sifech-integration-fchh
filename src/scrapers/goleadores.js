const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos } = require("../utils/diccionarios");

/**
 * Formatea nombres de jugadores a Title Case (ej: "Perez, Juan")
 * Asegura un espacio después de la coma.
 */
function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    let nombre = nombreCompleto.replace(/,\s*/g, ', ');
    return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, match => match.toUpperCase());
}

/**
 * Limpia caracteres mal codificados del sistema SIFECH (ej: "?" por "ó")
 */
function limpiarTorneo(torneoCrudo) {
    if (!torneoCrudo) return "";
    return torneoCrudo.replace(/\?/g, 'ó').trim();
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
        // 1. Navegación inicial y espera de carga
        console.log("🌐 [Scraper] Accediendo a SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

        // 2. Simulación de clic en menú para abrir tabla de Goleadores
        const hizoClic = await page.evaluate(() => {
            const enlaceSecreto = document.querySelector('a[href*="grid_tabla_goleadores"]');
            if (enlaceSecreto) {
                enlaceSecreto.click();
                return true;
            }
            return false;
        });

        if (!hizoClic) throw new Error("Enlace de Goleadores no encontrado en el menú.");
        
        // Esperamos a que el iframe reaccione al clic
        await new Promise((r) => setTimeout(r, 6000));

        // 3. Localización del iframe activo
        let iframeGoleadores = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_goleadores")) {
                iframeGoleadores = frame;
                break;
            }
        }

        if (!iframeGoleadores) throw new Error("El Iframe de Goleadores no cargó correctamente.");

        // 4. Extracción y procesamiento del HTML
        console.log("📥 [Scraper] Leyendo tabla y aplicando diccionarios...");
        const html = await iframeGoleadores.content();
        const $ = cheerio.load(html);

        const goleadoresCrudos = [];
        const idsGuardados = new Set();
        let currentTorneo = "Campeonato Oficial";
        let currentCategoria = "General";

        $("tr").each((_, fila) => {
            // Detectar filas de agrupación (Torneo o Categoría)
            const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
            if (agrupadorTd.length === 3) {
                let etiqueta = $(agrupadorTd[0]).text().trim();
                let valor = $(agrupadorTd[2]).text().trim();
                
                if (etiqueta === "Torneo") currentTorneo = limpiarTorneo(valor);
                if (etiqueta === "Categoria") currentCategoria = valor;
            }

            // Detectar filas de jugadores
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

                    // Filtrar cabeceras repetidas y validar cantidad de goles
                    if (jugCrudo !== "Jugador" && !isNaN(parseInt(golesCrudos))) {
                        let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                        let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo);
                        let nombreLimpio = formatearNombre(jugCrudo);

                        // Crear clave única para evitar jugadores duplicados en la misma tabla
                        let uid = `${categoriaLimpia}-${nombreLimpio}-${equipoLimpio}-${currentTorneo}`;

                        if (!idsGuardados.has(uid)) {
                            idsGuardados.add(uid);
                            goleadoresCrudos.push({
                                torneo: currentTorneo,
                                categoria: categoriaLimpia,
                                posicion: 0, // Se calcula más adelante
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
        throw error; // Lanza el error para que el orquestador lo maneje
    }
}

// Exportamos el módulo para su uso externo
module.exports = { obtenerGoleadoresDefinitivo };

// Bloque de pruebas para ejecutar directamente en consola (node goleadores.js)
if (require.main === module) {
    obtenerGoleadoresDefinitivo()
        .then(data => console.log("👉 Muestra de prueba:", data[0]))
        .catch(console.error);
}