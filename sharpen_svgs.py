import glob

def sharpen_svgs():
    for f in glob.glob('frontend/templates/*.html'):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        content = content.replace('stroke-linecap="round" stroke-linejoin="round"', 'stroke-linecap="square" stroke-linejoin="miter"')
        content = content.replace('stroke="var(--success)"', 'stroke="var(--text-primary)"')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)

sharpen_svgs()
print("SVGs sharpened.")
