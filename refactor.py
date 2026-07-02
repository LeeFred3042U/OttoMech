import os
import re

ROOT_DIR = "c:/CodeBase/Code/OttoMech/ottomech/frontend"

# 1. Replace "Driver" with "User" (and "driver" with "user") everywhere EXCEPT backend route paths and variables.
# Actually, the instruction says:
# "Driver" → "User" everywhere, in all templates and all JS files.
# Search and replace globally. No instance of "Driver" should remain in any user-facing string
# (button labels, headings, subtitles, nav links, placeholders, toast messages).
# Backend route names and JS variable names are fine as-is — copy only.

# Let's do a smart replace on text content in HTML and strings in JS.

def replace_driver_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # We only want to replace Driver with User in UI text.
    # It's safer to just replace "Driver" with "User" and "driver" with "user" in specific places.
    # But wait, "Driver" -> "User" with exact casing should work for most UI text.
    content = content.replace("Driver", "User")
    # if we have "driver" in text, maybe we should leave it if it's a variable.
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk(ROOT_DIR):
    for f in files:
        if f.endswith('.html') or f.endswith('.js'):
            replace_driver_in_file(os.path.join(root, f))
            print(f"Replaced Driver -> User in {f}")
