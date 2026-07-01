# OttoMech — Frontend

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
│   └── register_mechanic.html
├── static/
│   ├── css/
│   │   └── base.css    # Mobile-first, dark-graphite palette
│   └── js/
│       └── register.js # Shared registration + OTP logic
├── .gitignore
└── README.md           # This file
```

## Design

- **Palette**: Light theme (background `#FFFFFF` / `#F8F9FA`, text `#1C1C1E`, accent `#F5A623`)
- **Font**: Inter (Google Fonts)
- **Mobile-first**: max-width 420px container, touch-friendly inputs
- **Assets**: `static/img/oLogo.svg` handles branding
- **No frameworks**: vanilla CSS + vanilla JS
