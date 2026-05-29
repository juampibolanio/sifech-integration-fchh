const cheerio = require("cheerio");
const fs = require("fs");
const { loginSifech } = require("../auth/sifechLogin");
const { diccionarioCategorias, diccionarioEquipos } = require("../utils/diccionarios");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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
        const formPaginacion = `nmgp_opcao=alterar_quant_linhas&nmgp_quant_linhas=500&script_case_init=${scriptCaseInit}`;

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

        const arrayBuffer = await resExpandido.arrayBuffer();
        const htmlCompleto = new TextDecoder("iso-8859-1").decode(arrayBuffer);
        const $ = cheerio.load(htmlCompleto);

        console.log("📥 [Scraper] Extrayendo y agrupando datos de los partidos...");
        const resultados = [];
        
        let currentTorneo = "Campeonato Oficial";
        let currentFecha = "";
        let currentCategoria = "";

        $("tr").each((i, fila) => {
            const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
            if (agrupadorTd.length === 3) {
                let etiqueta = $(agrupadorTd[0]).text().trim();
                let valor = $(agrupadorTd[2]).text().trim();

                if (etiqueta === "Torneo") currentTorneo = limpiarTorneo(valor);
                if (etiqueta === "Fecha") currentFecha = valor;
                if (etiqueta === "Categoria") currentCategoria = valor;
            }

            if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
                let textosFila = [];
                $(fila).find("td").each((j, celda) => {
                    let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
                    textosFila.push(texto);
                });

                if (textosFila.length >= 7 && textosFila[1] !== "Local" && textosFila[1] !== "") {
                    let localCrudo = textosFila[1];
                    let divLocal = textosFila[2]; 
                    let visitaCruda = textosFila[3];
                    let divVisita = textosFila[4]; 
                    let golesLocal = textosFila[5];
                    let golesVisitante = textosFila[6];

                    let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
                    
                    let equipoLocalBase = diccionarioEquipos[localCrudo.toUpperCase()] || formatearNombre(localCrudo);
                    let equipoVisitaBase = diccionarioEquipos[visitaCruda.toUpperCase()] || formatearNombre(visitaCruda);

                    // REGLA APLICADA: Solo sumamos la división si NO es "A"
                    let localLimpio = (divLocal && divLocal.toUpperCase() !== "A") ? `${equipoLocalBase} ${divLocal}` : equipoLocalBase;
                    let visitaLimpia = (divVisita && divVisita.toUpperCase() !== "A") ? `${equipoVisitaBase} ${divVisita}` : equipoVisitaBase;

                    resultados.push({
                        torneo: currentTorneo, 
                        numero_fecha: currentFecha,
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
        return resultados;

    } catch (error) {
        console.error("💥 [Scraper] Error Crítico:", error.message);
        throw error;
    }
}

module.exports = { obtenerResultados };