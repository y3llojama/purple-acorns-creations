# Purple Acorns Creations

A handcrafted jewelry website built with **plain HTML**, **vanilla JavaScript**, **Sass**, and an **Express.js** backend.

## Project Structure

```
purple-acorns-creations/
│
├─ .gitignore
├─ package.json
├─ README.md
│
├─ server.js                     # Express server
│
├─ public/                       # Static assets served by Express
│   ├─ index.html
│   ├─ story.html
│   ├─ vision.html
│   ├─ gallery.html
│   ├─ contact.html
│   │
│   ├─ css/
│   │   └─ styles.css            # Compiled from SCSS
│   │
│   ├─ scss/
│   │   ├─ _variables.scss
│   │   ├─ _reset.scss
│   │   ├─ _layout.scss
│   │   ├─ _header.scss
│   │   ├─ _hero.scss
│   │   ├─ _gallery.scss
│   │   ├─ _footer.scss
│   │   └─ styles.scss           # Master SCSS file
│   │
│   ├─ js/
│   │   └─ main.js               # UI helpers & form handling
│   │
│   └─ images/
│       ├─ logo.png
│       ├─ hero.jpg
│       ├─ story.jpg
│       └─ gallery/
│           ├─ 01.jpg
│           ├─ 02.jpg
│           └─ … (more)
```

## Development

```bash
# Install dependencies
npm install

# Build CSS (compile SCSS → CSS)
npm run build:css

# Watch SCSS while developing
npm run watch:css

# Start server (production)
npm start

# Start server with auto‑restart (development)
npm run dev
```

Open <http://localhost:3000> in your browser to view the site.

## License

MIT © 2025
