# Accounting CC2

App para llevar la contabilidad de gastos e ingresos de casa. Cada movimiento
se asigna a una persona (sin reparto). Incluye lectura de tickets/facturas con
Claude (extrae comercio, importe y el detalle de cada artículo: referencia,
color, material, modelo...) y una importación de CSV bancario con sugerencias
automáticas de categoría/persona.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind)
- Supabase (Postgres, Auth con Google, Storage para fotos de tickets)
- Claude (Anthropic API) para categorización y extracción de tickets/CSV

## 1. Configurar Supabase

1. En tu proyecto Supabase (`https://tlhzmalxscfmiyprsbbm.supabase.co`), ve a
   **SQL Editor** y ejecuta el contenido de `supabase/migrations/0001_init.sql`.
   Esto crea las tablas, las políticas de seguridad (RLS) y el bucket de
   Storage `receipts`.
2. Ve a **Authentication → Providers → Google** y actívalo (necesitas un
   Client ID/Secret de Google Cloud, ya los tienes configurados según nos
   dijiste).
3. En **Authentication → URL Configuration**, añade como Redirect URL:
   - `http://localhost:3000/auth/callback` (para desarrollo local)
   - `https://tu-dominio-en-produccion/auth/callback` (cuando despliegues)
4. Copia tu **anon/public key** desde **Project Settings → API** y pégala en
   `.env.local` en `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 2. Configurar Claude

Crea una API key en [console.anthropic.com](https://console.anthropic.com) y
ponla en `.env.local` en `ANTHROPIC_API_KEY`.

## 3. Acceso (allowlist)

Solo pueden iniciar sesión los emails listados en `ALLOWED_EMAILS` (separados
por coma), tanto en `.env.local` como en la tabla `allowed_emails` de Supabase
(el SQL de migración ya inserta los dos correos iniciales). Si añades una
persona nueva más adelante, actualiza ambos sitios.

## 4. Ejecutar en local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## 5. Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit: Accounting CC2"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

`.env.local` no se sube (está en `.gitignore`). Al desplegar (Vercel u otro),
configura las mismas variables de entorno del `.env.example` en el panel del
proveedor.

## Estructura

- `src/app/login` — login con Google
- `src/app/auth/callback` — intercambia el código de OAuth y valida la allowlist
- `src/app/dashboard` — movimientos, alta manual + ticket, importación CSV, reportes
- `src/app/api/claude/*` — llamadas server-side a Claude (la API key nunca se expone al navegador)
- `supabase/migrations/0001_init.sql` — esquema completo de la base de datos

## Pendiente / fase 2

- Conexión automática al banco (open banking, ej. GoCardless Bank Account
  Data) para sustituir la importación manual de CSV.
