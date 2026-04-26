const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs"); 
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

/**
 * Formatea nombres a Title Case.
 */
function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    return nombreCompleto.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
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
 * Scraper principal de Posiciones.
 * Rompe la paginación de SIFECH, extrae los equipos, aplica diccionarios y ordena por Puntos/Diferencia de Goles.
 * @returns {Promise<Array>} Array de objetos con las posiciones finales.
 */
async function obtenerPosicionesDefinitivo() {
    console.log("🚀 [Scraper] Encendiendo Puppeteer para buscar Posiciones...");

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    try {
        // 1. Navegación inicial
        console.log("🌐 [Scraper] Entrando a la página oficial de SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

        // 2. Cargar tabla de Posiciones
        console.log("🖱️ [Scraper] Forzando la carga de la Tabla de Posiciones...");
        const hizoClic = await page.evaluate(() => {
            const enlaceSecreto = document.querySelector('a[href*="grid_tabla_posiciones"]');
            if (enlaceSecreto) {
                enlaceSecreto.click();
                return true;
            }
            return false;
        });

        if (!hizoClic) throw new Error("No encontré el enlace de posiciones.");
        await new Promise((r) => setTimeout(r, 6000));

        // 3. Localizar Iframe
        let iframePosiciones = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_tabla_posiciones")) {
                iframePosiciones = frame;
                break;
            }
        }

        if (!iframePosiciones) throw new Error("No se encontró el Iframe de posiciones.");

        // 4. Romper paginación (Simulación humana)
        console.log("🔓 [Scraper] Interactuando con el menú desplegable 'Ver X líneas'...");
        const paginacionExitosa = await iframePosiciones.evaluate(() => {
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
            console.log("⚠️ [Scraper] No se encontró el desplegable de paginación. Extrayendo lo visible...");
        } else {
            console.log("⏳ [Scraper] Esperando 8 segundos a que la tabla se expanda a 500 filas...");
            await new Promise((r) => setTimeout(r, 8000));
            
            // Re-enganchar el Iframe por si hubo recarga interna
            for (const frame of page.frames()) {
                if (frame.url().includes("grid_tabla_posiciones")) {
                    iframePosiciones = frame;
                    break;
                }
            }
        }

        // 5. Extracción de datos
        console.log("📥 [Scraper] ¡Tabla localizada! Extrayendo datos...");
        const html = await iframePosiciones.content();
        
        // Guardamos backup del HTML para depuración
        fs.writeFileSync("debug_posiciones.html", html);
        
        const $ = cheerio.load(html);
        const posicionesCrudas = [];
        let currentTorneo = "Campeonato Oficial";
        let currentCategoria = "General";

        $("tr").each((i, fila) => {
            const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
            if (agrupadorTd.length === 3) {
                let etiqueta = $(agrupadorTd[0]).text().trim();
                let valor = $(agrupadorTd[2]).text().trim();
                
                if (etiqueta === "Torneo") currentTorneo = limpiarTorneo(valor); 
                if (etiqueta === "Categoria") currentCategoria = valor;
            }

            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                let textosFila = [];
                $(fila).find("td").each((j, celda) => {
                    let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                    if (texto !== "") textosFila.push(texto);
                });

                if (textosFila.length >= 10 && textosFila[0] !== "Club" && textosFila[0] !== "Totales") {
                    let clubCrudo = textosFila[0];
                    let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                    let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo); 

                    posicionesCrudas.push({
                        torneo: currentTorneo, 
                        categoria: categoriaLimpia,
                        equipo: equipoLimpio,
                        posicion: 0, 
                        puntos: parseInt(textosFila[2]) || 0,
                        pj: parseInt(textosFila[3]) || 0,
                        pg: parseInt(textosFila[4]) || 0,
                        pe: parseInt(textosFila[5]) || 0,
                        pp: parseInt(textosFila[6]) || 0,
                        gf: parseInt(textosFila[7]) || 0,
                        gc: parseInt(textosFila[8]) || 0,
                        dg: parseInt(textosFila[9]) || 0
                    });
                }
            }
        });

        // 6. Ordenamiento y asignación de puestos reales
        console.log("🧹 [Scraper] Ordenando equipos por Puntos y asignando Puestos reales...");
        const posicionesAgrupadas = {};

        posicionesCrudas.forEach(equipo => {
            let llaveGrupo = `${equipo.torneo}|${equipo.categoria}`;
            if (!posicionesAgrupadas[llaveGrupo]) {
                posicionesAgrupadas[llaveGrupo] = [];
            }
            posicionesAgrupadas[llaveGrupo].push(equipo);
        });

        let posicionesFinal = [];

        for (const llave in posicionesAgrupadas) {
            let tablaCat = posicionesAgrupadas[llave];

            // Criterios de desempate: Puntos > Dif. Goles > Goles a Favor
            tablaCat.sort((a, b) => {
                if (b.puntos !== a.puntos) return b.puntos - a.puntos;
                if (b.dg !== a.dg) return b.dg - a.dg;
                return b.gf - a.gf;
            });

            let tablaOrdenada = tablaCat.map((equipo, index) => {
                equipo.posicion = index + 1; 
                return equipo;
            });

            posicionesFinal = posicionesFinal.concat(tablaOrdenada);
        }

        console.log(`🎉 [Scraper] ¡EXTRACCIÓN FINALIZADA! Se leyeron ${posicionesFinal.length} posiciones.`);
        await browser.close();
        
        return posicionesFinal;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        await browser.close();
        throw error; // Lanza el error al orquestador
    }
}

// Exportamos el módulo
module.exports = { obtenerPosicionesDefinitivo };

// Bloque para pruebas locales aisladas
if (require.main === module) {
    obtenerPosicionesDefinitivo()
        .then(data => {
            if(data.length > 0) console.log("👉 Muestra del Primer Puesto:", data[0]);
        })
        .catch(console.error);
}