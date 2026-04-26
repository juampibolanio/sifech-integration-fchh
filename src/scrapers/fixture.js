const cheerio = require("cheerio");
const fs = require("fs");
const { loginSifech } = require("../auth/sifechLogin");
const { diccionarioCategorias, diccionarioEquipos, diccionarioCanchas } = require("../utils/diccionarios");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function actualizarCookies(cookiesViejas, nuevasCookiesRaw) {
  if (!nuevasCookiesRaw || nuevasCookiesRaw.length === 0) return cookiesViejas;
  const mapaCookies = new Map();
  if (cookiesViejas) {
      cookiesViejas.split(';').forEach(par => {
          const [key, ...val] = par.trim().split('=');
          if (key) mapaCookies.set(key, val.join('='));
      });
  }
  nuevasCookiesRaw.forEach(c => {
      const par = c.split(';')[0].trim();
      const [key, ...val] = par.split('=');
      if (key) mapaCookies.set(key, val.join('='));
  });
  return Array.from(mapaCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function obtenerFixture() {
  const urlBase = "https://www.fchh.com.ar";
  const urlGrid = urlBase + "/sys/grid_torneos_fechas/grid_torneos_fechas.php";

  try {
    console.log("🔑 Obteniendo sesión fresca...");
    let cookie = await loginSifech();

    console.log("🕵️‍♂️ Entrando a la tabla de Fixture para obtener el token...");
    const resGrid = await fetch(urlGrid, {
      method: "GET",
      headers: { 
          "cookie": cookie,
          "User-Agent": USER_AGENT,
          "Referer": "https://www.fchh.com.ar/sys/back_menu/back_menu.php"
      },
    });

    cookie = actualizarCookies(cookie, resGrid.headers.getSetCookie());

    const htmlGrid = await resGrid.text();
    const $grid = cheerio.load(htmlGrid);

    let scriptCaseInit = '';
    $grid('input[name="script_case_init"]').each((i, el) => {
        const val = $grid(el).val();
        if (val && val.trim() !== '') {
            scriptCaseInit = val;
        }
    });

    if (!scriptCaseInit) {
      fs.writeFileSync('error_grid_debug.html', htmlGrid);
      throw new Error("❌ No se encontró el token válido. Se guardó 'error_grid_debug.html' para investigar.");
    }
    
    console.log(`🎯 Token de seguridad obtenido: ${scriptCaseInit}`);

    console.log("⏳ Pidiendo al servidor que arme el CSV de todos los partidos...");
    const dataExport = `nmgp_chave=&nmgp_opcao=csv&nmgp_ordem=&SC_lig_apl_orig=grid_torneos_fechas&nmgp_parm_acum=&nmgp_quant_linhas=&nmgp_url_saida=&nmgp_parms=SC_null&nmgp_tipo_pdf=grid&nmgp_outra_jan=&nmgp_orig_pesq=&SC_module_export=&script_case_init=${scriptCaseInit}`;

    const resExport = await fetch(urlGrid, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cookie": cookie,
        "User-Agent": USER_AGENT,
        "Referer": urlGrid
      },
      body: dataExport,
    });

    cookie = actualizarCookies(cookie, resExport.headers.getSetCookie());

    const htmlGenerando = await resExport.text();
    const $export = cheerio.load(htmlGenerando);
    const rutaCSV = $export('form[name="Fview"]').attr("action");

    if (!rutaCSV) {
      fs.writeFileSync('error_export_debug.html', htmlGenerando);
      throw new Error("❌ No se encontró la ruta del CSV. Se generó 'error_export_debug.html'.");
    }

    const urlDescarga = urlBase + rutaCSV;
    console.log("✅ Archivo temporal detectado en:", urlDescarga);

    console.log("📥 Descargando CSV y decodificando a JSON...");
    const resCSV = await fetch(urlDescarga, {
      method: "GET",
      headers: { 
          "cookie": cookie,
          "User-Agent": USER_AGENT,
          "Referer": urlGrid
      },
    });

    const arrayBuffer = await resCSV.arrayBuffer();
    const textoCSV = new TextDecoder("iso-8859-1").decode(arrayBuffer);

    const partidos = [];
    const lineas = textoCSV.split("\n");

    // 👇 NUEVA MAGIA: Limpieza de datos (ETL) 👇
    for (let linea of lineas) {
      if (linea.trim() === "") continue;
      const columnas = linea.replace(/"/g, "").split(";");

      if (columnas.length >= 10 && columnas[4] && columnas[4] !== "Local") {
        
        // 1. Extraemos los datos crudos del CSV
        let fechaCruda = columnas[1].trim(); 
        let canchaCruda = columnas[2].trim();
        let catCruda = columnas[3].trim();
        let localCrudo = columnas[4].trim();
        let visitaCruda = columnas[6].trim();

        // 2. Transformamos la Fecha y Hora
        let partesFecha = fechaCruda.split(" ");
        let diaLimpio = partesFecha[0]; 
        let horaLimpia = partesFecha[1] ? partesFecha[1] : "A definir"; // Si no hay hora, atajamos el error

        // 3. Traducimos usando los diccionarios
        let canchaLimpia = diccionarioCanchas[canchaCruda] || canchaCruda;
        let categoriaLimpia = diccionarioCategorias[catCruda] || catCruda;
        let localLimpio = diccionarioEquipos[localCrudo] || localCrudo;
        let visitaLimpia = diccionarioEquipos[visitaCruda] || visitaCruda;

        // 4. Guardamos el objeto final y prolijo
        partidos.push({
          numero_fecha: columnas[0].trim(),
          dia_fecha: diaLimpio,      // Actualizado
          hora: horaLimpia,          // NUEVO DATO
          cancha: canchaLimpia,      // Actualizado
          categoria: categoriaLimpia,// Actualizado
          equipo_local: localLimpio, // Actualizado
          division_local: columnas[5].trim(),
          equipo_visitante: visitaLimpia, // Actualizado
          division_visitante: columnas[7].trim(),
          estado: columnas[9].trim(),
        });
      }
    }

    console.log(`🎉 ¡Misión cumplida! Se extrajeron ${partidos.length} partidos de forma 100% autónoma.`);
    
    // Un console.log rápido del primer partido para verificar que quedó lindo
    if (partidos.length > 0) {
        console.log("👉 Ejemplo del primer partido extraído:", partidos[0]);
    }

    return partidos;

  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

module.exports = { obtenerFixture };

// Este bloque de prueba solo se ejecuta si corrés este archivo directamente en la terminal con "node".
// Si lo importás desde otro archivo para usarlo, esto se ignora mágicamente.
if (require.main === module) {
    obtenerFixture()
        .then(() => console.log("🏁 Prueba de ejecución directa finalizada."))
        .catch(error => console.error("💥 Error en la prueba:", error));
}