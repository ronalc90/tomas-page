# Plan de Tomás · Python y SQL

Plataforma para que Tomás (Costa Rica) aprenda Python, POO, estructuras de datos y SQL entre el **27 de septiembre y el 30 de diciembre de 2026**, con unas 4 horas de estudio al día: 64 días de lunes a viernes (sin los feriados de Costa Rica), cada uno con dos temas (concepto, ejemplo, consejo, guía paso a paso y errores comunes), agenda del día, 5 tareas con pista, reto extra con solución, glosario con tooltips, enlaces para seguir estudiando y una evaluación de 8 preguntas de cuatro tipos con pistas y retroalimentación por opción; un entregable cada sábado con guía y criterios; un temario navegable; y 11 guías generales (instalar, terminal, errores, depurar, Git, DB Browser, dónde seguir estudiando, POO en una página…). Incluye un panel de administración para seguir el avance, revisar entregas, editar el contenido y gestionar cuentas.

| | |
|---|---|
| **Contenido** | 62 talleres (concepto, ejemplo verificado, 3 tareas y 4 preguntas), 15 entregables con criterios, 5 fases: Fundamentos → Datos en Python → SQL → Python + SQL |
| **Estudiante** | Tablero de avance, calendario por colores, taller del día, evaluación calificada en el servidor, entregables con evidencia y comentarios del revisor |
| **Administración** | Resumen con métricas y actividad, detalle por estudiante, cola de revisión (aprobar o pedir cambios), editor de talleres y preguntas, usuarios y ajustes |
| **Stack** | React 19 + Vite + TypeScript · Fastify 5 + Drizzle ORM · PostgreSQL 16 · Railway |

## Dos formas de publicarlo

| | GitHub Pages (en línea hoy) | Railway (servidor + PostgreSQL) |
|---|---|---|
| Dirección | https://ronalc90.github.io/tomas-page/ | la que asigne Railway |
| Dónde viven los datos | En el navegador de quien usa la página | En PostgreSQL, compartidos entre equipos |
| Panel de administración | Ve los datos de ese navegador; para revisar el trabajo de Tomás desde otro equipo se usa **Mi cuenta → Copia de seguridad** | Ve a todos los estudiantes en tiempo real |
| Evaluaciones | Se califican en el navegador | Se califican en el servidor (las respuestas nunca llegan al navegador antes de presentar) |

Es la misma aplicación: la versión de GitHub Pages se compila con `VITE_DATA_MODE=local` y atiende la API dentro del navegador (`apps/web/src/local/`), con las mismas reglas y validaciones que el servidor. Cuando el proyecto de Railway esté activo, el CI despliega también allá.

**Cuentas de la versión GitHub Pages:** `tomas` / `1234`, `admin` / `admin-tomas-2026` y la cuenta de prueba `prueba` / `prueba123` (para explorar sin tocar el avance de Tomás; se puede desactivar en **Administración → Usuarios**). Cada navegador empieza con estas cuentas; cambia la contraseña del administrador en **Mi cuenta**.

## Arquitectura

```
apps/
  web/        React + React Router + TanStack Query (la interfaz)
  api/        Fastify + Drizzle: API REST, sesiones, reglas de avance; sirve la web compilada
    drizzle/  migraciones SQL versionadas
packages/
  shared/     tipos, validaciones (zod), reglas de avance y fechas, usados por web y API
    src/data/plan.json     contenido del plan (lecciones completas, evaluaciones y entregables)
    src/data/guides.json   guías generales (instalar, terminal, errores, depurar, Git…)
e2e/          pruebas de punta a punta con Playwright
```

Un solo servicio sirve la API (`/api/*`) y la aplicación web, así no hay problemas de CORS ni cookies entre dominios. Al arrancar, el servidor aplica las migraciones pendientes y carga el contenido y las cuentas iniciales si no existen.

### Decisiones importantes

- **Las evaluaciones se califican en el servidor.** Cuatro tipos de pregunta (opción múltiple, verdadero/falso, «¿qué muestra?» y completar código); las reglas de calificación viven en `packages/shared/src/quiz.ts`. Las respuestas correctas nunca viajan al navegador antes de presentar; después de cada intento llega la revisión con explicación, comentario por opción y respuesta correcta. Se guardan todos los intentos y las pistas usadas: el panel muestra la mejor nota, la del primer intento, las pistas y si hizo el reto.
- **Un taller está completo** cuando las tres tareas están marcadas y la evaluación está aprobada (nota mínima configurable, por defecto 5 de 8). Lo que tiene fecha anterior a hoy y no está completo queda **atrasado**. "Hoy" se calcula en la zona horaria de Costa Rica.
- **Las reglas de avance viven en `packages/shared/src/progress.ts`**, así el estudiante y el administrador ven exactamente lo mismo.
- **Sesiones con cookie `httpOnly`, `SameSite=Lax` y `Secure`** en producción; en la base solo se guarda el hash del token. Contraseñas con bcrypt. Límite de intentos de inicio de sesión por IP y usuario. Cabeceras de seguridad con Helmet (CSP estricta).
- **Las ediciones del administrador se respetan:** el contenido inicial solo se carga si la base está vacía. Para recargarlo a propósito: `npm run db:seed -- --reset-content`. Cuando cambia la estructura del plan (`CONTENT_VERSION` en `apps/api/src/db/seed.ts`), al arrancar se reemplaza el contenido conservando el avance de los estudiantes.

