import psycopg2
import os
import uuid
import time
from dotenv import load_dotenv
import requests

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.autocommit = True

def run():
    # Register mechanic
    mech_email = "m_test@ottomech.test"
    with conn.cursor() as cur:
        cur.execute("DELETE FROM otp_store WHERE email = %s", (mech_email,))
        cur.execute("DELETE FROM mechanics WHERE email = %s", (mech_email,))
    
    r1 = requests.post("http://localhost:5000/auth/register/mechanic", json={
        "first_name": "Mech", "last_name": "Doe", "gender": "male",
        "email": mech_email, "phone_number": f"+91{str(uuid.uuid4().hex[:10])}", 
        "country": "IN", "workshop_name": "My Shop",
        "address": "123 Test St", "zone": "Central"
    })
    print("Mech reg:", r1.json())
    
    with conn.cursor() as cur:
        cur.execute("SELECT otp_code FROM otp_store WHERE email = %s", (mech_email,))
        otp = cur.fetchone()[0]
        
    r2 = requests.post("http://localhost:5000/auth/verify-otp", json={
        "email": mech_email, "otp": otp, "role": "mechanic"
    })
    token = r2.json().get("session_token")
    mech_id = r2.json().get("id")
    
    # Create driver directly
    driver_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO users (user_id, first_name, phone_number, email, country, phone_verified)
            VALUES (%s, 'Driver', %s, %s, 'IN', TRUE)
        """, (driver_id, f"+91{str(uuid.uuid4().hex[:10])}", f"d_{driver_id[:5]}@ottomech.test"))
    
        job_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO jobs (job_id, driver_id, mechanic_id, issue_type, status, lat, lng, accepted_at)
            VALUES (%s, %s, %s, 'flat_tyre', 'accepted', 26.85, 80.94, NOW())
        """, (job_id, driver_id, mech_id))
    
    # Complete job
    res = requests.patch(f"http://localhost:5000/jobs/{job_id}/complete", 
                         headers={"Authorization": f"Bearer {token}"},
                         json={"cash_amount": 500})
    print("PATCH Complete status:", res.status_code)
    print("PATCH Complete body:", res.json())

if __name__ == '__main__':
    run()
