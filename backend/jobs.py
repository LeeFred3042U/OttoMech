import threading
import time
import secrets
from datetime import datetime, timezone
from db import get_db

def _run_scheduled_jobs():
    """Background loop that runs every 15 minutes."""
    while True:
        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    now = datetime.now(timezone.utc)
                    # Find users whose deadline has passed and haven't set a password
                    cur.execute("""
                        SELECT user_id, email 
                        FROM users 
                        WHERE status = 'PENDING_PASSWORD' 
                          AND password_hash IS NULL 
                          AND password_deadline <= %s;
                    """, (now,))
                    
                    rows = cur.fetchall()
                    for user_id, email in rows:
                        token = secrets.token_urlsafe(32)
                        
                        # Update status to PASSWORD_REQUIRED
                        cur.execute("UPDATE users SET status = 'PASSWORD_REQUIRED' WHERE user_id = %s;", (user_id,))
                        
                        # Invalidate old unused tokens
                        cur.execute("UPDATE password_setup_tokens SET used_at = now() WHERE user_id = %s AND used_at IS NULL;", (user_id,))
                        
                        # Insert new token (valid for 24h since this is a system-generated one, or 1h up to business rules. Let's do 24h for system ones)
                        cur.execute(
                            "INSERT INTO password_setup_tokens (token, user_id, expires_at) VALUES (%s, %s, now() + interval '24 hours');",
                            (token, user_id)
                        )
                        
                        print(f"[BACKGROUND JOB] Deadline passed for {email}. Password setup link: /set-password?token={token}")
        except Exception as e:
            print(f"[BACKGROUND JOB ERROR] {e}")
            
        # Sleep for 15 minutes
        time.sleep(15 * 60)

def start_background_jobs():
    thread = threading.Thread(target=_run_scheduled_jobs, daemon=True)
    thread.start()
    print("[BACKGROUND JOB] Password lifecycle monitor started.")
