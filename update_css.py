import re

css_path = 'c:/CodeBase/Code/OttoMech/ottomech/frontend/static/css/base.css'

with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Add :root at the very top
root_vars = """
:root {
  /* Backgrounds */
  --bg-page:        #FFFFFF;
  --bg-surface:     #F7F7F7;
  --bg-overlay:     #000000CC;

  /* Text */
  --text-primary:   #1C1C1E;
  --text-secondary: #6E6E73;
  --text-inverse:   #FFFFFF;
  --text-muted:     #AEAEB2;

  /* Single accent — OttoMech orange */
  --accent:         #F5A623;
  --accent-dark:    #D4891A;
  --accent-light:   #FEF3E2;

  /* Semantic */
  --success:        #34C759;
  --error:          #FF3B30;
  --warning:        #FF9F0A;
  --border:         #E5E5EA;
  --border-focus:   #1C1C1E;

  /* Typography */
  --font:           'Inter', -apple-system, sans-serif;
  --radius-sm:      8px;
  --radius-md:      12px;
  --radius-lg:      50px;
}
"""

if ":root {" not in css:
    css = css.replace("/* ── Reset ────────────────────────────────────────────────── */", root_vars + "\n/* ── Reset ────────────────────────────────────────────────── */")

# 2. Replace hardcoded colors with variables
replacements = {
    r'#FFFFFF': 'var(--bg-page)', # or text-inverse, we'll fix up specific ones later
    r'#1C1C1E': 'var(--text-primary)',
    r'#F5A623': 'var(--accent)',
    r'#E6981F': 'var(--accent-dark)',
    r'#34C759': 'var(--accent)', # Replace mechanic green with orange accent
    r'#2DB84D': 'var(--accent-dark)',
    r'#D32F2F': 'var(--error)',
    r'#C62828': 'var(--error)',
    r'#F5F5F0': 'var(--bg-surface)',
    r'#6E6E73': 'var(--text-secondary)',
    r'#48484A': 'var(--text-secondary)',
    r'#D1D1D6': 'var(--border)',
    r'#E5E5EA': 'var(--border)',
    r'#AEAEB2': 'var(--text-muted)',
    r'#8E8E93': 'var(--text-muted)',
    r'#ECECEC': 'var(--bg-surface)',
    r'#FAFAFA': 'var(--bg-surface)',
    r'#E65100': 'var(--error)',
    r'rgba\(245,\s*166,\s*35,\s*0\.08\)': 'var(--accent-light)',
    r'rgba\(245,\s*166,\s*35,\s*0\.1[0-9]*\)': 'var(--accent-light)',
    r'rgba\(245,\s*166,\s*35,\s*0\.2[0-9]*\)': 'var(--accent-light)',
    r'rgba\(245,\s*166,\s*35,\s*0\.3[0-9]*\)': 'var(--accent-light)',
    r'rgba\(211,\s*47,\s*47,\s*0\.[0-9]*\)': 'var(--accent-light)', # we will just remove glow anyway
}

for pattern, replacement in replacements.items():
    css = re.sub(pattern, replacement, css, flags=re.IGNORECASE)

# Fix up button text color which might have been changed to bg-page
css = css.replace('color: var(--bg-page)', 'color: var(--text-inverse)')
css = css.replace('background: var(--text-inverse)', 'background: var(--bg-page)')

# 3. Add new layout styles at the end
new_styles = """
/* ── Landing Page (Uber Style) ────────────────────────────── */
.landing-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 70vh;
    padding: 0 1rem;
}
.landing-header {
    text-align: center;
    margin-bottom: 2.5rem;
}
.landing-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
}
.landing-header p {
    color: var(--text-secondary);
    font-size: 1rem;
}
.role-cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 360px;
}
.role-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: border-color 0.2s ease;
}
.role-card:hover {
    border-color: var(--border-focus);
}
.role-card-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
}
.role-icon {
    font-size: 28px;
}
.role-text h2 {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
}
.role-text p {
    font-size: 0.85rem;
    color: var(--text-secondary);
}
.role-card-right {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100px;
}
.btn-outline {
    background: transparent;
    color: var(--text-primary);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.6rem 1.25rem;
    font-weight: 600;
    font-size: 0.9rem;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 0.2s ease;
}
.btn-outline:hover {
    border-color: var(--border-focus);
}
.role-card-right .btn-primary {
    border-radius: var(--radius-lg);
    padding: 0.6rem 1.25rem;
    font-weight: 600;
    font-size: 0.9rem;
    text-align: center;
    text-decoration: none;
    min-width: 100px;
}

/* ── Login/Register Forms (Uber Style) ────────────────────── */
.auth-container {
    max-width: 360px;
    margin: 0 auto;
    width: 100%;
}
.auth-header {
    margin-bottom: 2rem;
}
.auth-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
}
.auth-header p {
    color: var(--text-secondary);
}
.auth-field {
    margin-bottom: 1.25rem;
}
.auth-field label {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.25rem;
}
.auth-field input, .auth-field select {
    width: 100%;
    height: 52px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 1rem;
    font-size: 1rem;
    font-family: var(--font);
    outline: none;
    transition: border-color 0.2s ease;
    background: transparent;
}
.auth-field input:focus, .auth-field select:focus {
    border-color: var(--border-focus);
    box-shadow: none !important;
}
.btn-black {
    background: var(--text-primary);
    color: var(--text-inverse);
    height: 52px;
    border-radius: var(--radius-lg);
    width: 100%;
    font-weight: 600;
    font-size: 1rem;
    border: none;
    cursor: pointer;
}
.btn-black:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.auth-footer {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-align: left;
}
.auth-footer a {
    color: var(--text-primary);
    font-weight: 500;
    text-decoration: underline;
}

/* ── OTP Boxes ────────────────────────────────────────────── */
.otp-inputs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    justify-content: space-between;
}
.otp-box {
    width: 48px;
    height: 56px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    text-align: center;
    font-size: 1.5rem;
    font-weight: 600;
    outline: none;
    transition: border-color 0.2s;
}
.otp-box:focus {
    border-color: var(--border-focus);
}

/* Base overrides */
.app-nav {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
}
.app-nav a {
    color: var(--text-secondary);
    font-weight: 500;
    text-decoration: none;
}
.app-header {
    padding: 1.5rem 1rem 1rem;
}
.logo-img {
    height: 40px;
}
.card {
    background: transparent;
    border: none;
    padding: 0;
    box-shadow: none;
}
"""

css += new_styles

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("CSS updated.")
