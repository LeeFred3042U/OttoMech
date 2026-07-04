# OttoMech — Frontend

The design is available in a [figma file](https://www.figma.com/design/VsXn08nXUlAnj1NjBTJ04f/ottoMech?node-id=0-1&t=emlB98EKardNkMaI-1) 

There is **no build step**. No npm, no webpack, no vite.

## How to run

Templates are served by Flask via `render_template()`.
Start the backend and visit the routes in your browser:

```
cd backend
python app.py

# Then open:
#   http://localhost:5000/register/user
#   http://localhost:5000/register/mechanic
```

**Do not open `.html` files directly in a browser** — they use Jinja2 syntax
(`{{ url_for(...) }}`, `{% extends %}`) that only works when served by Flask.

## Structure

```
frontend/
├── templates/          # Jinja2 templates — rendered by Flask
│   ├── base.html       # Shared layout (header, footer, CSS/JS links)
│   ├── register_user.html
│   ├── register_mechanic.html
│   ├── login.html
│   ├── dashboard_user.html
│   └── dashboard_mechanic.html
├── static/
│   ├── css/
│   │   └── base.css    # Mobile-first, warm automotive design system
│   ├── js/
│   │   ├── register.js # Registration + OTP logic
│   │   ├── login.js    # Login logic
│   │   ├── dashboard_user.js
│   │   └── dashboard_mechanic.js
│   └── img/            # SVGs and images (oLogo.svg, etc)
├── .gitignore
└── README.md           # This file
```

## Design

- **Palette**: Warm automotive theme (Dark espresso `--brand-darkest`, Neutral tan `--brand-light`, Cream white `--brand-cream`).
- **Aesthetic**: Premium, responsive, modern UI with smooth micro-interactions, subtle shadows, and a clean typography hierarchy.
- **Font**: Inter (Google Fonts)
- **Mobile-first**: Built for smartphones since users will be stranded on the roadside.
- **Assets**: Polished SVG icons (`oLogo.svg`, `motorbike.svg`).
- **No frameworks**: Vanilla CSS + Vanilla JS, Socket.IO for real-time.
