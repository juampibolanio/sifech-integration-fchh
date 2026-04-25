const cheerio = require("cheerio");
const fs = require("fs");
const { loginSifech } = require("../auth/sifechLogin");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const diccionarioCategorias = {
  "Primera Caballeros": "1ra Masc.",
  "Primera Damas": "1ra Fem.",
  MAMIS: "Mamis",
  RESERV: "Reserva",
  "Sub 12 Femenino": "Sub 12 Fem.",
  "Sub 14 Femenino": "Sub 14 Fem.",
  "Sub 16 Femenino": "Sub 16 Fem.",
  "Sub 18 Femenino": "Sub 18 Fem.",
};

const diccionarioEquipos = {
  "Club Atlético Estudiante": "CA. Estudiantes",
  Sarmiento: "Sarmiento",
  "Asosiacion Civil Chaco Hockey": "Asoc. Chaco Hockey",
  "Regatas Resistencia": "Regatas Resistencia",
  "CORRIENTES HOCKEY - CTES": "Corrientes Hockey",
  "CUNE C.Univ. del Nordeste": "CUNE",
  "CURNE - Un. Rugby Nord": "CURNE",
  "Federación Chaqueña de Hockey": "Federación Chaqueña",
  "QUILMES - CTS": "Quilmes CTS",
  "San Fernando": "San Fernando",
  SELECCIONES: "Selecciones",
  "Sixty Rugby Club": "Sixty",
  "Tacuarendi Sta Fe": "Tacuarendí",
  "Taragüy Rugby Club - CTES": "Taragüy",
  "Club Atlético Bolido Verde": "CA. Bólido Verde",
  "VILLA ALVEAR": "Villa Alvear",
};

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
    console.log("🔑 Obteniendo sesión fresca...");
    let cookie = await loginSifech();

    console.log("🕵️‍♂️ Entrando a la tabla de Resultados...");
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

    if (!scriptCaseInit) throw new Error("❌ No se encontró el token.");
    console.log(`🎯 Token obtenido: ${scriptCaseInit}`);

    console.log(
      "⏳ Expandiendo la tabla para leer todos los datos de golpe...",
    );
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

    // 👉 NUEVO: Decodificamos correctamente los acentos (ISO-8859-1)
    const arrayBuffer = await resExpandido.arrayBuffer();
    const htmlCompleto = new TextDecoder("iso-8859-1").decode(arrayBuffer);
    const $ = cheerio.load(htmlCompleto);

    console.log("📥 Extrayendo datos agrupados inteligentemente...");
    const resultados = [];

    // Memoria temporal del robot mientras lee de arriba hacia abajo
    let currentFecha = "";
    let currentCategoria = "";

    $("tr").each((i, fila) => {
      // 1. Verificamos si esta fila es un separador/agrupador (Torneo, Fecha, Categoria)
      const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
      if (agrupadorTd.length === 3) {
        let etiqueta = $(agrupadorTd[0]).text().trim();
        let valor = $(agrupadorTd[2]).text().trim();

        if (etiqueta === "Fecha") currentFecha = valor;
        if (etiqueta === "Categoria") currentCategoria = valor;
      }

      // 2. Verificamos si esta fila contiene los datos de un partido real
      if (
        $(fila).hasClass("scGridFieldOdd") ||
        $(fila).hasClass("scGridFieldEven")
      ) {
        const celdas = $(fila).find("td");

        // Si la fila tiene al menos 7 celdas (Local, Div, Visitante, Div, GolesL, GolesV)
        if (celdas.length >= 7) {
          let localCrudo = $(celdas[1]).text().trim();
          let visitaCruda = $(celdas[3]).text().trim();
          let golesLocal = $(celdas[5]).text().trim();
          let golesVisitante = $(celdas[6]).text().trim();

          // Ignoramos la fila de títulos (por las dudas) y filas vacías
          if (localCrudo !== "" && localCrudo !== "Local") {
            // Pasamos por el diccionario de traducciones
            let categoriaLimpia =
              diccionarioCategorias[currentCategoria] || currentCategoria;
            let localLimpio = diccionarioEquipos[localCrudo] || localCrudo;
            let visitaLimpia = diccionarioEquipos[visitaCruda] || visitaCruda;

            resultados.push({
              numero_fecha: currentFecha,
              categoria: categoriaLimpia,
              dia_fecha: "", // No disponible en esta vista
              hora: "A definir", // No disponible en esta vista
              equipo_local: localLimpio,
              goles_local: golesLocal,
              equipo_visitante: visitaLimpia,
              goles_visitante: golesVisitante,
            });
          }
        }
      }
    });

    console.log(
      `🎉 ¡Éxito Total! Se extrajeron ${resultados.length} resultados perfectamente mapeados.`,
    );
    if (resultados.length > 0) {
      console.log("\n👉 Ejemplo capturado:");
      console.log(resultados[0]);
    }

    return resultados;
  } catch (error) {
    console.error("💥 Error:", error.message);
    throw error;
  }
}

module.exports = { obtenerResultados };

if (require.main === module) {
  obtenerResultados()
    .then(() => console.log("🏁 Prueba finalizada."))
    .catch((error) => console.error(error));
}
