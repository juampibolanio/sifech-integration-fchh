const cheerio = require("cheerio");
const fs = require("fs");
const { loginSifech } = require("../auth/sifechLogin");
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Formatea nombres a Title Case por si el equipo no está en el diccionario
 */
function formatearNombre(nombreCompleto) {
    if (!nombreCompleto) return "";
    return nombreCompleto.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
        return match.toUpperCase();
    });
}

function actualizarCookies(cookiesViejas, nuevasCookiesRaw) {
    if (!nuevasCookiesRaw || nuevasCookiesRaw.length === 0) return cookiesViejas;
    const mapaCookies = new Map();
    if (cookiesViejas) {
        cookiesViejas.split(";").forEach((par) => {
            const [key, ...val] = par.trim().split("=");
            if (key) mapaCookies.set(key, val.join("="));
        });
    }
    nuevasCookiesRaw.forEach((c) => {
        const par = c.split(";")[0].trim();
        const [key, ...val] = par.split("=");
        if (key) mapaCookies.set(key, val.join("="));
    });
    return Array.from(mapaCookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
}

/**
 * Scraper principal de Resultados.
 * Se conecta mediante Auth, extrae la tabla expandida y procesa los goles.
 */
async function obtenerResultados() {
    const urlBase = "https://www.fchh.com.ar";
    const urlGrid = urlBase + "/sys/grid_resultados_bak/grid_resultados_bak.php";

    try {
        console.log("🔑 [Scraper] Obteniendo sesión fresca de SIFECH...");
        let cookie = await loginSifech();

        console.log("🕵️‍♂️ [Scraper] Entrando a la tabla de Resultados...");
        const resGrid = await fetch(urlGrid, {
            method: "GET",
            headers: {
                cookie: cookie,
                "User-Agent": USER_AGENT,
                Referer: "https://www.fchh.com.ar/sys/back_menu/back_menu.php",
            },
        });

        cookie = actualizarCookies(cookie, resGrid.headers.getSetCookie());
        const htmlGrid = await resGrid.text();
        const $grid = cheerio.load(htmlGrid);

        let scriptCaseInit = "";
        $grid('input[name="script_case_init"]').each((i, el) => {
            const val = $grid(el).val();
            if (val && val.trim() !== "") scriptCaseInit = val;
        });

        if (!scriptCaseInit) throw new Error("No se encontró el token de seguridad.");
        console.log(`🎯 [Scraper] Token obtenido: ${scriptCaseInit}`);

        console.log("⏳ [Scraper] Expandiendo la tabla para leer todos los datos de golpe...");
        const formPaginacion = `nmgp_opcao=alterar_quant_linhas&nmgp_quant_linhas=2000&script_case_init=${scriptCaseInit}`;

        const resExpandido = await fetch(urlGrid, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                cookie: cookie,
                "User-Agent": USER_AGENT,
                Referer: urlGrid,
            },
            body: formPaginacion,
        });

        // Decodificamos ISO-8859-1 para respetar tildes y ñ
        const arrayBuffer = await resExpandido.arrayBuffer();
        const htmlCompleto = new TextDecoder("iso-8859-1").decode(arrayBuffer);
        const $ = cheerio.load(htmlCompleto);

        console.log("📥 [Scraper] Extrayendo y agrupando datos de los partidos...");
        const resultados = [];
        let currentFecha = "";
        let currentCategoria = "";

        $("tr").each((i, fila) => {
            // 1. Detectar Agrupadores
            const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
            if (agrupadorTd.length === 3) {
                let etiqueta = $(agrupadorTd[0]).text().trim();
                let valor = $(agrupadorTd[2]).text().trim();

                if (etiqueta === "Fecha") currentFecha = valor;
                if (etiqueta === "Categoria") currentCategoria = valor;
            }

            // 2. Extraer fila de partido
            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                const celdas = $(fila).find("td");

                if (celdas.length >= 7) {
                    let localCrudo = $(celdas[1]).text().trim();
                    let visitaCruda = $(celdas[3]).text().trim();
                    let golesLocal = $(celdas[5]).text().trim();
                    let golesVisitante = $(celdas[6]).text().trim();

                    if (localCrudo !== "" && localCrudo !== "Local") {
                        let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                        
                        // Traducción robusta de equipos
                        let localLimpio = diccionarioEquipos[localCrudo.toUpperCase()] || diccionarioEquipos[localCrudo] || formatearNombre(localCrudo);
                        let visitaLimpia = diccionarioEquipos[visitaCruda.toUpperCase()] || diccionarioEquipos[visitaCruda] || formatearNombre(visitaCruda);

                        resultados.push({
                            numero_fecha: currentFecha,
                            categoria: categoriaLimpia,
                            dia_fecha: "",
                            hora: "A definir",
                            equipo_local: localLimpio,
                            goles_local: golesLocal,
                            equipo_visitante: visitaLimpia,
                            goles_visitante: golesVisitante,
                        });
                    }
                }
            }
        });

        console.log(`🎉 [Scraper] ¡Éxito Total! Se extrajeron ${resultados.length} resultados mapeados.`);
        return resultados;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        throw error;
    }
}

module.exports = { obtenerResultados };

// Bloque de pruebas local
if (require.main === module) {
    obtenerResultados()
        .then(data => { if(data.length > 0) console.log("👉 Ejemplo:", data[0]) })
        .catch(console.error);
}