# Asset Dashboard

A simple front-end asset tracking app for:

- Cash: TWD / USD
- Taiwan stocks: valued in TWD
- U.S. stocks: valued in USD

## Features

- Automatically fetches the TWD/USD exchange rate
- Automatically fetches Taiwan stock quotes
- Automatically fetches U.S. stock quotes
- Calculates each position's TWD value and allocation percentage
- Stores data in browser local storage

## How to Use

1. Double-click `Start App.bat` (recommended on Windows).
2. This starts `server.ps1` and opens `http://localhost:8765/index.html`.
3. On first run, the server auto-creates `data.json` when `/api/data` is requested.
4. Add your cash, Taiwan stock, and U.S. stock positions.
5. Click **Refresh Data** to sync exchange rates and quotes.
6. Your data is saved locally (browser storage + local `data.json` when server mode is active).

## Notes

- This is a static front-end prototype without a backend or database.
- `data.json` is intentionally excluded from GitHub (`.gitignore`) because it is local runtime data.
- If you run `server.ps1`, the app will auto-create `data.json` on first `GET /api/data`.
- If a quote source is temporarily unavailable, the app keeps the latest known value.
- The dashboard currently includes a history chart, stock allocation, market split, and an overall allocation pie chart.

## Next Steps

- Upgrade it to a React or Next.js app
- Add import/export for positions
- Add historical performance tracking with more detailed charts
