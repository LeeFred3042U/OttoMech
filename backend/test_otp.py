import uuid
import sys
import os
import psycopg2
from dotenv import load_dotenv

os.environ["PYTEST_CURRENT_TEST"] = "1"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "."))
from app import create_app
from db import get_db

def test_flow():
    app = create_app()
    app.config["TESTING"] = True
    client = app.test_client()

    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    phone = f"+9198{uuid.uuid4().hex[:8]}"
    
    print("Step 1: POST /auth/register/user with a new email")
    r = client.post("/auth/register/user", json={
        "first_name": "Test",
        "last_name": "User",
        "email": email,
        "phone_number": phone,
        "country": "IN"
    })
    print(f"Status: {r.status_code}")
    print(f"Body: {r.get_json()}")
    
    with app.app_context():
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT otp_code FROM otp_store WHERE email = %s", (email,))
                otp = cur.fetchone()[0]
                
        print("\nStep 2: POST /auth/verify-otp {email, otp, role:'user'}")
        r = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": otp,
            "role": "user"
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")
        
        print("\nStep 3: POST /auth/login/user with same email")
        r = client.post("/auth/login/user", json={
            "email": email
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")
        
        print("\nStep 4: POST /auth/login/user with unknown email")
        r = client.post("/auth/login/user", json={
            "email": "unknown@example.com"
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")
        
        print("\nStep 5: POST /auth/register/user with duplicate email")
        r = client.post("/auth/register/user", json={
            "first_name": "Test2",
            "last_name": "User2",
            "email": email,
            "phone_number": f"+9199{uuid.uuid4().hex[:8]}",
            "country": "IN"
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")
        
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT otp_code FROM otp_store WHERE email = %s", (email,))
                new_otp = cur.fetchone()[0]
                wrong_otp = "000000" if new_otp != "000000" else "111111"
        
        print("\nStep 6: POST /auth/verify-otp with wrong OTP")
        r = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": wrong_otp,
            "role": "user"
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")
        
        print("\nStep 7: POST /auth/verify-otp with expired OTP")
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE otp_store SET expires_at = NOW() - INTERVAL '1 hour' WHERE email = %s", (email,))
        
        r = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": new_otp,
            "role": "user"
        })
        print(f"Status: {r.status_code}")
        print(f"Body: {r.get_json()}")

if __name__ == "__main__":
    test_flow()
