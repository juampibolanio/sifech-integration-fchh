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

function limpiarTorneo(torneoCrudo) {
  if (!torneoCrudo) return "";
  return torneoCrudo.replace(/\?/g, "ó").trim();
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
      // Buscamos el enlace de Resultados en el menú lateral
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
        selectPag.dispatchEvent(new Event("change")); // Simulamos el clic humano
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

      // Re-enganchamos el Iframe por si SIFECH recargó la página internamente
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
      const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
      if (agrupadorTd.length === 3) {
        let etiqueta = $(agrupadorTd[0]).text().trim();
        let valor = $(agrupadorTd[2]).text().trim();

        if (etiqueta === "Torneo") currentTorneo = limpiarTorneo(valor);
        if (etiqueta === "Fecha") currentFecha = valor;
        if (etiqueta === "Categoria") currentCategoria = valor;
      }

      if (
        $(fila).hasClass("scGridFieldOdd") ||
        $(fila).hasClass("scGridFieldEven")
      ) {
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

        // NUEVO: Borramos todas las columnas vacías al principio de la fila
        while (textosFila.length > 0 && textosFila[0] === "") {
          textosFila.shift();
        }

        // Ahora sabemos que textosFila[0] es SÍ o SÍ el Equipo Local
        if (
          textosFila.length >= 6 &&
          textosFila[0] !== "Local" &&
          textosFila[0] !== "Totales"
        ) {
          let localCrudo = textosFila[0];
          let divLocal = textosFila[1];
          let visitaCruda = textosFila[2];
          let divVisita = textosFila[3];
          // Como quitamos las columnas vacías, los goles están en la pos 4 y 5
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
