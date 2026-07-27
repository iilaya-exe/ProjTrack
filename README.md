# ABI Project Tracker

A procurement & commercial management tracker that runs entirely in the browser —
**no server or database required.** All data (projects, items, audit log, and user
accounts) is stored in the browser's `localStorage`, so it can be hosted as a static
site on **GitHub Pages** (or any static host).

## Default login

On first use, a default admin account is seeded automatically in your browser:

- **Username:** `admin`
- **Password:** `admin123`

Change it after signing in (the **Password** button in the top bar), and add more
users via **Projects → Users** (admin only).

## How data is stored

The former PHP + MySQL backend was replaced by [`js/backend.js`](js/backend.js), a
`localStorage`-backed emulator (`LocalDB`) that mimics the exact request/response
shape the old `php/api.php` and `php/auth.php` endpoints used. The rest of the app
is unchanged.

**Important:** because everything lives in `localStorage`:

- Data is **per browser and per device** — it is *not* shared between users or
  machines, and clearing browser data will erase it.
- Each visitor gets their own independent copy (including the default admin seed).
- The login is **not real security** — it only gates the UI. Anyone with access to
  the browser can read the data. Don't store anything you wouldn't put in a public,
  client-side file.

To move data between browsers, use the Excel import/export features in the app.