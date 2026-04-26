const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

// Función para poner la primera letra en mayúscula 
function formatearNombre(nombreCompleto) {
  if (!nombreCompleto) return "";
  return nombreCompleto.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
      return match.toUpperCase();
  });
}

async function obtenerGoleadoresDefinitivo() {
  console.log("🚀 Encendiendo el navegador invisible (Puppeteer)...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  try {
    console.log("🌐 Entrando a la página oficial de SIFECH...");
    await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", {
      waitUntil: "networkidle2",
    });

    console.log("⏳ Esperando 3 segundos a que el menú arranque...");
    await new Promise((r) => setTimeout(r, 3000));

    console.log("🖱️ Disparando la función JavaScript oculta del menú...");

    const hizoClic = await page.evaluate(() => {
      const enlaceSecreto = document.querySelector(
        'a[href*="grid_tabla_goleadores"]',
      );
      if (enlaceSecreto) {
        enlaceSecreto.click();
        return true;
      }
      return false;
    });

    if (!hizoClic) {
      throw new Error("No encontré el enlace secreto en el HTML.");
    }

    console.log("⏳ Esperando 6 segundos a que el Iframe se actualice...");
    await new Promise((r) => setTimeout(r, 6000));

    console.log("🕵️‍♂️ Buscando la nueva tabla adentro del Iframe...");
    let iframeGoleadores = null;

    for (const frame of page.frames()) {
      if (frame.url().includes("grid_tabla_goleadores")) {
        iframeGoleadores = frame;
        break;
      }
    }

    if (!iframeGoleadores) {
      throw new Error("El clic funcionó, pero el Iframe no cambió a Goleadores.");
    }

    console.log("📥 ¡Tabla de Goleadores localizada! Extrayendo datos en crudo...");
    const html = await iframeGoleadores.content();
    const $ = cheerio.load(html);

    const goleadoresCrudos = [];
    const idsGuardados = new Set();
    let currentTorneo = "Campeonato Oficial";
    let currentCategoria = "General";

    $("tr").each((i, fila) => {
      const agrupadorTd = $(fila).find(".scGridBlockFont table tr td");
      if (agrupadorTd.length === 3) {
        let etiqueta = $(agrupadorTd[0]).text().trim();
        let valor = $(agrupadorTd[2]).text().trim();
        // Dejamos el torneo crudo, como viene del SIFECH
        if (etiqueta === "Torneo") currentTorneo = valor; 
        if (etiqueta === "Categoria") currentCategoria = valor;
      }

      if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
        let textosFila = [];
        $(fila).find("td").each((j, celda) => {
            let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
            if (texto !== "") textosFila.push(texto);
          });

        if (textosFila.length >= 4) {
          let jugCrudo = textosFila[1];
          let clubCrudo = textosFila[2]; // Equipo crudo, sin diccionario
          let golesCrudos = textosFila[textosFila.length - 1];

          if (jugCrudo !== "Jugador" && !isNaN(parseInt(golesCrudos))) {
            
            let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
            let equipoLimpio = clubCrudo; 
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

    console.log("🧹 Ordenando artilleros y calculando el Top 10 por Torneo y Categoría...");
    const goleadoresAgrupados = {};

    goleadoresCrudos.forEach(jugador => {
        // 👇 LA MAGIA ACÁ: Creamos una llave única que junta Torneo + Categoría
        let llaveGrupo = `${jugador.torneo}|${jugador.categoria}`;

        if (!goleadoresAgrupados[llaveGrupo]) {
            goleadoresAgrupados[llaveGrupo] = [];
        }
        goleadoresAgrupados[llaveGrupo].push(jugador);
    });

    let goleadoresTop10 = [];

    for (const llave in goleadoresAgrupados) {
        let jugadoresCat = goleadoresAgrupados[llave];

        // Ordenamos por goles de mayor a menor dentro de su grupo específico
        jugadoresCat.sort((a, b) => b.goles - a.goles);

        // Cortamos en 10
        let top10 = jugadoresCat.slice(0, 10).map((jugador, index) => {
            jugador.posicion = index + 1; 
            return jugador;
        });

        goleadoresTop10 = goleadoresTop10.concat(top10);
    }

    console.log(`\n🎉 ¡EXTRACCIÓN FINALIZADA! Se enviarán ${goleadoresTop10.length} goleadores a Wix.`);
    
    if (goleadoresTop10.length > 0) {
      // Enviamos a Wix
      await empujarGoleadoresAWix(goleadoresTop10);
    }

    await browser.close();
    return goleadoresTop10;

  } catch (error) {
    console.error("💥 Error Crítico:", error.message);
    await browser.close();
  }
}

async function empujarGoleadoresAWix(goleadores) {
  const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirGoleadores";

  console.log("\n📤 Enviando datos a Wix...");

  try {
    const response = await fetch(wixUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: goleadores }),
    });

    const textResponse = await response.text();

    try {
      const result = JSON.parse(textResponse);
      if (response.ok) {
        console.log("✅ ¡ÉXITO TOTAL! Base de datos actualizada.");
      } else {
        console.error("❌ Wix rechazó el paquete. Razón:", result);
      }
    } catch (error) {
      console.error("❌ El servidor de Wix falló internamente. Respuesta:", textResponse);
    }
  } catch (error) {
    console.error("❌ Error de red al intentar conectar con Wix:", error.message);
  }
}

obtenerGoleadoresDefinitivo();