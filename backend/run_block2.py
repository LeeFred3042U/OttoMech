import requests
import psycopg2
import os
import json
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.autocommit = True

BASE_URL = "http://localhost:5000"

def get_otp(email):
    with conn.cursor() as cur:
        cur.execute("SELECT otp_code FROM otp_store WHERE email = %s", (email,))
        row = cur.fetchone()
        return row[0] if row else None

def do_curl(step, method, url, payload=None):
    print(f"\n# {step}")
    cmd = f"curl -s -X {method} {url}"
    if payload:
        cmd += " \\\n  -H \"Content-Type: application/json\" \\\n  -d '" + json.dumps(payload, separators=(',', ':')) + "'"
    print(cmd)
    
    if method == "POST":
        r = requests.post(url, json=payload)
    else:
        r = requests.get(url)
    
    print(json.dumps(r.json(), separators=(',', ':')))
    print(r.status_code)

def run_block2():
    email = "demouser_verify@ottomech.test"
    
    # Step 1
    do_curl("Step 1 - register new user", "POST", f"{BASE_URL}/auth/register/user", {
        "first_name": "Demo",
        "last_name": "User",
        "email": email,
        "phone_number": "+919876560001",
        "country": "IN"
    })
    
    otp = get_otp(email)
    
    # Step 2
    do_curl("Step 2 - verify OTP", "POST", f"{BASE_URL}/auth/verify-otp", {
        "email": email,
        "otp": otp,
        "role": "user"
    })
    
    # Step 3
    do_curl("Step 3 - login with same email", "POST", f"{BASE_URL}/auth/login/user", {
        "email": email
    })
    
    # Step 4
    do_curl("Step 4 - login with unknown email", "POST", f"{BASE_URL}/auth/login/user", {
        "email": "nobody@nowhere.test"
    })
    
    # Step 5
    do_curl("Step 5 - duplicate email registration", "POST", f"{BASE_URL}/auth/register/user", {
        "first_name": "Demo",
        "last_name": "User",
        "email": email,
        "phone_number": "+919876560002",
        "country": "IN"
    })
    
    # Step 6
    do_curl("Step 6 - wrong OTP", "POST", f"{BASE_URL}/auth/verify-otp", {
        "email": email,
        "otp": "000000",
        "role": "user"
    })
    
    # Step 7 prep
    with conn.cursor() as cur:
        cur.execute("UPDATE otp_store SET expires_at = NOW() - interval '1 hour' WHERE email = %s", (email,))
    
    do_curl("Step 7 - expired OTP", "POST", f"{BASE_URL}/auth/verify-otp", {
        "email": email,
        "otp": otp,
        "role": "user"
    })

if __name__ == "__main__":
    # Clean up DB for the run
    with conn.cursor() as cur:
        cur.execute("DELETE FROM otp_store WHERE email = 'demouser_verify@ottomech.test'")
        cur.execute("DELETE FROM users WHERE email = 'demouser_verify@ottomech.test'")
        cur.execute("DELETE FROM users WHERE phone_number = '+919876560001'")
        cur.execute("DELETE FROM users WHERE phone_number = '+919876560002'")
    
    run_block2()
