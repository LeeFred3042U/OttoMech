import re

def process_file(path, role):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Change card to auth-container
    html = html.replace('class="card"', 'class="auth-container"')
    html = html.replace('class="field"', 'class="auth-field"')
    
    # Change h1 and subtitle to auth-header
    if role == 'user':
        html = re.sub(r'<h1>.*?</h1>\s*<p class="subtitle">.*?</p>', 
                  '<div class="auth-header">\n        <h1>User Registration</h1>\n        <p>Create your account to request roadside help</p>\n    </div>', 
                  html, count=1, flags=re.DOTALL)
    else:
        html = re.sub(r'<h1>.*?</h1>\s*<p class="subtitle">.*?</p>', 
                  '<div class="auth-header">\n        <h1>Mechanic Registration</h1>\n        <p>Join OttoMech to receive roadside job requests</p>\n    </div>', 
                  html, count=1, flags=re.DOTALL)

    # Change Send OTP button
    html = re.sub(r'<button type="submit" class="btn btn-primary" id="btn-register">', 
                  '<button type="submit" class="btn-black" id="btn-register">', html)

    # Replace step-otp entirely
    otp_section = """<section class="auth-container" id="step-otp" hidden>
    <div class="auth-header">
        <h1>Check your email</h1>
        <p>We sent a 6-digit code to <strong id="display-email">your email</strong></p>
    </div>
    
    <p class="otp-hint" id="otp-hint-terminal" style="display:none; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Check server terminal if email didn't arrive.</p>

    <form id="otp-form" novalidate>
        <!-- The JS needs #otp, so we keep a hidden input -->
        <input type="hidden" id="otp" name="otp">
        
        <div class="otp-inputs" id="otp-inputs">
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
        </div>
        <span class="field-error" id="err-otp"></span>

        <div class="countdown" id="otp-countdown"></div>
        <div class="form-error" id="otp-error" role="alert"></div>

        <button type="submit" class="btn-black" id="btn-verify" disabled>
            <span class="btn-text">Verify</span>
            <span class="btn-loading" hidden>Verifying…</span>
        </button>
        
        <div style="text-align: center; margin-top: 1rem;">
            <a href="#" id="resend-link" style="color: var(--text-muted); font-size: 0.8rem; text-decoration: none; pointer-events: none;">Resend code</a>
        </div>
    </form>
</section>"""
    html = re.sub(r'<section class="auth-container" id="step-otp" hidden>.*?</section>', otp_section, html, flags=re.DOTALL)

    # Replace step-success entirely
    if role == 'user':
        subtext = "Your account is ready. Go back to find a mechanic."
    else:
        subtext = "Your profile is created. Log in to start taking jobs."
        
    success_section = f"""<section class="auth-container success-card" id="step-success" hidden style="text-align: center; padding: 2rem 0;">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
    <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem;">You're all set.</h1>
    <p style="color: var(--text-secondary); margin-bottom: 2rem;">{subtext}</p>
    
    <div style="display:none;" class="token-display">
        <label>Session Token</label>
        <code id="session-token"></code>
    </div>
    
    <a href="/" class="btn-black" style="display: flex; align-items: center; justify-content: center; text-decoration: none;">Go home</a>
</section>"""
    html = re.sub(r'<section class="auth-container success-card" id="step-success" hidden>.*?</section>', success_section, html, flags=re.DOTALL)

    # JS addition
    js_addition = """
    // JS to handle 6 OTP boxes and sync to hidden input
    const otpBoxes = document.querySelectorAll('.otp-box');
    const hiddenOtp = document.getElementById('otp');
    const btnVerify = document.getElementById('btn-verify');
    
    function updateHiddenOtp() {
        let val = '';
        otpBoxes.forEach(box => val += box.value);
        hiddenOtp.value = val;
        btnVerify.disabled = val.length !== 6;
    }

    otpBoxes.forEach((box, i) => {
        box.addEventListener('input', (e) => {
            box.value = box.value.replace(/[^0-9]/g, '');
            if (box.value && i < otpBoxes.length - 1) {
                otpBoxes[i+1].focus();
            }
            updateHiddenOtp();
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && i > 0) {
                otpBoxes[i-1].focus();
                otpBoxes[i-1].value = '';
                updateHiddenOtp();
            }
        });
    });

    document.getElementById('register-form').addEventListener('submit', function() {
        setTimeout(() => {
            const email = document.getElementById('email').value;
            const display = document.getElementById('display-email');
            if(display && email) display.innerText = email;
        }, 100);
    });
"""
    if "updateHiddenOtp" not in html:
        html = html.replace('OttoRegister.init({', js_addition + '\n    OttoRegister.init({')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)

process_file('c:/CodeBase/Code/OttoMech/ottomech/frontend/templates/register_user.html', 'user')
process_file('c:/CodeBase/Code/OttoMech/ottomech/frontend/templates/register_mechanic.html', 'mechanic')

print("Registration templates updated.")
