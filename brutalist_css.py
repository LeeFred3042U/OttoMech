import re

css_path = 'c:/CodeBase/Code/OttoMech/ottomech/frontend/static/css/base.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Zero out CSS variables for radius
css = re.sub(r'--radius-sm:\s*.*?;\n', '--radius-sm:      0;\n', css)
css = re.sub(r'--radius-md:\s*.*?;\n', '--radius-md:      0;\n', css)
css = re.sub(r'--radius-lg:\s*.*?;\n', '--radius-lg:      0;\n', css)

# 2. Zero out all hardcoded border-radius
css = re.sub(r'border-radius:\s*.*?;\n', 'border-radius: 0;\n', css)
# If some are inline without \n:
css = re.sub(r'border-radius:\s*.*?;', 'border-radius: 0;', css)

# 3. Fix focus states to be sharp outlines instead of box-shadow glows
# Input focus
css = re.sub(
    r'\.field input:focus,\s*\n\.field select:focus\s*\{[^}]*\}',
    '.field input:focus,\n.field select:focus {\n    border-color: var(--text-primary);\n    outline: 1px solid var(--text-primary);\n    box-shadow: none;\n}',
    css
)

css = re.sub(
    r'\.field\.has-error input,\s*\n\.field\.has-error select\s*\{[^}]*\}',
    '.field.has-error input,\n.field.has-error select {\n    border-color: var(--error);\n    outline: 1px solid var(--error);\n    box-shadow: none;\n}',
    css
)

css = re.sub(
    r'\.auth-field input:focus,\s*\n?\.auth-field select:focus\s*\{[^}]*\}',
    '.auth-field input:focus, .auth-field select:focus {\n    border-color: var(--text-primary);\n    outline: 1px solid var(--text-primary);\n    box-shadow: none;\n}',
    css
)

css = re.sub(
    r'\.cash-input-row input:focus\s*\{[^}]*\}',
    '.cash-input-row input:focus {\n    border-color: var(--text-primary);\n    outline: 1px solid var(--text-primary);\n    box-shadow: none;\n}',
    css
)

css = re.sub(
    r'\.otp-box:focus\s*\{[^}]*\}',
    '.otp-box:focus {\n    border-color: var(--text-primary);\n    outline: 1px solid var(--text-primary);\n    box-shadow: none;\n}',
    css
)

# Replace box-shadow from issue card selected
css = re.sub(
    r'\.issue-card\.selected\s*\{[^}]*\}',
    '.issue-card.selected {\n    border-color: var(--accent);\n    background: var(--bg-page);\n    outline: 1px solid var(--accent);\n    box-shadow: none;\n}',
    css
)

# 4. Update the loading spinner to be a sharp block
css = re.sub(
    r'\.btn-loading::before\s*\{[^}]*\}',
    '.btn-loading::before {\n    content: "";\n    width: 12px;\n    height: 12px;\n    border: 2px solid var(--text-inverse);\n    border-top-color: transparent;\n    border-radius: 0;\n    animation: spin 0.8s linear infinite;\n}',
    css
)

# 5. Make the toggle switch sharp
# Currently the switch is a pill. We'll make it a sliding square block.
css = re.sub(
    r'\.toggle-switch::after\s*\{[^}]*\}',
    '.toggle-switch::after {\n    content: "";\n    position: absolute;\n    top: 2px;\n    left: 2px;\n    width: 20px;\n    height: 20px;\n    background: var(--bg-page);\n    border-radius: 0;\n    transition: transform 0.15s ease;\n    box-shadow: none;\n}',
    css
)
css = re.sub(
    r'transition: transform 0.25s ease',
    'transition: transform 0.1s linear',
    css
)

# 6. Make buttons perfectly black and flat
# E.g. .btn-primary hover state is accent-dark, let's keep it sharp.
css = re.sub(
    r'transition: background 0\.2s ease, transform 0\.1s ease, opacity 0\.2s ease',
    'transition: background 0.1s linear, color 0.1s linear',
    css
)
css = re.sub(
    r'\.btn:active\s*\{\s*transform:\s*scale\([^)]+\);\s*\}',
    '.btn:active {\n    transform: none;\n}',
    css
)

# 7. Labels capitalization
css = re.sub(
    r'\.field label\s*\{[^}]*\}',
    '.field label {\n    display: block;\n    font-size: 0.75rem;\n    font-weight: 600;\n    color: var(--text-primary);\n    margin-bottom: 0.35rem;\n    text-transform: uppercase;\n    letter-spacing: 0.05em;\n}',
    css
)

# Fix auth label
css = css.replace(
    '.auth-field label {\n    display: block;\n    font-size: 0.75rem;\n    color: var(--text-secondary);\n    text-transform: uppercase;\n    letter-spacing: 0.06em;\n    margin-bottom: 0.25rem;\n}',
    '.auth-field label {\n    display: block;\n    font-size: 0.75rem;\n    font-weight: 600;\n    color: var(--text-primary);\n    text-transform: uppercase;\n    letter-spacing: 0.05em;\n    margin-bottom: 0.35rem;\n}'
)

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Brutalist CSS applied successfully.")