## Cuentas iniciales

Se crean la primera vez que arranca el servidor, con las variables `SEED_*`:

| Usuario | Rol | Contraseña |
|---|---|---|
| `tomas` | Estudiante | `SEED_STUDENT_PASSWORD` (en producción: `1234`) |
| `admin` | Administrador | `SEED_ADMIN_PASSWORD` (variable secreta en Railway) |
| `prueba` | Estudiante de prueba | `SEED_TEST_PASSWORD` (en desarrollo: `prueba123`; en producción solo se crea si defines la variable) |

Si una cuenta ya existe, su contraseña no se toca. Las contraseñas se cambian desde **Mi cuenta** o desde **Administración → Usuarios**.

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
npm install
cp .env.example .env            # ajusta DATABASE_URL
createdb tomas_dev
export $(grep -v '^#' .env | xargs)
npm run dev                      # migra, carga datos y abre API (3000) + web (5173)
```

Abre http://localhost:5173. Para ver el plan como si fuera otro día, define `FAKE_TODAY=2026-10-15` (se ignora en producción).

## Pruebas

```bash
createdb tomas_test && createdb tomas_e2e
npm run lint        # ESLint
npm run typecheck   # TypeScript en los tres paquetes
npm test            # Vitest: API contra PostgreSQL real + componentes de la web
npm run build
npm run e2e         # Playwright: flujos completos de estudiante y administrador (escritorio y celular)
npm run build:pages && npm run e2e:pages   # versión sin servidor (GitHub Pages)
```

Las pruebas de la API crean una base limpia (`tomas_test`) con las migraciones reales. Las de punta a punta levantan el servidor compilado con una base propia (`tomas_e2e`).

## CI/CD

`.github/workflows/ci-cd.yml` corre en cada push y pull request:

1. **Calidad y pruebas:** lint, tipos, pruebas con PostgreSQL 16, compilación y Playwright.
2. **Imagen Docker:** construye la imagen de producción, la arranca contra PostgreSQL y verifica `/api/health`.
3. **Versión GitHub Pages:** compila la versión sin servidor y la prueba con Playwright.
4. **Publicar en GitHub Pages:** solo en `main`, si todo lo anterior pasó; publica y comprueba que la página responde.
5. **Desplegar en Railway:** solo en `main` y solo cuando la variable `RAILWAY_SERVICE` existe en GitHub. Sube el código con `railway up`, espera la compilación y comprueba que `/api/health` responde con la versión (commit) recién desplegada.

Configuración que usa el despliegue (en GitHub → Settings):

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `RAILWAY_TOKEN` | Token de proyecto de Railway (entorno `production`) |
| Variable | `RAILWAY_SERVICE` | Nombre del servicio de la app en Railway |
| Variable | `APP_URL` | URL pública, por ejemplo `https://tomas-page-production.up.railway.app` |

## Railway

Proyecto con dos servicios: **PostgreSQL** y la **app** (compilada con el `Dockerfile`; `railway.json` define la verificación de salud en `/api/health`).

Variables de la app:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base) |
| `NODE_ENV` | `production` |
| `SEED_STUDENT_PASSWORD` | `1234` |
| `SEED_ADMIN_PASSWORD` | una contraseña larga y secreta |

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · `/password` | Sesión y cambio de contraseña |
| GET | `/api/auth/me` | Usuario actual (204 si no hay sesión) |
| GET | `/api/plan` · `/api/progress` | Estructura del plan y avance calculado |
| GET | `/api/days/:fecha` | Taller, entregable o festivo de una fecha |
| PUT | `/api/days/:fecha/progress` | Tareas y evidencia |
| POST | `/api/days/:fecha/quiz` | Presentar la evaluación |
| GET/PUT | `/api/deliverables[/:id]` | Entregables y borrador |
| POST | `/api/deliverables/:id/submit` · `/withdraw` | Enviar o retirar |
| GET | `/api/admin/overview` · `/students[/:id]` | Resumen y detalle |
| GET/POST | `/api/admin/reviews[/:userId/:id]` | Cola y decisión de revisión |
| GET/PUT | `/api/admin/content` · `/days/:fecha` · `/deliverables/:id` | Editar contenido |
| GET/POST/PATCH | `/api/admin/users[/:id][/password]` | Cuentas |
| GET/PUT | `/api/admin/settings` | Nota mínima y nombre del programa |
| GET | `/api/health` | Estado del servidor y la base, con la versión |
