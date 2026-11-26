# TRUECALO — *Si te interesa, cámbialo*

Plataforma web de **trueque y segunda vida** para que las personas intercambien o regalen objetos que ya no usan y conecten con su comunidad sin gastar dinero.

## Características principales

- **Catálogo interactivo**: Búsqueda en tiempo real, filtros por categoría, modalidad (*Trueque* o *Regalo*) y disponibilidad.
- **Publicación de objetos**: Sube fotos desde tu equipo o pega una URL, indica el estado del objeto y qué buscas a cambio.
- **Propuestas de trueque y chat**: Ofrece uno de tus objetos publicados o coordina por mensaje, acepta/rechaza propuestas y marca entregas como completadas.
- **Registro de por vida (20 € pago único)**: Página dedicada en `/registro` con creación de cuenta (`POST /api/register`) y hash seguro de contraseñas con `crypto.scryptSync`.
- **SEO completo**: Metadatos Open Graph / Twitter Card, JSON-LD (`WebSite` y `Product` por cada `/objeto/:id`), `/robots.txt` y `/sitemap.xml` dinámico.
- **Cookies RGPD + Google AdSense**: Banner y modal de preferencias de cookies, páginas legales (`/privacidad`, `/cookies`, `/terminos`, `/contacto`), `public/ads.txt` y carga condicional de AdSense.

## Puesta en marcha

```bash
npm install
npm start
```

La aplicación se inicia en `http://localhost:3000`. Los datos se persisten automáticamente en `data/db.json` (con datos iniciales de ejemplo la primera vez).

## Configurar Google AdSense

Sustituye el identificador de ejemplo `ca-pub-0000000000000000` (y `pub-0000000000000000` en `public/ads.txt`) por tu ID real de editor en:
- `public/index.html`
- `public/app.js`
- `public/ads.txt`
