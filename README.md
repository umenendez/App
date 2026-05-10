# 🎌 Anime List — Guía de instalación

Aplicación web para gestionar tu biblioteca de anime con **Supabase** (base de datos gratuita) y **Vercel** (hosting gratuito).

---

## PASO 1 — Crear la base de datos en Supabase

1. Ve a **https://supabase.com** y crea una cuenta gratuita.
2. Haz clic en **"New project"**, elige nombre (ej: `animelist`) y una contraseña. Guarda bien esa contraseña.
3. Espera ~1 minuto a que se aprovisione el proyecto.
4. En el menú izquierdo ve a **SQL Editor** y ejecuta este SQL para crear la tabla:

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

-- Permite lectura y escritura pública (ajusta si quieres autenticación)
alter table animes enable row level security;
create policy "public access" on animes for all using (true) with check (true);
```

5. Ve a **Settings → API** y copia:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public key** (la clave larga bajo "Project API keys")

---

## PASO 2 — Configurar la aplicación

Abre el archivo **`config.js`** y rellena con tus datos:

```js
const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co';  // ← tu Project URL
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI';              // ← tu anon key
```

---

## PASO 3 — Importar tus datos del Excel (opcional)

En Supabase, ve a **Table Editor → animes → Import data** y sube un CSV.

El CSV debe tener estas columnas (puedes exportarlo desde Excel):

```
name,genre,score,status,link,desc
Naruto,Shonen,8.5,Visto,https://mal.net/...,Un ninja que sueña con ser Hokage.
One Piece,Aventura,9.0,Viendo,,La búsqueda del tesoro definitivo.
```

O bien usa la app para añadirlos uno a uno con el botón **"Añadir anime"**.

---

## PASO 4 — Subir a Vercel (hosting gratuito)

### Opción A — Desde GitHub (recomendada)

1. Sube la carpeta del proyecto a **GitHub** (crea un repo nuevo).
2. Ve a **https://vercel.com**, crea cuenta gratuita con tu GitHub.
3. Haz clic en **"Add New Project"**, selecciona tu repositorio.
4. No hace falta configurar nada más. Haz clic en **Deploy**.
5. En ~30 segundos tendrás una URL pública como `https://animelist-xxx.vercel.app`.

### Opción B — Arrastrando archivos

1. Ve a **https://vercel.com/new**
2. Arrastra la carpeta entera del proyecto
3. Vercel la despliega automáticamente

---

## PASO 5 — ¡Listo!

Tu app estará en `https://tu-proyecto.vercel.app` con:

- ✅ Base de datos real persistente en Supabase
- ✅ Hosting gratuito con HTTPS en Vercel
- ✅ Accesible desde cualquier dispositivo
- ✅ Sin límite de tiempo (plan gratuito de Supabase dura mientras haya actividad)

---

## Estructura de archivos

```
animelist/
├── index.html   → Estructura HTML
├── style.css    → Estilos (tema oscuro editorial)
├── config.js    → 🔑 TUS credenciales de Supabase (rellena esto)
├── app.js       → Lógica de la aplicación
└── README.md    → Esta guía
```

---

## Funcionalidades

| Función | Descripción |
|---|---|
| 📚 Biblioteca | Vista en cuadrícula o lista con filtros |
| 🔍 Búsqueda | Por título, género o descripción (Ctrl+K) |
| 🏷️ Filtros | Por estado y género en la barra lateral |
| 📊 Estadísticas | Gráficos de estado, géneros, puntuación media |
| ➕ Añadir | Formulario completo con todos los campos |
| ✏️ Editar | Click en cualquier tarjeta |
| 🗑️ Eliminar | Botón en hover sobre la tarjeta |
| 📱 Responsive | Funciona en móvil y escritorio |
