# BurnMate Admin Panel

Internal admin at **`/admin`**. Static SPA (no build step) that talks to the
backend's `/admin/api/*` endpoints.

## Open it

**Local (easiest):** start the backend, then open `http://localhost:8000/admin`
— FastAPI serves these files (same-origin, no CORS).

```bash
cd burnmate_backend
.venv/bin/python -m uvicorn app.main:app --reload
# → http://localhost:8000/admin
```

**Hosted:** deploy this `admin/` folder with the website; it calls
`https://api.burnmate.fit/admin/api`. The API base auto-detects (see `js/api.js`).

> ⚠️ **No auth yet** (by request). `app/routers/admin.py` has `_ADMIN_OPEN = True`
> and the API is open — add a login before exposing publicly.

## Pages
- **Analysis** — placeholder (heading only).
- **Schema** — live ER diagram of the connected Postgres + per-table columns.
- **AI Pipeline** — inputs we collect (with options), the rendered prompt, outputs.
- **Database → Exercises** — CRUD on the exercise registry. **Food** — placeholder.
- **Trainer Designer** — fetches a trainer config and plays the avatar in three.js,
  using `js/solver.js` (a faithful port of the CM5 `rig.py`/`ik.py`).

## Parity (browser avatar == CM5 device)
`js/solver.js` is verified against the real device solver to ~5e-7:

```bash
cd burnmate_cm5 && python tools/export_golden_frames.py > /tmp/golden.json
cd ../burnmatewebsite/admin && node tools/parity-check.mjs /tmp/golden.json
```

## Layout
```
admin/
  index.html        shell + nav
  js/app.js         hash router
  js/api.js         backend client (auto base URL)
  js/ui.js          tiny DOM helpers
  js/solver.js      avatar math (CM5 port, no three.js — unit-testable)
  js/avatar.js      three.js renderer (imports solver.js)
  js/pages/*.js     one module per page
  tools/parity-check.mjs
```
