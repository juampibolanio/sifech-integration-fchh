const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos } = require("../data/diccionarios");

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
 * Scraper principal de Tarjetas con Paginación Humana.
 * Navega página por página para burlar el límite de SIFECH.
 */
async function obtenerTarjetasDefinitivo() {
    console.log("🚀 [Scraper] Encendiendo Puppeteer para buscar Tarjetas...");

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    try {
        console.log("🌐 [Scraper] Entrando a la página oficial de SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

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
        await new Promise((r) => setTimeout(r, 8000)); // Damos buen tiempo de carga

        let iframeTarjetas = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_tarjetas")) {
                iframeTarjetas = frame;
                break;
            }
        }

        if (!iframeTarjetas) throw new Error("No se encontró el Iframe de tarjetas.");

        const tarjetasCrudas = [];
        const idsGuardados = new Set();
        
        // Memoria entre páginas
        let currentCategoria = "General";
        let currentTorneo = "CAMPEONATO Oficial Capital";
        
        let hayMasPaginas = true;
        let paginasLeidas = 1;

        // =======================================================
        // EL BUCLE PAGINADOR: Lee y hace clic en "Siguiente"
        // =======================================================
        while (hayMasPaginas && paginasLeidas <= 10) { 
            console.log(`📥 [Scraper] Leyendo página ${paginasLeidas} de Tarjetas...`);
            
            const html = await iframeTarjetas.content();
            const $ = cheerio.load(html);

            $("tr").each((i, fila) => {
                // 1. Lector Indestructible de Títulos (por si SIFECH agrupa)
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
                // Extractor Todoterreno de respaldo
                else if (!$(fila).hasClass("scGridFieldOdd") && !$(fila).hasClass("scGridFieldEven")) {
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

                // 2. Extracción de Jugadores Sancionados
                if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                    let textosFila = [];
                    $(fila).find("td").each((j, celda) => {
                        let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                        if (texto !== "") textosFila.push(texto);
                    });

                    if (textosFila.length >= 6 && !textosFila.includes("Nombre")) {
                        let jugadorCrudo = textosFila[1];
                        let clubCrudo = textosFila[2];
                        
                        // Si la columna de torneo existe la usamos en crudo, sino usamos la memoria
                        let torneoFila = textosFila[6] ? textosFila[6] : currentTorneo;
                        
                        let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                        let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo); 
                        let jugadorLimpio = formatearNombre(jugadorCrudo);

                        let uid = `${categoriaLimpia}-${jugadorLimpio}-${equipoLimpio}-${torneoFila}`;

                        if (!idsGuardados.has(uid)) {
                            idsGuardados.add(uid);
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
                }
            });

            console.log(`📊 [Scraper] Tarjetas acumuladas hasta ahora: ${tarjetasCrudas.length}`);

            console.log("⏭️ [Scraper] Intentando pasar a la siguiente página...");
            const avanzamos = await iframeTarjetas.evaluate(() => {
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
                    if (frame.url().includes("grid_tabla_tarjetas")) {
                        iframeTarjetas = frame;
                        break;
                    }
                }
            } else {
                console.log("✅ [Scraper] No hay botón de siguiente habilitado. Fin de la tabla.");
                hayMasPaginas = false;
            }
        }

        // =======================================================
        // ORDENAMIENTO FINAL
        // =======================================================
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
        throw error;
    }
}

module.exports = { obtenerTarjetasDefinitivo };