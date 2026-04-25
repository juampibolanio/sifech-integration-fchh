require('dotenv').config();
const cheerio = require('cheerio');
const fs = require('fs');

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

async function loginSifech() {
    const loginUrl = 'https://www.fchh.com.ar/sys/app_Login/app_Login.php';
    const menuUrl = 'https://www.fchh.com.ar/sys/back_menu/back_menu.php';

    try {
        console.log("🔐 Iniciando proceso de Login automático...");

        const getRes = await fetch(loginUrl, { 
            method: "GET",
            headers: { "User-Agent": USER_AGENT }
        });
        
        let cookie = actualizarCookies('', getRes.headers.getSetCookie());
        const html = await getRes.text();
        const $ = cheerio.load(html);
        
        const params = new URLSearchParams();
        
        $('form[name="F1"] input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).val() || '';
            if (name && name !== 'sc_sai_seg') { 
                params.append(name, value);
            }
        });
        
        params.set('nm_form_submit', '1');
        params.set('nmgp_opcao', 'alterar');
        params.set('bok', 'OK');
        params.set('login', process.env.SIFECH_USER);
        params.set('pswd', process.env.SIFECH_PASS);

        console.log("⏳ Enviando credenciales...");
        const postRes = await fetch(loginUrl, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": cookie,
                "User-Agent": USER_AGENT,
                "Referer": loginUrl
            },
            body: params.toString(),
            redirect: "manual" 
        });

        cookie = actualizarCookies(cookie, postRes.headers.getSetCookie());

        const resultHtml = await postRes.text();
        const $result = cheerio.load(resultHtml);
        
        const formRedir = $result('form[name="Fredir"]');

        if (formRedir.length === 0) {
            fs.writeFileSync('error_login_debug.html', resultHtml);
            throw new Error("❌ El login rebotó. Se guardó 'error_login_debug.html'.");
        }

        console.log("✅ Credenciales aceptadas. Ejecutando redirección al menú...");

        const redirParams = new URLSearchParams();
        formRedir.find('input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).val() || '';
            if (name) {
                redirParams.append(name, value);
            }
        });

        const menuRes = await fetch(menuUrl, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": cookie,
                "User-Agent": USER_AGENT,
                "Referer": loginUrl
            },
            body: redirParams.toString(),
            redirect: "manual"
        });

        cookie = actualizarCookies(cookie, menuRes.headers.getSetCookie());

        console.log("✅ Login completado al 100%. ¡Llave maestra generada!");
        return cookie;

    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

module.exports = { loginSifech };