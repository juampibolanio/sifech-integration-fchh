const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos } = require("../utils/diccionarios");

function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    let nombre = nombreCompleto.replace(/,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, match => match.toUpperCase());
}

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
        
        await new Promise((r) => setTimeout(r, 8000));

        let iframeGoleadores = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_goleadores")) {
                iframeGoleadores = frame;
                break;
            }
        }

        if (!iframeGoleadores) throw new Error("El Iframe de Goleadores no cargó correctamente.");

        const goleadoresCrudos = [];
        const idsGuardados = new Set();
        
        // Variables que NO se reinician para que mantengan la memoria al cambiar de página
        let currentTorneo = "CAMPEONATO Oficial Capital";
        let currentCategoria = "General";
        
        let hayMasPaginas = true;
        let paginasLeidas = 1;

        // =======================================================
        // EL BUCLE PAGINADOR: Lee y hace clic en "Siguiente"
        // =======================================================
        while (hayMasPaginas && paginasLeidas <= 10) { // Límite de seguridad de 10 páginas
            console.log(`📥 [Scraper] Leyendo página ${paginasLeidas} de Goleadores...`);
            
            const html = await iframeGoleadores.content();
            const $ = cheerio.load(html);

            $("tr").each((_, fila) => {
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

                if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                    let textosFila = [];
                    $(fila).find("td").each((_, celda) => {
                        let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                        textosFila.push(texto);
                    });

                    while (textosFila.length > 0 && textosFila[0] === "") {
                        textosFila.shift();
                    }

                    if (textosFila.length >= 3 && !textosFila.includes("Jugador")) {
                        let golesCrudos = textosFila[textosFila.length - 1];
                        let clubCrudo = textosFila[textosFila.length - 2];
                        let jugCrudo = textosFila[textosFila.length - 3];

                        if (jugCrudo && clubCrudo && !isNaN(parseInt(golesCrudos))) {
                            let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                            let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo);
                            let nombreLimpio = formatearNombre(jugCrudo);

                            let uid = `${categoriaLimpia}-${nombreLimpio}-${equipoLimpio}-${currentTorneo}`;

                            if (!idsGuardados.has(uid)) {
                                idsGuardados.add(uid);
                                goleadoresCrudos.push({
                                    torneo: currentTorneo, 
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

            console.log(`📊 [Scraper] Jugadores acumulados hasta ahora: ${goleadoresCrudos.length}`);

            console.log("⏭️ [Scraper] Intentando pasar a la siguiente página...");
            const avanzamos = await iframeGoleadores.evaluate(() => {
                let btnAdelante = document.getElementById('forward_bot') || document.getElementById('forward_top');
                
                if (btnAdelante && !btnAdelante.disabled && btnAdelante.style.display !== 'none') {
                    btnAdelante.click();
                    return true;
                }
                return false;
            });

            if (avanzamos) {
                paginasLeidas++;
                console.log(`⏳ [Scraper] Esperando 5 segundos a que cargue la página ${paginasLeidas}...`);
                await new Promise((r) => setTimeout(r, 5000));

                for (const frame of page.frames()) {
                    if (frame.url().includes("grid_tabla_goleadores")) {
                        iframeGoleadores = frame;
                        break;
                    }
                }
            } else {
                console.log("✅ [Scraper] No hay botón de siguiente habilitado. Fin de la tabla.");
                hayMasPaginas = false;
            }
        }

        //Cálculo del Top 10
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
            
            jugadoresCat.sort((a, b) => b.goles - a.goles);

            let top10 = jugadoresCat.slice(0, 10).map((jugador, index) => {
                jugador.posicion = index + 1;
                return jugador;
            });

            goleadoresTop10 = goleadoresTop10.concat(top10);
        }

        console.log(`🎉 [Scraper] Extracción exitosa. Registros finales procesados: ${goleadoresTop10.length}`);
        await browser.close();
        
        return goleadoresTop10;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        await browser.close();
        throw error;
    }
}

module.exports = { obtenerGoleadoresDefinitivo };