const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos } = require("../utils/diccionarios");

function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    let nombre = nombreCompleto.replace(/,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
        return match.toUpperCase();
    });
}

function limpiarTorneo(torneoCrudo) {
    if (!torneoCrudo) return "";
    return torneoCrudo.replace(/\?/g, 'ó').trim(); 
}

async function obtenerResultados() {
    console.log("🚀 [Scraper] Encendiendo Puppeteer para buscar Resultados...");

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    try {
        console.log("🌐 [Scraper] Entrando a la página oficial de SIFECH...");
        await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 3000));

        console.log("🖱️ [Scraper] Forzando la carga de la Tabla de Resultados...");
        const hizoClic = await page.evaluate(() => {
            const enlaceSecreto = document.querySelector('a[href*="grid_resultados"]');
            if (enlaceSecreto) {
                enlaceSecreto.click();
                return true;
            }
            return false;
        });

        if (!hizoClic) throw new Error("No encontré el enlace de resultados en el menú.");
        await new Promise((r) => setTimeout(r, 6000));

        let iframeResultados = null;
        for (const frame of page.frames()) {
            if (frame.url().includes("grid_resultados")) {
                iframeResultados = frame;
                break;
            }
        }

        if (!iframeResultados) throw new Error("No se encontró el Iframe de resultados.");

        console.log("🔓 [Scraper] Inyectando la opción de 500 registros en el menú...");
        const paginacionExitosa = await iframeResultados.evaluate(() => {
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
            console.log("⏳ [Scraper] Esperando 8 segundos a que carguen los 173+ registros...");
            await new Promise((r) => setTimeout(r, 8000));

            for (const frame of page.frames()) {
                if (frame.url().includes("grid_resultados")) {
                    iframeResultados = frame;
                    break;
                }
            }
        }

        console.log("📥 [Scraper] ¡Tabla localizada! Extrayendo datos...");
        const html = await iframeResultados.content();
        const $ = cheerio.load(html);
        const resultados = [];

        let currentTorneo = "Campeonato Oficial";
        let currentFecha = "";
        let currentCategoria = "";

        $("tr").each((i, fila) => {
            const blockFont = $(fila).find(".scGridBlockFont");
            if (blockFont.length > 0) {
                let textoBloque = blockFont.text().replace(/\s+/g, " ").trim();

                // NUEVO: Regex láser para ignorar íconos [-] y atrapar el valor exacto
                if (/Torneo/i.test(textoBloque)) {
                    currentTorneo = limpiarTorneo(textoBloque.replace(/.*Torneo/i, "").replace(/^[:\-\s]+/, "").trim());
                } else if (/Fecha/i.test(textoBloque)) {
                    currentFecha = textoBloque.replace(/.*Fecha/i, "").replace(/^[:\-\s]+/, "").trim();
                } else if (/Categor[ií]a/i.test(textoBloque)) {
                    currentCategoria = textoBloque.replace(/.*Categor[ií]a/i, "").replace(/^[:\-\s]+/, "").trim();
                }
            }

            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                let textosFila = [];
                $(fila).find("td").each((j, celda) => {
                    let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                    textosFila.push(texto);
                });

                while (textosFila.length > 0 && textosFila[0] === "") {
                    textosFila.shift();
                }

                if (textosFila.length >= 6 && textosFila[0] !== "Local" && textosFila[0] !== "Totales") {
                    let localCrudo = textosFila[0];
                    let divLocal = textosFila[1]; 
                    let visitaCruda = textosFila[2];
                    let divVisita = textosFila[3]; 
                    let golesLocal = textosFila[4];
                    let golesVisitante = textosFila[5];

                    let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                    
                    let equipoLocalBase = diccionarioEquipos[localCrudo.toUpperCase()] || formatearNombre(localCrudo);
                    let equipoVisitaBase = diccionarioEquipos[visitaCruda.toUpperCase()] || formatearNombre(visitaCruda);

                    let localLimpio = (divLocal && divLocal.toUpperCase() !== "A") ? `${equipoLocalBase} ${divLocal}` : equipoLocalBase;
                    let visitaLimpia = (divVisita && divVisita.toUpperCase() !== "A") ? `${equipoVisitaBase} ${divVisita}` : equipoVisitaBase;

                    resultados.push({
                        torneo: currentTorneo, 
                        // NUEVO: Forzamos la fecha a ser Número para que Wix no tire error
                        numero_fecha: parseInt(currentFecha) || 1, 
                        categoria: categoriaLimpia,
                        dia_fecha: "",
                        hora: "A definir",
                        equipo_local: localLimpio,
                        goles_local: parseInt(golesLocal) || 0,
                        equipo_visitante: visitaLimpia,
                        goles_visitante: parseInt(golesVisitante) || 0,
                    });
                }
            }
        });

        console.log(`🎉 [Scraper] ¡Éxito Total! Se extrajeron ${resultados.length} resultados mapeados.`);
        await browser.close();
        return resultados;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        await browser.close();
        throw error;
    }
}

module.exports = { obtenerResultados };