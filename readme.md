# Integración SIFECH - Wix

Servicio de integración para la Federación Chaqueña de Hockey. Obtiene información de torneos desde SIFECH, normaliza nombres y categorías, y la envía a las funciones HTTP del sitio de la Federación en Wix.

## Qué sincroniza

- Fixture de partidos
- Resultados
- Tablas de posiciones
- Tabla de goleadores (hasta 10 por torneo y categoría)
- Tarjetas por jugador

Los scrapers usan Puppeteer y Cheerio para navegar o procesar las tablas de SIFECH. Los diccionarios de [src/data/diccionarios.js](src/data/diccionarios.js) unifican nombres de equipos, categorías y canchas antes de enviar los registros.

## Requisitos

- Node.js 20.18.1 o posterior (se recomienda Node.js 22).
- pnpm.
- Credenciales de SIFECH para la extracción del fixture.
- Una clave propia para proteger los endpoints de sincronización.

## Instalación

Cloná el repositorio e instalá las dependencias:

```bash
git clone <URL_DEL_REPOSITORIO>
cd sifech-integration-fchh
pnpm install
```

Puppeteer descarga y utiliza Chromium. En algunos servidores Linux puede ser necesario instalar las bibliotecas del sistema que Chromium requiera.

## Configuración

Creá un archivo `.env` en la raíz del proyecto:

```dotenv
PORT=3000
API_KEY=reemplazar-por-una-clave-aleatoria-y-segura
SIFECH_USER=usuario-de-sifech
SIFECH_PASS=contraseña-de-sifech
```

- `PORT`: puerto HTTP del servicio. Si no se define, se usa `3000`.
- `API_KEY`: clave exigida por todas las rutas bajo `/api/sync`.
- `SIFECH_USER` y `SIFECH_PASS`: credenciales utilizadas por el login automático del scraper de fixture.

No compartas ni subas `.env` al repositorio. El archivo está excluido por `.gitignore`.

## Ejecución

Iniciá el servidor:

```bash
pnpm start
```

Al arrancar, el servicio escucha en `http://localhost:3000` (o en el puerto configurado). La ruta `/` sirve como comprobación básica de disponibilidad.

### Ejecutar una sincronización por HTTP

Las rutas de sincronización aceptan la clave mediante el encabezado `x-api-key` o el parámetro `key`. Se recomienda usar el encabezado para evitar incluir la clave en la URL:

```bash
curl --header "x-api-key: reemplazar-por-una-clave-segura" \
  http://localhost:3000/api/sync/fixture
```

Reemplazá `fixture` por cualquiera de las rutas de la tabla:

| Método | Ruta | Acción |
| --- | --- | --- |
| `GET` | `/api/sync/fixture` | Extrae y envía el fixture |
| `GET` | `/api/sync/resultados` | Extrae y envía los resultados |
| `GET` | `/api/sync/posiciones` | Extrae y envía las posiciones |
| `GET` | `/api/sync/goleadores` | Extrae y envía los goleadores |
| `GET` | `/api/sync/tarjetas` | Extrae y envía las tarjetas |
| `GET` | `/api/sync/todo` | Inicia las cinco sincronizaciones en secuencia |

Las rutas individuales esperan a que termine su proceso antes de responder. `/api/sync/todo` responde inmediatamente y continúa en segundo plano; si ya hay una sincronización global en curso, responde con HTTP `429`. Revisá los logs del servidor para seguir el proceso y confirmar el resultado del envío a Wix.

### Ejecutar una sincronización desde Node.js

También se puede iniciar cada proceso directamente, sin levantar el servidor:

```bash
node subirFixture.js
node subirResultados.js
node subirPosiciones.js
node subirGoleadores.js
node subirTarjetas.js
```

## Datos enviados a Wix

Cada proceso envía una petición `POST` con `Content-Type: application/json` a la función correspondiente del sitio Wix. El cuerpo contiene una propiedad `data` con un arreglo de registros:

```json
{
  "data": [
    {
      "torneo": "Campeonato",
      "categoria": "1ra Fem."
    }
  ]
}
```

Los campos varían según el tipo de información:

- **Fixture:** `numero_fecha`, `dia_fecha`, `hora`, `cancha`, `categoria`, `equipo_local`, `division_local`, `equipo_visitante`, `division_visitante` y `estado`.
- **Resultados:** `torneo`, `numero_fecha`, `categoria`, `dia_fecha`, `hora`, `equipo_local`, `goles_local`, `equipo_visitante` y `goles_visitante`.
- **Posiciones:** `torneo`, `categoria`, `equipo`, `posicion`, `puntos`, `pj`, `pg`, `pe`, `pp`, `gf`, `gc` y `dg`.
- **Goleadores:** `torneo`, `categoria`, `posicion`, `jugador`, `equipo` y `goles`.
- **Tarjetas:** `torneo`, `categoria`, `jugador`, `equipo`, `verde`, `amarilla` y `roja`.

## Estructura del proyecto

```text
.
├── server.js                 # API HTTP y orquestación de sincronizaciones
├── subirFixture.js           # Extracción y envío del fixture
├── subirResultados.js        # Extracción y envío de resultados
├── subirPosiciones.js        # Extracción y envío de posiciones
├── subirGoleadores.js        # Extracción y envío de goleadores
├── subirTarjetas.js          # Extracción y envío de tarjetas
└── src/
    ├── auth/
    │   └── sifechLogin.js    # Login automático en SIFECH
    ├── data/
    │   └── diccionarios.js   # Normalización de categorías, equipos y canchas
    └── scrapers/             # Scrapers específicos para cada tipo de dato
```

## Desarrollo y diagnóstico

- Los scrapers imprimen el progreso y los errores en la salida del proceso.
- Algunos scrapers pueden guardar archivos `debug_*.html` o `error_*_debug.html` en la raíz si necesitan inspeccionar una respuesta de SIFECH. Estos archivos pueden contener contenido de sesión o datos operativos: no los publiques.
- El comando `pnpm test` todavía no ejecuta pruebas; el script actual es un placeholder.

## Dependencias principales

- [Express](https://expressjs.com/) para exponer la API.
- [Puppeteer](https://pptr.dev/) para automatizar el navegador.
- [Cheerio](https://cheerio.js.org/) para analizar HTML.
- [dotenv](https://github.com/motdotla/dotenv) para cargar configuración local desde `.env`.
