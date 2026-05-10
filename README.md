# AniTrack

Aplicación web para listar, filtrar y gestionar tu colección de anime.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Estructura de la página |
| `style.css` | Estilos |
| `app.js` | Lógica, conexión Supabase + Jikan API |
| `config.js` | **Tus credenciales de Supabase** |

---

## Configuración Supabase

El `config.js` ya tiene tus credenciales actuales:
```
SUPABASE_URL  = https://tpgzqjloeqydnidtcnro.supabase.co
SUPABASE_ANON_KEY = sb_publishable_T_LNcecSxmPOaWrzpEeOlw_DHTeTpnu
```

### SQL para crear la tabla (si aún no la has creado):
```sql
create table animes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  genre text,
  score numeric(4,1),
  status text default 'No visto',
  link text,
  descripcion text,
  created_at timestamp with time zone default now()
);
alter table animes enable row level security;
create policy "public access" on animes for all using (true) with check (true);
```

---

## Portadas automáticas (Jikan API)

Las portadas se obtienen automáticamente de MyAnimeList usando la API gratuita de Jikan.
- No requiere registro ni API key
- Se cachean en sessionStorage para no repetir peticiones
- Si no encuentra una portada, muestra las iniciales del título
- Rate limit: ~3 peticiones/segundo (la app lo gestiona sola)

---

## Despliegue en Vercel

1. Sube los 4 archivos a un repositorio de GitHub
2. En [vercel.com](https://vercel.com), importa el repositorio
3. Deploy en 30 segundos → URL pública con HTTPS

O arrastra la carpeta directamente a Vercel sin necesidad de GitHub.

---

## Importar datos del Excel

1. En tu Google Sheets, exporta la hoja como CSV (Archivo → Descargar → CSV)
2. Asegúrate de que las cabeceras sean: `name`, `genre`, `score`, `status`, `link`, `descripcion`
3. En Supabase → Table Editor → `animes` → Import data from CSV
