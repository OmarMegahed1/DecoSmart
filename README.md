# Decor AI Monorepo (Backend + Mobile)

This repo now contains:

- `backend/` — Express + TypeScript API
- `mobile/` — Expo React Native app

## Run from repo root

```bash
npm run dev:backend
npm run dev:mobile
```

Optional mobile targets:

```bash
npm run android
npm run ios
npm run web
```

## Build backend

```bash
npm run build:backend
```

## Database (Neon)

If `room_results.preview_png_b64` is missing on a database (e.g. new environment), run from `backend/`:

```bash
npm run db:ensure-room-preview
```

## Full data flow

```mermaid
flowchart TD
    Mobile["Mobile (Expo RN)"]
    Backend["Express Backend\n(localhost / Railway)"]
    Kaggle["Kaggle Notebook\n(Flask + pyngrok)"]
    WorldLabs["WorldLabs API"]
    DB["Neon Postgres"]

    Mobile -->|"POST /api/cad-jobs/process\n(DXF file + area_m2)"| Backend
    Backend -->|"POST /process\n(multipart DXF)"| Kaggle
    Kaggle -->|"ezdxf + EasyOCR + OpenCV\n+ Canny + Realistic Vision SD"| Kaggle
    Kaggle -->|"rooms JSON + base64 images"| Backend
    Backend -->|"upload each room's AI image"| WorldLabs
    WorldLabs -->|"media_asset_id per room"| Backend
    Backend -->|"store cad_jobs + room_results"| DB
    Backend -->|"job_id + rooms list"| Mobile
    Mobile -->|"Room Picker screen"| Mobile
    Mobile -->|"POST /api/generations\n(selected room media_asset_id)"| Backend
    Backend -->|"generate world"| WorldLabs
    WorldLabs -->|"operation_id"| Backend
    Mobile -->|"poll /api/operations/:id"| Backend
    Backend -->|"3D splat URLs"| Mobile
```
