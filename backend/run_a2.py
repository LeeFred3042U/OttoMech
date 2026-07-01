import subprocess
import psycopg2
import os
import re
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

job_id = None
# Run 5 times
for i in range(5):
    print(f"\n--- Run {i+1} ---")
    result = subprocess.run(
        "venv\\Scripts\\activate && pytest tests/test_stage3.py::TestJobAccept::test_concurrent_accept_exactly_one_wins -v", 
        shell=True, capture_output=True, text=True
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
        
    # Extract job_id from the last run if possible, or we could just get it from the db
    # The test creates a new job each time. We should just get the most recently created job that was accepted.
    pass

# Query DB
print("\n--- DB Queries for last run ---")
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Find the most recently created job from the test
cur.execute("SELECT job_id FROM jobs ORDER BY created_at DESC LIMIT 1;")
res = cur.fetchone()
if res:
    job_id = res[0]
    print(f"Using job_id: {job_id}")
    
    print("\nQuery 1: SELECT job_id, mechanic_id, status FROM jobs WHERE job_id = %s;")
    cur.execute("SELECT job_id, mechanic_id, status FROM jobs WHERE job_id = %s;", (job_id,))
    print(cur.fetchall())
    
    print("\nQuery 2: SELECT mechanic_id, accepted, responded FROM job_broadcasts WHERE job_id = %s;")
    cur.execute("SELECT mechanic_id, accepted, responded FROM job_broadcasts WHERE job_id = %s;", (job_id,))
    print(cur.fetchall())
else:
    print("No job found!")

conn.close()
