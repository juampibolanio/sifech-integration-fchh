const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const {
  diccionarioCategorias,
  diccionarioEquipos,
} = require("../utils/diccionarios");

function formatearNombre(nombreCompleto) {
  if (!nombreCompleto) return "";
  let nombre = nombreCompleto
    .replace(/,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, function (match) {
    return match.toUpperCase();
  });
}

async function obtenerResultados() {
  console.log("🚀 [Scraper] Encendiendo Puppeteer para buscar Resultados...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  try {
    console.log("🌐 [Scraper] Entrando a la página oficial de SIFECH...");
    await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", {
      waitUntil: "networkidle2",
    });
    await new Promise((r) => setTimeout(r, 3000));

    console.log("🖱️ [Scraper] Forzando la carga de la Tabla de Resultados...");
    const hizoClic = await page.evaluate(() => {
      const enlaceSecreto = document.querySelector(
        'a[href*="grid_resultados"]',
      );
      if (enlaceSecreto) {
        enlaceSecreto.click();
        return true;
      }
      return false;
    });

    if (!hizoClic)
      throw new Error("No encontré el enlace de resultados en el menú.");
    await new Promise((r) => setTimeout(r, 6000));

    let iframeResultados = null;
    for (const frame of page.frames()) {
      if (frame.url().includes("grid_resultados")) {
        iframeResultados = frame;
        break;
      }
    }

    if (!iframeResultados)
      throw new Error("No se encontró el Iframe de resultados.");

    console.log(
      "🔓 [Scraper] Inyectando la opción de 500 registros en el menú...",
    );
    const paginacionExitosa = await iframeResultados.evaluate(() => {
      let selectPag = document.querySelector(
        'select[name="nmgp_quant_linhas"]',
      );
      if (selectPag) {
        let opt = document.createElement("option");
        opt.value = "500";
        opt.innerHTML = "500";
        selectPag.appendChild(opt);
        selectPag.value = "500";
        selectPag.dispatchEvent(new Event("change"));
        return true;
      }
      return false;
    });

    if (!paginacionExitosa) {
      console.log(
        "⚠️ [Scraper] No se encontró el paginador. Extrayendo lo visible...",
      );
    } else {
      console.log(
        "⏳ [Scraper] Esperando 8 segundos a que carguen los 173+ registros...",
      );
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

    // Valores por defecto
    let currentTorneo = "CAMPEONATO Oficial Capital";
    let currentFecha = "1";
    let currentCategoria = "";

    // 🕵️‍♂️ MODO ESPÍA: Guardamos la página que ve Puppeteer por si necesitamos revisarla
    // require("fs").writeFileSync("debug_resultados.html", html);

    $("tr").each((i, fila) => {
      // Verificamos si es una fila de partido o un título separador
      let esFilaDatos =
        $(fila).hasClass("scGridFieldOdd") ||
        $(fila).hasClass("scGridFieldEven");

      // ====================================================
      // SI ES UN TÍTULO (SIN IMPORTAR LA CLASE CSS QUE TENGA)
      // ====================================================
      if (!esFilaDatos) {
        // Extraemos todo el texto de la fila y limpiamos espacios
        let textoFila = $(fila).text().replace(/\s+/g, " ").trim();

        // Si menciona Torneo, Fecha o Categoría (y no es la fila de encabezados de tabla)
        if (/Torneo/i.test(textoFila) && !/Local/i.test(textoFila)) {
          currentTorneo = textoFila.replace(/.*Torneo\s*[:\-]?\s*/i, "").trim();
        } else if (/Fecha/i.test(textoFila) && !/Local/i.test(textoFila)) {
          currentFecha = textoFila.replace(/.*Fecha\s*[:\-]?\s*/i, "").trim();
        } else if (
          /Categor[ií]a/i.test(textoFila) &&
          !/Local/i.test(textoFila)
        ) {
          currentCategoria = textoFila
            .replace(/.*Categor[ií]a\s*[:\-]?\s*/i, "")
            .trim();
        }
      }
      // ====================================================
      // SI ES UN PARTIDO (EXTRACCIÓN DE DATOS)
      // ====================================================
      else {
        let textosFila = [];
        $(fila)
          .find("td")
          .each((j, celda) => {
            let texto = $(celda)
              .text()
              .replace(/\u00a0/g, " ")
              .trim();
            textosFila.push(texto);
          });

        // Limpieza de columnas invisibles iniciales
        while (textosFila.length > 0 && textosFila[0] === "") {
          textosFila.shift();
        }

        if (
          textosFila.length >= 6 &&
          textosFila[0] !== "Local" &&
          textosFila[0] !== "Totales"
        ) {
          let localCrudo = textosFila[0];
          let divLocal = textosFila[1];
          let visitaCruda = textosFila[2];
          let divVisita = textosFila[3];
          let golesLocal = textosFila[4];
          let golesVisitante = textosFila[5];

          let categoriaLimpia =
            diccionarioCategorias[currentCategoria] || currentCategoria;

          let equipoLocalBase =
            diccionarioEquipos[localCrudo.toUpperCase()] ||
            formatearNombre(localCrudo);
          let equipoVisitaBase =
            diccionarioEquipos[visitaCruda.toUpperCase()] ||
            formatearNombre(visitaCruda);

          let localLimpio =
            divLocal && divLocal.toUpperCase() !== "A"
              ? `${equipoLocalBase} ${divLocal}`
              : equipoLocalBase;
          let visitaLimpia =
            divVisita && divVisita.toUpperCase() !== "A"
              ? `${equipoVisitaBase} ${divVisita}`
              : equipoVisitaBase;

          resultados.push({
            torneo: currentTorneo,
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

    console.log(
      `🎉 [Scraper] ¡Éxito Total! Se extrajeron ${resultados.length} resultados mapeados.`,
    );
    await browser.close();
    return resultados;
  } catch (error) {
    console.error("💥 [Scraper] Error Crítico:", error.message);
    await browser.close();
    throw error;
  }
}

module.exports = { obtenerResultados };
