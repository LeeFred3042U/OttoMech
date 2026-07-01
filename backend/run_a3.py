import requests
import psycopg2
import os
import time
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
BASE_URL = "http://localhost:5000"

def run_req(method, path, headers=None, json_data=None):
    url = f"{BASE_URL}{path}"
    # Print as curl
    curl_cmd = f"curl -X {method} {url}"
    if headers:
        for k, v in headers.items():
            curl_cmd += f' \\\n    -H "{k}: {v}"'
    if json_data:
        import json
        curl_cmd += f' \\\n    -d \'{json.dumps(json_data)}\''
    print(f"\n{curl_cmd}")
    
    if method == "POST":
        res = requests.post(url, headers=headers, json=json_data)
    elif method == "PATCH":
        res = requests.patch(url, headers=headers, json=json_data)
    else:
        res = requests.get(url, headers=headers)
        
    print(res.text)
    return res.json()

def get_otp(phone):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT otp_code FROM otp_store WHERE phone = %s", (phone,))
    res = cur.fetchone()
    conn.close()
    return res[0] if res else None

def get_db_query(query, params=None):
    print(f"\n> {query}")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    if params:
        cur.execute(query, params)
    else:
        cur.execute(query)
    try:
        res = cur.fetchall()
        for row in res:
            print(row)
    except Exception:
        conn.commit()
        res = []
    conn.close()
    return res

print("\n--- Clearing test data ---")
get_db_query("DELETE FROM users WHERE phone_number IN ('+919876540001', '+919876500099');")
get_db_query("DELETE FROM mechanics WHERE phone_number = '+919876540002';")

# Step 1
print("\nStep 1 \u2014 Register driver:")
run_req("POST", "/auth/register/user", {"Content-Type": "application/json"}, 
        {"first_name":"Priya","last_name":"Sharma","phone_number":"+919876540001","country":"IN"})

# Step 2
print("\nStep 2 \u2014 Verify driver OTP (copy from terminal):")
otp1 = get_otp('+919876540001')
out2 = run_req("POST", "/auth/verify-otp", {"Content-Type": "application/json"}, 
        {"phone_number":"+919876540001","otp":otp1,"role":"user"})
driver_token = out2.get('session_token')

# Step 3
print("\nStep 3 \u2014 Register mechanic:")
run_req("POST", "/auth/register/mechanic", {"Content-Type": "application/json"}, 
        {"first_name":"Raju","last_name":"Kumar","gender":"male","phone_number":"+919876540002",
         "country":"IN","workshop_name":"Raju Auto Works","address":"Gomti Nagar",
         "zone":"Gomti Nagar","lat":26.8467,"lng":80.9462})

# Step 4
print("\nStep 4 \u2014 Verify mechanic OTP:")
otp2 = get_otp('+919876540002')
out4 = run_req("POST", "/auth/verify-otp", {"Content-Type": "application/json"}, 
        {"phone_number":"+919876540002","otp":otp2,"role":"mechanic"})
mechanic_token = out4.get('session_token')
mechanic_id = out4.get('id')

# Step 5
print("\nStep 5 \u2014 Create job:")
out5 = run_req("POST", "/jobs/create", {"Authorization": f"Bearer {driver_token}", "Content-Type": "application/json"}, 
        {"issue_type":"battery","lat":26.8550,"lng":80.9400})
job_id = out5.get('job', {}).get('job_id')

get_db_query("SELECT COUNT(*) FROM job_broadcasts WHERE job_id = %s;", (job_id,))

# Step 6
print("\nStep 6 \u2014 Accept job:")
run_req("PATCH", f"/jobs/{job_id}/accept", {"Authorization": f"Bearer {mechanic_token}", "Content-Type": "application/json"}, 
        {"mechanic_id": mechanic_id})
get_db_query("SELECT mechanic_id, accepted, responded FROM job_broadcasts WHERE job_id = %s;", (job_id,))

# Step 7
print("\nStep 7 \u2014 Complete job:")
run_req("PATCH", f"/jobs/{job_id}/complete", {"Authorization": f"Bearer {mechanic_token}", "Content-Type": "application/json"}, 
        {"cash_amount": 450})
get_db_query("SELECT mechanic_id, event_type, recorded_at FROM mri_events WHERE mechanic_id = %s;", (mechanic_id,))

# Step 8
print("\nStep 8 \u2014 Get job:")
run_req("GET", f"/jobs/{job_id}", {"Authorization": f"Bearer {driver_token}"})

print("\n\u2500\u2500 A4: Verify the two judgment-call behaviors \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
# A4.1
run_req("POST", "/jobs/create", {"Authorization": f"Bearer {mechanic_token}", "Content-Type": "application/json"}, 
        {"issue_type":"battery","lat":26.8550,"lng":80.9400})

# A4.2 Create another job and try to complete with mechanic_token
out_job = run_req("POST", "/jobs/create", {"Authorization": f"Bearer {driver_token}", "Content-Type": "application/json"}, 
        {"issue_type":"battery","lat":26.8550,"lng":80.9400})
job_id2 = out_job.get('job', {}).get('job_id')
run_req("PATCH", f"/jobs/{job_id2}/complete", {"Authorization": f"Bearer {mechanic_token}", "Content-Type": "application/json"}, 
        {"cash_amount": 200})

print("\n\u2500\u2500 A5: Stage 2/2.1 regression check \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
print("Check Constraint script:")
import subprocess
print(subprocess.run('''python -c "
from db import get_db
with get_db() as conn:
    with conn.cursor() as cur:
        try:
            cur.execute(
                \\"INSERT INTO otp_store (phone, otp_code, purpose, expires_at) VALUES ('+910000000099', '999999', 'bogus', NOW())\\")
            print('FAIL: no exception raised')
        except Exception as e:
            print(f'PASS: {type(e).__name__}: {e}')
"''', shell=True, capture_output=True, text=True).stdout)

print("\nConfirm country normalization:")
run_req("POST", "/auth/register/user", {"Content-Type": "application/json"}, 
        {"first_name":"Test","last_name":"User","phone_number":"+919876500099","country":"in"})
get_db_query("SELECT country FROM users WHERE phone_number = '+919876500099';")

