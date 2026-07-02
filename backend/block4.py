import base64, psycopg2, os
from dotenv import load_dotenv
load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT pdf_base64 FROM receipts ORDER BY created_at DESC LIMIT 1')
row = cur.fetchone()
if row and row[0]:
    pdf = base64.b64decode(row[0])
    print(f"First 8 bytes: {pdf[:8]}")
    print(f"Starts with PDF magic (%PDF): {pdf[:4] == b'%PDF'}")
    print(f"PDF size: {len(pdf)} bytes")
else:
    print("FAIL: No PDF found in receipts table")
conn.close()
