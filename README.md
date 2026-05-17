# Decor AI — Monorepo

Expo **mobile** app + Express **backend** that processes **AutoCAD DXF** floor plans (via a **Kaggle** GPU notebook), uploads room renders to **WorldLabs Marble**, and creates **navigable 3D worlds** from text + images.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/` | Express + TypeScript API, Drizzle ORM, Better Auth, WorldLabs + CAD HTTP clients |
| `mobile/` | Expo (React Native) client |
| `notebooks/Pre-Phase AI.ipynb` | **Kaggle** notebook: DXF pipeline, ControlNet/SD, Flask `/process` + **ngrok** tunnel |

---

## Product features (detailed)

Decor AI is a **design-to-3D** product: users describe a space (from **photos** or a **DXF floor plan**), Marble builds a **3D Gaussian-splat world**, and the app streams **SPZ** data for an in-app viewer. Features below map to **`mobile/app`**, **`backend/src`**, and **`notebooks/`**.

### Mobile (Expo Router)

| Area | What users can do | Notes / screens |
|------|-------------------|-----------------|
| **Onboarding & session** | Sign up, sign in, sign out | `(auth)/login`, `(auth)/signup`, Better Auth session via `apiFetch` + cookies |
| **Password recovery** | Request reset email, set new password | `(auth)/forgot-password`, root `reset-password.tsx`; HTTPS **bridge** opens the app (`/reset-mobile-bridge`) |
| **Email verification** | Complete verify link from email | `verify-email-callback.tsx`; bridge **`/verify-email-mobile-bridge`** for mail clients |
| **Home** | Choose **Photo** vs **CAD DXF** input; pick **room type**, **style**, **palette**; free-text **instructions** (limits differ by mode) | `(tabs)/index.tsx`; step-gated UI; **DocumentPicker** (multi-select photos, single DXF flow) |
| **CAD / DXF** | Upload **.dxf** → backend calls Kaggle **`/process`** → returns **rooms** with previews | `POST /api/cad-jobs/process`; navigates to **`room-picker/[jobId]`** |
| **Room picker** | See **room list** + **previews**; pick one room → its **`media_asset_id`** drives generation | `room-picker/[jobId].tsx`; optional reload via **`GET /api/cad-jobs/:jobId/rooms`** |
| **Photo upload** | Pick **1–4 images** → **`POST /api/uploads`** (preview-only or stored Marble assets per body) | Used to obtain **`media_asset_ids`** for **`POST /api/generations`** |
| **World generation** | Start Marble **world** with **prompt**, **`media_asset_ids`**, **`input_mode`** (`photo` / `cad_dxf`), **`quality`** (draft/full), optional **`cad_options`** | **`POST /api/generations`**; rate-limited on backend |
| **Job progress** | Poll **operation** until Marble finishes or fails | **`GET /api/operations/:operationId`**; `result/[operationId].tsx` |
| **3D viewer** | Open **world** by id; load **SPZ** splats (quality tiers) inside a WebView | `model-view/[worldId].tsx`; **`GET /api/worlds/:worldId`**, **`GET /api/worlds/:worldId/spz/:quality`** (binary proxy) |
| **My Projects (gallery)** | List saved **projects**; tie names to **world** / **generation** metadata | `(tabs)/gallery.tsx`; **`GET /api/projects`**, **`POST /api/projects`**, **`DELETE /api/projects/:id`** |
| **Profile** | Account-facing actions (e.g. sign out, preferences as implemented) | `(tabs)/profile.tsx` |

### Backend API

| Area | Capability |
|------|------------|
| **Security & abuse** | **Helmet**, **CORS** (`env.corsOrigins`), **global rate limit** (200 / 15 min), **per-route** limiter on **create generation**; **`HttpError`** + central **`errorHandler`** |
| **Auth** | **`/auth/*`** forwarded to **Better Auth**; **`requireAuth`** + **`requireUser`** on **`/api/*`** |
| **Uploads** | **Multipart** images or DXF; DXF may run through **CAD pipeline** first, then **Marble** `prepare_upload` + **PUT** |
| **CAD jobs** | Persist **`cad_jobs`** + **`room_results`**; store **`preview_png_b64`** + **`media_asset_id`** per room |
| **Generations** | **Marble `worlds:generate`**; store **`generations`** + **`uploaded_assets`**; **`world_id`** + **`spz_urls`** synced when operation completes |
| **Worlds & SPZ** | **Proxy** SPZ bytes (pick URL from DB or Marble); **resolve** generation by **`world_id`** / project / operation |
| **Projects** | CRUD-style listing and creation with optional **`spz_urls`** snapshot |
| **Bridges** | HTML endpoints so email clients hit **HTTPS** first, then deep-link into the app |
| **Config** | **`env.ts`** (Zod): DB, Marble, CAD URL, auth URL, Resend, CORS, etc. |

### Kaggle notebook pipeline

| Feature | Detail |
|---------|--------|
| **DXF ingestion** | **ezdxf**, floor visualization, room extraction |
| **Text / layout hints** | **EasyOCR** (incl. Arabic labels in notebook data) |
| **Control image** | **Canny** edges per room crop |
| **Rendering** | **ControlNet** + **Realistic Vision** SD pipeline |
| **Service** | **Flask** **`POST /process`**, **`GET /health`** |
| **Public URL** | **ngrok** tunnel for **`CAD_PIPELINE_URL`** |

### Feature map (by product pillar)

```mermaid
flowchart TB
  subgraph identity["Identity & mail"]
    I1[Sign up / login / session]
    I2[Forgot password + reset bridge]
    I3[Verify email + bridge]
  end

  subgraph inputs["Spatial inputs"]
    IN1["Photo mode: 1 to 4 images"]
    IN2["CAD mode: DXF upload"]
    IN3["Style palette room type instructions"]
  end

  subgraph compute["External compute"]
    K1["Kaggle: DXF OCR Canny SD"]
    M1["Marble: media assets worlds operations"]
  end

  subgraph core["Core journey"]
    C1["Room picker CAD only"]
    C2["POST generations Marble"]
    C3["Poll operations sync DB"]
    C4["3D viewer SPZ proxy"]
  end

  subgraph persist["Persistence"]
    P1["Postgres users generations projects cad_jobs room_results"]
  end

  IN2 --> K1
  IN1 & IN2 --> M1
  K1 --> C1
  IN1 --> C2
  C1 --> C2
  C2 --> C3
  C3 --> C4
  C2 & C3 & C4 --> M1
  C3 & C4 --> P1
  identity --> core
  inputs --> core
```

### Feature dependency (stack view)

```mermaid
flowchart LR
  subgraph client["Expo client"]
    UI[Home Gallery Profile Auth flows]
    VP[Splat WebView]
  end

  subgraph api["Express API"]
    AUTH[/auth Better Auth/]
    REST[/api resources/]
  end

  subgraph data["Data plane"]
    DB[(PostgreSQL)]
  end

  subgraph gpu["GPU / 3D vendor"]
    KG[Kaggle Flask CAD]
    WL[WorldLabs Marble]
  end

  UI --> AUTH
  UI --> REST
  REST --> DB
  REST --> KG
  REST --> WL
  VP --> REST
  REST --> WL
```

---

## Authentication flow (cookies & session)

Better Auth runs at **`/auth`** (`basePath: "/auth"` in `middleware/better-auth.ts`). Sessions are stored in **Postgres** (Better Auth’s tables via the same `pg` **`pool`** as Drizzle). The API enforces identity with **`auth.api.getSession({ headers })`**, which reads the **`Cookie`** header the client sends.

### What is the session cookie?

On **successful sign-in** (or sign-up), Better Auth issues **`Set-Cookie`** response header(s) for the session. The exact **cookie name(s)** and **format** are defined by Better Auth (versioned); they are **opaque** to application code. What matters in this repo:

- **Web (Expo web):** the **browser cookie jar** on the **API origin** (`EXPO_PUBLIC_API_URL` / `BETTER_AUTH_URL` host) stores these cookies. They are sent automatically on same-origin or CORS requests when **`credentials: "include"`** is used.
- **Native (iOS / Android):** **`@better-auth/expo`** + **`expoClient`** stores the cookie string in **Expo SecureStore** (encrypted device storage). **`apiFetch`** reads it via **`authClient.getCookie()`** and sets the request header **`Cookie: ...`** manually (see `mobile/lib/api.ts`).

Cookies are typically **`HttpOnly`** (not readable from JS on web) for security; only the **browser** or the **Expo plugin** manages the value.

### Session lifetime (this project)

From `better-auth.ts`:

- **`session.expiresIn`**: **30 days** — absolute ceiling for session validity (sliding behavior follows Better Auth rules).
- **`session.updateAge`**: **24 hours** — how often the session “touches” / refreshes server-side when active.

Optional **`emailVerification`**, **`revokeSessionsOnPasswordReset`**, and **`trustedOrigins`** affect when cookies are accepted or invalidated.

### CORS + credentials (Express)

`server.ts` enables **`credentials: true`** on CORS and allows the **`Cookie`** header so browsers may send cookies to **`/auth`** and **`/api`**. **`trustedOrigins`** (see `env.ts`) lists **web origins**, **`BETTER_AUTH_URL`** origin, **`decor-ai://`**, and **`exp://…`** in development so Better Auth accepts those clients.

### Protected **`/auth`** requests

`routes/authRoutes.ts` forwards every **`/auth/*`** call to **`authController.handleAuthRequest`**, which rebuilds a **`fetch` Request** to **`auth.handler`**, copying incoming **`req.headers`** (including **`Cookie`**) into the Web `Headers` object. The handler’s response is written back to Express, with **`Set-Cookie`** lines forwarded via **`res.append`** (Better Auth may emit more than one cookie).

The mobile app uses the **same** **`baseURL`** and **`basePath`** as in `mobile/lib/auth-client.ts`.

### Protected API routes

`requireAuth` forwards **`req.headers`** as `Headers` into **`getSession`**. If a valid session cookie is present → **`req.user`** and **`req.authSession`** are set → **`requireUser`** in controllers.

### Diagram — sign-in and first API call (web vs native)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client Web or Expo native
  participant Auth as Better Auth /auth
  participant DB as Postgres session store
  participant API as Protected /api

  C->>Auth: POST sign-in sign-up body JSON
  Auth->>DB: insert validate session
  Auth-->>C: 200 Set-Cookie session cookie

  Note over C: Web browser cookie jar Native SecureStore via expoClient

  C->>API: GET or POST with Cookie header
  Note right of C: Web uses credentials include Native sets Cookie from getCookie credentials omit

  API->>Auth: getSession incoming Headers
  Auth->>DB: load session by cookie
  Auth-->>API: user and session
  API-->>C: 200 protected JSON
```

### Diagram — cookie path overview

```mermaid
flowchart TB
  subgraph issue["Session issued"]
    A1[POST /auth/sign-in or sign-up]
    A2[Better Auth creates session in DB]
    A3[Set-Cookie on response]
    A1 --> A2 --> A3
  end

  subgraph storeWeb["Storage — Expo web"]
    W1[Browser cookie jar for API host]
    W2["fetch credentials include"]
    A3 --> W1
    W1 --> W2
  end

  subgraph storeNative["Storage — iOS Android"]
    N1[expo SecureStore via expoClient]
    N2["authClient.getCookie → Header Cookie"]
    N3["fetch credentials omit"]
    A3 --> N1
    N1 --> N2 --> N3
  end

  subgraph use["Using the session"]
    B1[requireAuth → getSession Cookie]
    B2["req.user req.authSession"]
    W2 --> B1
    N3 --> B1
    B1 --> B2
  end
```

### Email links and bridges

Password reset and verify-email emails point at **HTTPS** URLs. **`/reset-mobile-bridge`** and **`/verify-email-mobile-bridge`** run **without** a session cookie in the mail client; they redirect into the **native app scheme** (`decor-ai://`) so the app can complete the flow on **`reset-password`** or **`verify-email-callback`** screens.

---

## Prerequisites

On any PC that runs this stack:

- **Node.js** 20+ (LTS recommended) and npm
- **PostgreSQL** (e.g. [Neon](https://neon.tech) serverless) — URL goes in `DATABASE_URL`
- **WorldLabs Marble** API key — [WorldLabs](https://worldlabs.ai)
- **Kaggle** account (free GPU sessions) — for DXF → rooms + 2D renders
- **ngrok** free account + auth token — so your laptop/phone can reach the notebook’s Flask server over HTTPS

Optional: **Resend** for production email (password reset / verify-email); dev can stay minimal per `backend/.env.example`.

---

## Quick start (local)

### 1. Clone and install

```bash
git clone <your-fork-or-repo-url>
cd decor-ai
npm install --prefix backend
npm install --prefix mobile
```

### 2. Backend environment

```bash
cd backend
cp .env.example .env     # macOS / Linux / Git Bash
# Windows (cmd/PowerShell): copy .env.example .env
```

Fill at least:

- `DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` (e.g. `http://localhost:4000`)
- `WORLDLABS_API_KEY`
- `CAD_PIPELINE_URL` — **after** you start the Kaggle notebook (see below); can be empty until you test CAD

### 3. Database migrations

From `backend/`:

```bash
npm run db:migrate
# If you need baselining on an existing DB, see package.json script `db:migrate:safe`
```

### 4. Run the API

From repo **root**:

```bash
npm run dev:backend
```

Health: [http://localhost:4000/health](http://localhost:4000/health)  
JSON API: mounted under **`/api/*`**. Auth routes: **`/auth`**.

### 5. Mobile app

```bash
cd mobile
cp .env.example .env
# Windows: copy .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to the same host/port as `BETTER_AUTH_URL` (for a **physical device**, use your PC’s **LAN IP**, e.g. `http://192.168.1.42:4000`, not `localhost`).

From repo root:

```bash
npm run dev:mobile
npm run android   # or: npm run ios / npm run web
```

---

## Kaggle notebook + ngrok (CAD pipeline)

The backend **does not** run Stable Diffusion or parse DXF locally. It forwards DXF bytes to the notebook’s **`POST /process`** endpoint.

### Notebook cell order (`notebooks/Pre-Phase AI.ipynb`)

1. **Dependencies** — installs `ezdxf`, EasyOCR, diffusers, Flask, `pyngrok`, OpenCV, etc.
2. **Cell 1** — defines `run_pipeline()` (DXF → rooms, Canny edges, ControlNet + Realistic Vision).
3. **Cell 2** — loads GPU models + defines **Flask** app with:
   - `GET /health`
   - `POST /process` (multipart field **`dxf_file`**, form fields `area_m2`, `style`, `palette`)
4. **Next cell** — starts **ngrok** on port **5000**, prints  
   `CAD_PIPELINE_URL=https://….ngrok-free.app`  
   then runs `app.run(host="0.0.0.0", port=5000)`.

   *(If the API returns “start … Cell C”, that refers to this **ngrok + Flask** cell: keep it running.)*

### What you must do on another PC

1. Upload or sync **`Pre-Phase AI.ipynb`** to **Kaggle** (or run locally with GPU + public tunnel — same idea).
2. Create an **ngrok account** and copy your **authtoken** from [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
3. In the **ngrok + Flask** cell, set **`NGROK_TOKEN`** to your token (**never commit real tokens** to git).
4. Run cells in order; keep the **last running cell** alive (Flask + tunnel). If Kaggle stops the session (~30 minutes on free tier), the URL changes — update **`CAD_PIPELINE_URL`** and restart the backend.
5. Paste the printed base URL into **`backend/.env`**:

   ```env
   CAD_PIPELINE_URL=https://xxxx.ngrok-free.app
   CAD_PIPELINE_TIMEOUT_MS=180000
   ```

6. Restart **`npm run dev:backend`**.  
   Test from the PC: `curl <CAD_PIPELINE_URL>/health` should return JSON `status: ok`.

### Contract with the backend

The Express client (`backend/src/clients/cadPipeline.ts`) calls:

`POST {CAD_PIPELINE_URL}/process`

- **multipart** file field: **`dxf_file`**
- **form fields**: `area_m2`, `style`, `palette`

Success JSON shape (simplified): `{ "rooms": [ { "id", "name", "generated_image_b64", … } ] }`  
Errors: `{ "error": "…" }` → backend surfaces as 5xx / error message.

---

## API surface (high level)

All routes below are **under** `/api` except **`/auth`** and bridge pages at server root.

| Mount | Resource |
|-------|----------|
| `/api/uploads` | Image (and DXF-through-pipeline) uploads, Marble `prepare_upload` |
| `/api/cad-jobs` | `POST /process` (DXF job), `GET /:jobId/rooms` |
| `/api/generations` | Start Marble world generation |
| `/api/operations` | Poll Marble operation + sync `generations` row |
| `/api/worlds` | World metadata |
| `/api/projects` | User projects |

Authentication: **`router.use(requireAuth)`** on protected routers; session via **Better Auth** (cookies / Expo client).

---

## API design (detailed)

Design style: **resource-oriented HTTP API** on **`/api/*`**, plus **Better Auth** on **`/auth/*`**. Bodies are **JSON** unless noted (multipart upload, SPZ binary). Validation uses **Zod** schemas in **`backend/src/validation/*.ts`**. Responses on error are generally JSON with an **`error`** field (and sometimes **`details`**) via **`sendControllerError`** / **`errorHandler`**.

### Endpoint map (implemented routes)

| Method | Path | Auth | Request body / params | Notes |
|--------|------|------|------------------------|--------|
| **GET** | `/health` | No | — | Liveness JSON (`status`, `timestamp`, `service`). |
| **GET** | `/reset-mobile-bridge` | No | Query (bridge tokens / redirect params) | HTML → deep link to app (`MOBILE_APP_SCHEME`). |
| **GET** | `/verify-email-mobile-bridge` | No | Query | Same pattern for email verification. |
| **ALL** | `/auth/*` | Session cookie for session routes; none for sign-in | **JSON** on POST-like methods | Proxied to **Better Auth** `auth.handler` (`basePath` **`/auth`**). |
| **POST** | `/api/uploads` | **Yes** (`requireAuth`) | **multipart/form-data**: field **`file`**; validated **JSON** fields alongside (`uploadBodySchema`) | Max **20 MB**; images and **.dxf**; returns preview or Marble **`media_asset_id`**. |
| **GET** | `/api/generations` | **Yes** | — | Paginated list cap in service (e.g. last 50 generations for user). |
| **POST** | `/api/generations` | **Yes** + **generationCreateLimiter** | **JSON** `generateBodySchema` (`prompt`, `media_asset_ids`, `quality`, `input_mode`, `cad_options`, …) | **201** `{ operation_id, generation_id }`; calls Marble **`worlds:generate`**. |
| **GET** | `/api/operations/:operationId` | **Yes** | `operationId` opaque string max 512 (params) | Returns Marble **operation** JSON; may **sync** `generations` (`world_id`, `spz_urls`, status). |
| **GET** | `/api/worlds/:worldId/spz/:quality` | **Yes** | Params: **`quality`** ∈ `100k` \| `500k` \| `full_res`; query **`operationId`** optional | **Binary SPZ** (`Content-Type` from upstream); **`X-SPZ-Quality`** header. **Register before** `/:worldId` in router. |
| **GET** | `/api/worlds/:worldId` | **Yes** | `worldId` string | Marble **world** JSON; ownership via **`resolveGenerationForWorld`**. |
| **GET** | `/api/projects` | **Yes** | — | `{ projects }` for current user. |
| **POST** | `/api/projects` | **Yes** | **JSON** `createProjectSchema` | **201** project row. |
| **DELETE** | `/api/projects/:id` | **Yes** | `id` **UUID** | **204** on success. |
| **POST** | `/api/cad-jobs/process` | **Yes** | **multipart**: **`dxf_file`**; **JSON** fields `area_m2`, `style`, `palette` (`cadProcessBodySchema`) | Max **30 MB** DXF; **503** if `CAD_PIPELINE_URL` unset; **201** process response with rooms. |
| **GET** | `/api/cad-jobs/:jobId/rooms` | **Yes** | `jobId` **UUID** | Job status + room list (mapper); **403** if job not owned by user. |

**CORS** (from `server.ts`): **`credentials: true`**, methods **GET, POST, PUT, DELETE, OPTIONS**, allowed headers include **`Cookie`**, **`Authorization`**, **`Content-Type`**. **Global** rate limit: **200** requests / **15** minutes per IP.

---

### Diagram — HTTP surface (groups)

```mermaid
flowchart TB
  subgraph public["No session required"]
    H[GET /health]
    RB[GET /reset-mobile-bridge]
    VB[GET /verify-email-mobile-bridge]
  end

  subgraph ba["Better Auth basePath /auth"]
    AX[ALL /auth/* → authController → auth.handler]
  end

  subgraph api["Bearer path: Cookie session"]
    direction TB
    subgraph uploads["/api/uploads"]
      U1["POST / multipart file + body"]
    end
    subgraph generations["/api/generations"]
      G1[GET / list]
      G2["POST / JSON + rate limit"]
    end
    subgraph operations["/api/operations"]
      O1["GET /:operationId"]
    end
    subgraph worlds["/api/worlds"]
      W1["GET /:worldId/spz/:quality query operationId"]
      W2["GET /:worldId"]
    end
    subgraph projects["/api/projects"]
      P1[GET /]
      P2[POST /]
      P3["DELETE /:id"]
    end
    subgraph cad["/api/cad-jobs"]
      C1["POST /process multipart"]
      C2["GET /:jobId/rooms"]
    end
  end

  Client([Mobile / web / tools])
  Client --> public
  Client --> ba
  Client --> api
```

---

### Diagram — request pipeline (`/api/*` only)

How a protected API request moves through **`createApp`** and a resource router (conceptual; order matches `server.ts` + each `routes/*.ts`).

```mermaid
flowchart LR
  subgraph edge["Edge — server.ts"]
    E1[helmet]
    E2["cors + credentials"]
    E3["rateLimit 200 per 15 min"]
    E4["express.json 25mb + urlencoded"]
    E5[morgan]
    E1 --> E2 --> E3 --> E4 --> E5
  end

  subgraph match["Routing"]
    M1{path}
    M1 -->|/api| API[createApiRouter]
  end

  E5 --> M1

  subgraph guard["Resource router"]
    R1[requireAuth — Cookie → getSession]
    R2["validateBody | validateParams | validateQuery"]
    R3[multer — uploads + cad process only]
    R4["generationCreateLimiter — POST generations only"]
    R1 --> R2
    R2 --> R3
    R2 --> R4
  end

  API --> R1

  subgraph app["Application"]
    C[controller]
    S[service]
    CL[clients worldlabs cadPipeline]
    DB[(Drizzle Postgres)]
    C --> S
    S --> CL
    S --> DB
  end

  R2 --> C
  R3 --> C
  R4 --> C

  subgraph exit["Response"]
    X1[JSON or binary SPZ]
    X2[errorHandler on throw]
    C --> X1
    C --> X2
  end
```

---

### Diagram — resource relationships (API view)

What each **primary resource** identifies in downstream systems (not full ERD; see **Database ERD** below).

```mermaid
flowchart TB
  subgraph identifiers["IDs clients see"]
    MID[media_asset_id — Marble]
    OID[operation_id — Marble async job]
    WID[world_id — Marble world]
    JID[job_id — Postgres cad_jobs.uuid]
    GID[generation_id — Postgres generations.uuid]
    PID[project_id — Postgres projects.uuid]
  end

  subgraph flow["Typical linking"]
    JID --> MID
    MID --> OID
    OID --> WID
    GID --> OID
    GID --> WID
    WID --> PID
  end
```

---

## User flows (mobile + backend)

End-to-end journeys for the **Expo** app (tabs, file picker, room picker, result, 3D viewer) and how they call **`/auth`** and **`/api/*`**. Arrows are **happy paths**; errors surface as alerts / API messages.

### Main journey map

```mermaid
flowchart TB
  subgraph entry["App entry"]
    A0([Open Decor AI])
    A1{Session valid?}
    A2["Auth stack: login / signup / forgot password / verify email"]
    A0 --> A1
    A1 -->|No| A2
    A2 --> A1
    A1 -->|Yes| H[Home tab: configure room type, style, palette, instructions]
  end

  subgraph mode["Choose how to drive the world"]
    H --> M{Input mode?}
    M -->|Photo| P1[Pick 1–4 images — document / gallery]
    M -->|CAD DXF| C1[Pick .dxf floor plan]
  end

  subgraph photo["Photo path"]
    P1 --> P2["POST /api/uploads — multipart file + options"]
    P2 --> P3["Response: media_asset_ids — Marble image assets"]
    P3 --> H
  end

  subgraph cad["CAD path"]
    C1 --> C2["POST /api/cad-jobs/process — dxf_file + area_m2, style, palette"]
    C2 --> C3["DB: insert cad_jobs pending stub — then Kaggle → rooms + renders"]
    C3 --> C4["Upload each room PNG to Marble → media_asset_id per room"]
    C4 --> C5["End: transaction INSERT room_results + UPDATE cad_jobs done totalRooms"]
    C5 --> C6["Response: job_id + rooms with preview + media_asset_id"]
    C6 --> RP[Room picker: select a room]
    RP --> C7["Optional: GET /api/cad-jobs/:jobId/rooms — reload list"]
    C7 --> H
  end

  subgraph generate["Start 3D world — same screen after CAD or photo"]
    H --> G0{Have reference image ids or CAD room chosen?}
    G0 -->|Ready| G1["POST /api/generations — prompt, media_asset_ids, input_mode, quality, cad_options"]
    G1 --> G2["201: operation_id + generation_id"]
    G2 --> RES[Result screen]
  end

  subgraph poll["Wait for Marble"]
    RES --> L1["Poll GET /api/operations/:operationId"]
    L1 --> L2{"done and no error?"}
    L2 -->|No| L1
    L2 -->|Yes| L3["DB synced: world_id + spz_urls"]
    L3 --> MV[Open 3D viewer — model-view]
  end

  subgraph view["View splats"]
    MV --> V1["GET /api/worlds/:worldId — metadata"]
    MV --> V2["GET /api/worlds/:worldId/spz/:quality?operationId=… — SPZ binary via proxy"]
    V1 --> Done([Explore world])
    V2 --> Done
  end

  subgraph gallery["Gallery / projects"]
    Done -.->|Optional| Gtab[Gallery tab]
    Gtab --> GL["GET /api/projects"]
    GL --> GP{Save this world?}
    GP -->|POST /api/projects| GDB[(projects + spz_urls snapshot)]
  end
```

### Sequence — CAD → room → world → SPZ (detail)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant App as Mobile app
  participant API as Backend API
  participant KG as Kaggle CAD Flask
  participant WL as WorldLabs Marble
  participant DB as Postgres

  U->>App: Pick .dxf + options
  App->>API: POST /api/cad-jobs/process — cookie session
  API->>DB: insert cad_jobs — pending stub
  Note right of DB: userId status originalFileName areaMqInput
  API->>KG: multipart dxf_file + form fields
  KG-->>API: rooms JSON + base64 images
  loop Each room render
    API->>WL: prepare_upload + PUT PNG
    WL-->>API: media_asset_id
  end
  API->>DB: transaction — persist rooms and complete job
  Note right of DB: INSERT room_results UPDATE cad_jobs status done totalRooms
  API-->>App: job_id, rooms[]

  U->>App: Select room → Continue
  App->>API: POST /api/generations — cad_dxf + media_asset_ids[0] + prompt
  API->>WL: worlds:generate
  WL-->>API: operation_id
  API->>DB: insert generations, uploaded_assets
  API-->>App: operation_id, generation_id

  loop Until done
    App->>API: GET /api/operations/:operationId
    API->>WL: get operation
    WL-->>API: progress / world payload
    API->>DB: update generations — world_id, spz_urls when complete
    API-->>App: Marble operation JSON
  end

  U->>App: Open 3D viewer
  App->>API: GET /api/worlds/:worldId/spz/full_res
  API->>DB: resolve generation / spz_urls
  API->>WL: fetch SPZ URL if needed
  API-->>App: SPZ bytes
```

### Auth and email bridges

```mermaid
flowchart LR
  subgraph account["Account lifecycle"]
    S[Signup / Login] --> BA["/auth/* — Better Auth"]
    BA --> Cookie[Session cookie — Expo client]
    F[Forgot password email] --> Link[HTTPS link — often /reset-mobile-bridge]
    Link --> Bridge[Backend sets deep link]
    Bridge --> AppReset[App opens reset-password]
    V[Verify email email] --> VLink[/verify-email-mobile-bridge]
    VLink --> AppVerify[verify-email-callback screen]
  end
```

### Legend

| Layer | Responsibility |
|--------|----------------|
| **Mobile** | File pickers, form state, `apiFetch` with credentials, navigation (`room-picker/[jobId]`, `result/[operationId]`, `model-view/[worldId]`). |
| **Backend** | AuthZ, validation, orchestration; **does not** run SD/DXF math — **Kaggle** does for CAD. |
| **DB** | Jobs, rooms, generations, **SPZ URL map** (not the SPZ file itself). |

---

## API layer detail (routes → controllers → services)

Flow: **Express `Router`** (`routes/*.ts`) applies **middleware** (`requireAuth`, `multer`, `validateBody` / `validateParams` / `validateQuery`, rate limits) → **controller** (`controllers/*.ts`) parses `req` / calls **`sendControllerError`** on failure → **service** (`services/**/*.ts`) orchestrates **DB** (`db/client`, `schema`), **clients** (`clients/worldlabs/*`, `clients/cadPipeline.ts`), and **mappers** (`mappers/*`).

### Other server entry points (not under `/api`)

| HTTP | Path | Handler | Role |
|------|------|---------|------|
| GET | `/health` | inline in `server.ts` | Liveness JSON |
| GET | `/reset-mobile-bridge` | `resetBridgeController` | Password-reset deep link → app scheme |
| GET | `/verify-email-mobile-bridge` | `verifyEmailBridgeController` | Email verification → app |
| ALL | `/auth/*` | `authRoutes` → **`authController.handleAuthRequest`** | Proxies to **Better Auth** `auth.handler` (sessions, sign-in, OAuth, etc.) — **no** `services/` module |

### Protected API — route → controller → service

| Method | Full path | Middleware (typical order) | Controller | Service(s) | External / persistence |
|--------|-----------|---------------------------|------------|------------|------------------------|
| POST | `/api/uploads/` | `requireAuth` → `multer.single("file")` → `validateBody(uploadBodySchema)` | `uploadsController.postUpload` | **`processUpload`** | **WorldLabs** `prepareUpload` + `uploadFileToSignedUrl`; optional **CAD** `convertDxfViaCadPipeline` for `.dxf` |
| GET | `/api/generations/` | `requireAuth` | `generationsController.listGenerations` | **`listGenerationsForUser`** | **Postgres** `generations` |
| POST | `/api/generations/` | `requireAuth` → **`generationCreateLimiter`** → `validateBody(generateBodySchema)` | `generationsController.postGenerate` | **`createWorldGeneration`** | **WorldLabs** `generateWorld`; **Postgres** `generations`, `uploaded_assets` |
| GET | `/api/operations/:operationId` | `requireAuth` → `validateParams(operationIdParamSchema)` | `operationsController.getOperationById` | **`getOperationWithGenerationSync`** | **WorldLabs** `getOperation`, `getWorld`; **Postgres** `generations` update on sync |
| GET | `/api/worlds/:worldId/spz/:quality` | `requireAuth` → `validateParams` + `validateQuery(spzQuerySchema)` | **`spzController.getWorldSpz`** | **`proxyWorldSpzAsset`** | **`resolveGenerationForWorld`** + **WorldLabs** + HTTP fetch of SPZ blob |
| GET | `/api/worlds/:worldId` | `requireAuth` → `validateParams(worldIdParamSchema)` | `worldsController.getWorldDetail` | **`getWorldDetailForUser`** | **`resolveGenerationForWorld`** + **WorldLabs** `getWorld` |
| GET | `/api/projects/` | `requireAuth` | `projectsController.getProjects` | **`listProjectsForUser`** | **Postgres** `projects` |
| POST | `/api/projects/` | `requireAuth` → `validateBody(createProjectSchema)` | `projectsController.postProject` | **`createProjectForUser`** | **Postgres** `projects`, `generations` lookup |
| DELETE | `/api/projects/:id` | `requireAuth` → `validateParams(projectIdParamSchema)` | `projectsController.deleteProject` | **`deleteProjectForUser`** | **Postgres** `projects` |
| POST | `/api/cad-jobs/process` | `requireAuth` → `multer.single("dxf_file")` → `validateBody(cadProcessBodySchema)` | `cadJobsController.postCadProcess` (+ **`isCadPipelineConfigured`** check) | **`processCadDxfJob`** | **CAD HTTP** `convertDxfViaCadPipeline`; **WorldLabs** upload per room; **Postgres** `cad_jobs`, `room_results` |
| GET | `/api/cad-jobs/:jobId/rooms` | `requireAuth` → `validateParams(cadJobIdParamSchema)` | `cadJobsController.getCadRooms` | **`getCadJobRoomsForUser`** + **`mappers/cadJobRooms`** | **Postgres** `cad_jobs`, `room_results` |

> **Route ordering:** In `worldsRoutes`, **`/:worldId/spz/:quality`** is registered **before** **`/:worldId`** so `spz` is not parsed as a world id.

### Diagram — mounts and handlers

```mermaid
flowchart TB
  subgraph uploads["/api/uploads"]
    UR[uploadsRoutes]
    UC[uploadsController.postUpload]
    US[services/uploads/processUpload]
    UR --> UC --> US
  end

  subgraph gen["/api/generations"]
    GR[generationsRoutes]
    GL[generationsController.listGenerations]
    GP[generationsController.postGenerate]
    GLS[services/worlds/worldService.listGenerationsForUser]
    GCG[services/generations/createGeneration]
    GR --> GL --> GLS
    GR --> GP --> GCG
  end

  subgraph ops["/api/operations"]
    OR[operationsRoutes]
    OC[operationsController.getOperationById]
    OS[services/operations/operationService.getOperationWithGenerationSync]
    OR --> OC --> OS
  end

  subgraph worlds["/api/worlds"]
    WR[worldsRoutes]
    WC[worldsController.getWorldDetail]
    WS[services/worlds/worldService.getWorldDetailForUser]
    SC[spzController.getWorldSpz]
    SS[services/spz/proxyWorldSpz]
    WR --> WC --> WS
    WR --> SC --> SS
  end

  subgraph proj["/api/projects"]
    PR[projectsRoutes]
    PCG[projectsController.getProjects]
    PCP[projectsController.postProject]
    PCD[projectsController.deleteProject]
    PSL[listProjectsForUser]
    PSC[createProjectForUser]
    PSD[deleteProjectForUser]
    PR --> PCG --> PSL
    PR --> PCP --> PSC
    PR --> PCD --> PSD
  end

  subgraph cad["/api/cad-jobs"]
    CR[cadJobsRoutes]
    CP[cadJobsController.postCadProcess]
    CG[cadJobsController.getCadRooms]
    CPS[services/cadJobs/processDxfJob]
    CGR[services/cadJobs/getCadJobRooms]
    CR --> CP --> CPS
    CR --> CG --> CGR
  end

  subgraph authn["/auth"]
    AR[authRoutes ALL /*]
    AH[authController.handleAuthRequest]
    BA[better-auth handler]
    AR --> AH --> BA
  end
```

### Diagram — services to integrations (downstream)

`getWorldDetailForUser` and `proxyWorldSpzAsset` both call **`resolveGenerationForWorld`** (DB) before talking to Marble.

```mermaid
flowchart LR
  subgraph services["Key services"]
    PU[processUpload]
    CGN[createWorldGeneration]
    OWS[getOperationWithGenerationSync]
    GWD[getWorldDetailForUser]
    RGW[resolveGenerationForWorld]
    PWS[proxyWorldSpzAsset]
    PDJ[processCadDxfJob]
    GCR[getCadJobRoomsForUser]
    PSL[listProjectsForUser]
    PSC[createProjectForUser]
    PSD[deleteProjectForUser]
  end

  subgraph clients["HTTP clients"]
    WL[clients/worldlabs]
    CAD[clients/cadPipeline]
  end

  subgraph data["Data"]
    PG[(Postgres / Drizzle)]
    MAP[mappers/cadJobRooms]
  end

  PU --> WL
  PU --> CAD
  CGN --> WL
  CGN --> PG
  OWS --> WL
  OWS --> PG
  GWD --> RGW
  GWD --> WL
  RGW --> PG
  PWS --> RGW
  PWS --> WL
  PDJ --> CAD
  PDJ --> WL
  PDJ --> PG
  GCR --> PG
  GCR --> MAP
  PSL --> PG
  PSC --> PG
  PSD --> PG
```

---

## Database ERD

Schema source: `backend/src/db/schema.ts` (Drizzle). Column names in **Postgres** are snake_case where noted.

```mermaid
erDiagram
  user ||--o{ generations : "owns"
  user ||--o{ projects : "owns"
  user ||--o{ cad_jobs : "owns"

  generations ||--o{ uploaded_assets : "has"
  generations ||--o{ projects : "linked_by_generationId"

  cad_jobs ||--o{ room_results : "has"

  user {
    text id PK
    text name
    text email UK
    timestamptz email_verified
    text image
    timestamptz created_at
    timestamptz updated_at
  }

  generations {
    uuid id PK
    text user_id FK
    text operation_id UK "WorldLabs operation"
    text world_id "WorldLabs world"
    text prompt
    text quality "draft|full"
    text status "pending|processing|done|error"
    text error_message
    jsonb spz_urls
    int image_count
    timestamptz created_at
    timestamptz completed_at
  }

  uploaded_assets {
    uuid id PK
    uuid generation_id FK
    text media_asset_id
    text original_name
    text mime_type
    timestamptz created_at
  }

  projects {
    uuid id PK
    text user_id FK
    uuid generation_id FK
    text operation_id
    text world_id
    text name
    text status
    text caption
    jsonb spz_urls
    timestamptz created_at
    timestamptz updated_at
  }

  cad_jobs {
    uuid id PK
    text user_id FK
    text status "pending|done|error"
    text original_file_name
    int area_m2_input
    int total_rooms
    text error_message
    timestamptz created_at
  }

  room_results {
    uuid id PK
    uuid cad_job_id FK
    int room_index
    text name
    text type
    text width_m
    text depth_m
    text area_m2
    int windows
    int doors
    int price_finishing
    jsonb furniture_json
    text media_asset_id "Marble image id"
    text preview_png_b64
    timestamptz created_at
  }
```

---

## Backend architecture

Simplified view of `backend/src/` using four logical layers. **Dependency rule:** **presentation** and **application** call **domain** shapes and **infrastructure** adapters; **domain** does not import **infrastructure** (mappers may depend on schema types and external DTO types declared as data).

### Layer diagram

```mermaid
flowchart TB
  subgraph presentation["Presentation — HTTP / Express"]
    direction TB
    P1["server.ts — compose app middleware + mounts"]
    P2["index.ts — listen on PORT"]
    P3["routes/*.ts — paths + requireAuth + multer + validate*"]
    P4["controllers/*.ts — req or res + call services"]
    P5["middleware/*.ts — auth.ts better-auth.ts validation.ts errorHandler.ts rateLimits.ts"]
    P6["Bridge handlers in controllers — reset verify-email HTML redirects"]
  end

  subgraph application["Application — use cases"]
    direction TB
    A1["services/** — orchestration transactions"]
    A2["services/cadJobs generations operations uploads worlds projects spz"]
  end

  subgraph domain["Domain — shapes contracts mapping"]
    direction TB
    D1["db/schema.ts — tables enums inferred types"]
    D2["validation/*.ts — Zod request contracts"]
    D3["mappers/*.ts — DB or pipeline to API DTO"]
    D4["clients/worldlabs/types.ts — Marble API shapes"]
    D5["lib/httpError.ts lib/sendControllerError.ts — shared errors + response helper"]
  end

  subgraph infrastructure["Infrastructure — IO config"]
    direction TB
    I1["db/client.ts — pg pool"]
    I2["db/migrations/** — Drizzle SQL"]
    I3["db/seed.ts — optional seed"]
    I4["clients/worldlabs/client.ts prompts.ts — HTTP to Marble"]
    I5["clients/cadPipeline.ts — HTTP to CAD Flask"]
    I6["integrations/resend/*.ts — outbound email"]
    I7["env.ts — typed configuration"]
  end

  presentation --> application
  application --> domain
  application --> infrastructure
  presentation --> domain
  presentation --> infrastructure
```

### Folder → layer (quick reference)

| Layer | `backend/src/` folders / files | Role |
|--------|-------------------------------|------|
| **Presentation** | `routes/`, `controllers/`, `middleware/` (except **Better Auth wiring** note below), `server.ts`, `index.ts` | Routing, auth gate, validation **middleware**, HTTP errors to JSON, bridges. |
| **Application** | `services/` | One service module per feature; coordinates DB + clients + mappers. |
| **Domain** | `db/schema.ts`, `validation/`, `mappers/`, `lib/`, `clients/worldlabs/types.ts` | Data model, request schemas, response mapping, shared errors; **no** raw `fetch` / pool here. |
| **Infrastructure** | `db/client.ts`, `db/migrations/`, `db/seed.ts`, `clients/` (**except** `types.ts` as pure types — still “contract” domain-adjacent), `integrations/`, `env.ts` | Persistence, outbound HTTP, email, environment. |

**Note:** `middleware/better-auth.ts` **configures** Better Auth with `pool` and `env` — it sits on the border of **presentation** (session API) and **infrastructure** (DB + secrets). It is listed under **presentation** in the diagram for “where sessions attach to HTTP.”

### Dependency sketch

```mermaid
flowchart LR
  PRE[Presentation]
  APP[Application]
  DOM[Domain]
  INF[Infrastructure]

  PRE --> APP
  APP --> DOM
  APP --> INF
  PRE --> DOM
  PRE --> INF
```

---

## End-to-end data flow (CAD → Marble → 3D)

```mermaid
flowchart LR
  subgraph mobile["Mobile"]
    M1["Upload DXF / pick room"]
  end

  subgraph backend["Backend"]
    B1["POST /api/cad-jobs/process"]
    B1a["DB: cad_jobs pending stub"]
    B2["POST CAD_PIPELINE_URL/process"]
    B3["Marble prepare_upload + PUT PNG per room"]
    B4["DB txn: INSERT room_results + cad_jobs done"]
    B5["POST /api/generations"]
    B6["Marble worlds:generate"]
    B7["GET /api/operations/:id sync"]
  end

  subgraph kaggle["Kaggle notebook"]
    K["Flask /process + SD pipeline"]
  end

  subgraph marble["WorldLabs"]
    WL[(Marble)]
  end

  M1 --> B1 --> B1a --> B2 --> K
  K --> B2
  B2 --> B3 --> WL
  B3 --> B4
  M1 --> B5
  B5 --> B6 --> WL
  M1 --> B7
  B7 --> WL
```

---

## Useful backend scripts

From `backend/`:

| Script | Purpose |
|--------|---------|
| `npm run dev` | `tsx watch` dev server |
| `npm run build` / `npm start` | Production build + `node dist` |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:studio` | Drizzle Studio (inspect DB) |
| `npm run db:ensure-room-preview` | Repair column usage if `preview_png_b64` missing on old DBs |

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| **`503` CAD pipeline** | `CAD_PIPELINE_URL` empty; Kaggle cell not running; ngrok URL expired — re-run tunnel cell, update `.env`, restart backend |
| **Fetch timeout to Kaggle** | Increase `CAD_PIPELINE_TIMEOUT_MS`; DXF large or many rooms slows SD |
| **Mobile login / CORS** | `BETTER_AUTH_URL` and `EXPO_PUBLIC_API_URL` same scheme+host; physical device needs **LAN IP**; `CORS_ORIGINS` includes your Expo web origin if applicable |
| **`room_results.preview_png_b64`** | Run `npm run db:ensure-room-preview` from `backend/` |

---

## Security note

Prefer **not** committing real **`backend/.env`** / **`mobile/.env`** files if the repository is shared or public. Use **`.env.example`** as the template and inject secrets via your host or CI. If secrets were ever pushed, **rotate** API keys and database credentials.
