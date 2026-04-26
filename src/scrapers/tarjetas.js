const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

// 👇 MAGIA 1: Separar la coma con un espacio y capitalizar
function formatearNombre(nombreCompleto) {
  if (!nombreCompleto) return "";
  
  // Forzamos que haya exactamente un espacio después de la coma
  let nombre = nombreCompleto.replace(/,\s*/g, ', ');
  
  // Transformamos a Title Case
  return nombre.toLowerCase().replace(/(?:^|[\s,-])\w/g, function(match) {
      return match.toUpperCase();
  });
}

function limpiarTorneo(torneoCrudo) {
  if (!torneoCrudo) return "";
  return torneoCrudo.replace(/\?/g, 'ó').trim(); 
}

async function obtenerTarjetasDefinitivo() {
  console.log("🚀 Encendiendo Puppeteer para buscar Tarjetas...");

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  try {
    console.log("🌐 Entrando a la página oficial de SIFECH...");
    await page.goto("https://www.fchh.com.ar/sys/menu/menu.php", { waitUntil: "networkidle2" });

    console.log("⏳ Esperando 3 segundos a que el menú arranque...");
    await new Promise((r) => setTimeout(r, 3000));

    console.log("🖱️ Forzando la carga de la Tabla de Tarjetas...");
    const hizoClic = await page.evaluate(() => {
      const enlaceSecreto = document.querySelector('a[href*="grid_tabla_tarjetas"]');
      if (enlaceSecreto) {
        enlaceSecreto.click();
        return true;
      }
      return false;
    });

    if (!hizoClic) throw new Error("No encontré el enlace de tarjetas.");

    console.log("⏳ Esperando 6 segundos a que el Iframe de tarjetas cargue...");
    await new Promise((r) => setTimeout(r, 6000));

    let iframeTarjetas = null;
    for (const frame of page.frames()) {
      if (frame.url().includes("grid_tabla_tarjetas")) {
        iframeTarjetas = frame;
        break;
      }
    }

    if (!iframeTarjetas) throw new Error("No se encontró el Iframe de tarjetas.");

    console.log("🔓 Interactuando con el menú desplegable 'Ver X líneas'...");
    const paginacionExitosa = await iframeTarjetas.evaluate(() => {
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

    if (paginacionExitosa) {
        console.log("⏳ Esperando 8 segundos a que la tabla se expanda a 500 filas...");
        await new Promise((r) => setTimeout(r, 8000));
        for (const frame of page.frames()) {
          if (frame.url().includes("grid_tabla_tarjetas")) { iframeTarjetas = frame; break; }
        }
    } else {
        console.log("⚠️ No se encontró la paginación. Extrayendo lo visible...");
    }

    console.log("📥 ¡Tabla localizada! Extrayendo datos...");
    const html = await iframeTarjetas.content();
    const $ = cheerio.load(html);

    const tarjetasCrudas = [];
    let currentCategoria = "General";

    $("tr").each((i, fila) => {
      
      // 👇 MAGIA 2: Extractor "Todoterreno" de Categorías
      // Si la fila no es un jugador, revisamos si es un agrupador
      if (!$(fila).hasClass("scGridFieldOdd") && !$(fila).hasClass("scGridFieldEven")) {
          let tdsFila = [];
          $(fila).find("td").each((j, celda) => {
              let t = $(celda).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
              if (t !== "") tdsFila.push(t);
          });

          // Unimos todos los textos de la fila
          let textoFilaUnido = tdsFila.join(" ");
          
          // Si el texto empieza con "Categoria" (con o sin tilde)
          if (textoFilaUnido.match(/^Categor[ií]a/i)) {
              // Le quitamos la palabra Categoria y los dos puntos, y nos quedamos con el resto
              currentCategoria = textoFilaUnido.replace(/^Categor[ií]a\s*:?\s*/i, "").trim();
          }
      }

      // Extracción de los jugadores
      if ($(fila).hasClass("scGridFieldOdd") || $(fila).hasClass("scGridFieldEven")) {
        let textosFila = [];
        $(fila).find("td").each((j, celda) => {
            let texto = $(celda).text().replace(/\u00a0/g, " ").trim();
            if (texto !== "") textosFila.push(texto);
        });

        if (textosFila.length >= 6 && textosFila[1] !== "Nombre") {
          let jugadorCrudo = textosFila[1];
          let clubCrudo = textosFila[2];
          
          let torneoFila = textosFila[6] ? limpiarTorneo(textosFila[6]) : "Campeonato Oficial";

          let categoriaLimpia = diccionarioCategorias[currentCategoria] || currentCategoria;
          let equipoLimpio = diccionarioEquipos[clubCrudo.toUpperCase()] || formatearNombre(clubCrudo); 
          let jugadorLimpio = formatearNombre(jugadorCrudo);

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
    });

    console.log("🧹 Ordenando tarjetas (Rojas > Amarillas > Verdes)...");
    
    tarjetasCrudas.sort((a, b) => {
        if (b.roja !== a.roja) return b.roja - a.roja;
        if (b.amarilla !== a.amarilla) return b.amarilla - a.amarilla;
        return b.verde - a.verde;
    });

    console.log(`\n🎉 ¡EXTRACCIÓN FINALIZADA! Se leyeron ${tarjetasCrudas.length} jugadores con tarjetas.`);
    
    if (tarjetasCrudas.length > 0) {
        console.log("\n👉 Muestra del primer sancionado:");
        console.log(tarjetasCrudas[0]);
        
        await empujarTarjetasAWix(tarjetasCrudas);
    }

    await browser.close();
    return tarjetasCrudas;

  } catch (error) {
    console.error("💥 Error Crítico:", error.message);
    await browser.close();
  }
}

async function empujarTarjetasAWix(tarjetas) {
  // 👇 ACORDATE DE VERIFICAR LA URL
  const wixUrl = "https://federacionchaquena.wixstudio.com/fchh/_functions/subirTarjetas";

  console.log("\n📤 Preparando el paquete de Tarjetas y enviando a Wix...");

  try {
    const response = await fetch(wixUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: tarjetas }),
    });

    const textResponse = await response.text();

    try {
      const result = JSON.parse(textResponse);
      if (response.ok) {
        console.log("✅ ¡ÉXITO TOTAL! Wix recibió las tarjetas y respondió:");
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

obtenerTarjetasDefinitivo();