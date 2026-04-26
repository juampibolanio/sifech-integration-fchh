const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs"); // Agregamos esto para crear el archivo de diagnóstico
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

function formatearNombre(nombreCompleto) {
  if (!nombreCompleto) return "";
  return nombreCompleto.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
      return match.toUpperCase();
  });
}

function limpiarTorneo(torneoCrudo) {
  if (!torneoCrudo) return "";
  return torneoCrudo.replace(/\?/g, 'ó').trim(); 
}

async function obtenerPosicionesDefinitivo() {
  console.log("🚀 Encendiendo Puppeteer para buscar Posiciones...");

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  try {
    console.log("🌐 Entrando a la página oficial de SIFECH...");
    await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });

    console.log("⏳ Esperando 3 segundos a que el menú arranque...");
    await new Promise((r) => setTimeout(r, 3000));

    console.log("🖱️ Forzando la carga de la Tabla de Posiciones...");
    const hizoClic = await page.evaluate(() => {
      const enlaceSecreto = document.querySelector('a[href*="grid_tabla_posiciones"]');
      if (enlaceSecreto) {
        enlaceSecreto.click();
        return true;
      }
      return false;
    });

    if (!hizoClic) throw new Error("No encontré el enlace de posiciones.");

    console.log("⏳ Esperando 6 segundos a que el Iframe de posiciones cargue...");
    await new Promise((r) => setTimeout(r, 6000));

    let iframePosiciones = null;
    for (const frame of page.frames()) {
      if (frame.url().includes("grid_tabla_posiciones")) {
        iframePosiciones = frame;
        break;
      }
    }

    if (!iframePosiciones) throw new Error("No se encontró el Iframe de posiciones.");

    // 👇 LA SOLUCIÓN HUMANA: Usamos el desplegable visual de la página 👇
    console.log("🔓 Interactuando con el menú desplegable 'Ver X líneas'...");
    const paginacionExitosa = await iframePosiciones.evaluate(() => {
        let selectPag = document.querySelector('select[name="nmgp_quant_linhas"]');
        if (selectPag) {
            // Creamos la opción 500 y se la agregamos al menú
            let opt = document.createElement('option');
            opt.value = "500";
            opt.innerHTML = "500";
            selectPag.appendChild(opt);
            
            // La seleccionamos
            selectPag.value = "500";
            
            // Simulamos que el usuario hizo el cambio con el mouse
            selectPag.dispatchEvent(new Event('change'));
            return true;
        }
        return false;
    });

    if (!paginacionExitosa) {
        console.log("⚠️ No se encontró el desplegable de paginación. Intentando extraer lo que haya...");
    } else {
        console.log("⏳ Esperando 8 segundos a que la tabla se expanda a 500 filas...");
        await new Promise((r) => setTimeout(r, 8000));
        
        // Volvemos a enganchar el Iframe por si la página lo recargó internamente
        for (const frame of page.frames()) {
          if (frame.url().includes("grid_tabla_posiciones")) {
            iframePosiciones = frame;
            break;
          }
        }
    }

    console.log("📥 ¡Tabla localizada! Extrayendo datos...");
    const html = await iframePosiciones.content();
    
    // Guardamos el HTML para revisarlo si algo sale mal
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

    console.log("🧹 Ordenando equipos por Puntos y asignando Puestos reales...");
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

    console.log(`\n🎉 ¡EXTRACCIÓN FINALIZADA! Se leyeron ${posicionesFinal.length} posiciones en total.`);
    
    if (posicionesFinal.length > 0) {
        console.log("\n👉 Muestra del Primer Puesto Formateado:");
        console.log(posicionesFinal[0]);

        await empujarPosicionesAWix(posicionesFinal);
    }

    await browser.close();
    return posicionesFinal;

  } catch (error) {
    console.error("💥 Error Crítico:", error.message);
    await browser.close();
  }
}

async function empujarPosicionesAWix(posiciones) {
  // 👇 ACORDATE DE PONER TU URL REAL DE WIX ACÁ
  const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirPosiciones";

  console.log("\n📤 Preparando el paquete de Posiciones y enviando a Wix...");

  try {
    const response = await fetch(wixUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: posiciones }),
    });

    const textResponse = await response.text();

    try {
      const result = JSON.parse(textResponse);
      if (response.ok) {
        console.log("✅ ¡ÉXITO TOTAL! Wix recibió las posiciones y respondió:");
        console.log(result);
      } else {
        console.error("❌ Wix rechazó el paquete. Razón:", result);
      }
    } catch (error) {
      console.error("❌ El servidor de Wix falló internamente. Respuesta:", textResponse);
    }
  } catch (error) {
    console.error("❌ Error de red al conectar con Wix:", error.message);
  }
}

obtenerPosicionesDefinitivo();