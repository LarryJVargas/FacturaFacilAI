# 📄 FacturaFácil AI

Aplicación web para procesar peticiones de facturación en lenguaje natural, extraer información estructurada mediante IA y almacenarla en una base de datos relacional de Supabase.

## 🚀 Tecnologías utilizadas

- **Frontend:** Next.js (React), Tailwind CSS
- **Backend / Edge Functions:** Supabase Edge Functions (Deno / TypeScript)
- **Base de datos & Auth:** Supabase PostgreSQL, Row Level Security (RLS), Google OAuth
- **IA:** Google Gemini API (`gemini-3.6-flash`)

## 🔑 Configuración del Entorno

Asegúrate de configurar los siguientes secretos en tu proyecto de Supabase Edge Functions:

- `GEMINI_API_KEY`: Clave de API de Google AI Studio / Google Cloud.