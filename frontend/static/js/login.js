/* ═══════════════════════════════════════════════════════════
   OttoMech — login.js
   Handles email-based OTP login for both users and mechanics.
   Follows the same IIFE module pattern as register.js.
   No localStorage/sessionStorage except the one-time token handoff.
   ═══════════════════════════════════════════════════════════ */

var OttoLogin = (function () {
    'use strict';

    // ── State (memory only) ──────────────────────────────────
    var _email = '';
    var _role = '';
    var _dashboardUrl = '';
    var _countdownInterval = null;
    var _inflight = false;

    // ── DOM refs ─────────────────────────────────────────────
    var _els = {};

    // ── Email regex ──────────────────────────────────────────
    var _emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Public: init ─────────────────────────────────────────
    function init(cfg) {
        _role = cfg.role;
        _dashboardUrl = cfg.dashboardUrl;

        _els.loginForm = document.getElementById('login-form');
        _els.otpForm = document.getElementById('otp-form');
        _els.passwordForm = document.getElementById('password-form');
        _els.stepEmail = document.getElementById('step-email');
        _els.stepOtp = document.getElementById('step-otp');
        _els.stepPassword = document.getElementById('step-password');
        _els.stepSetupRequired = document.getElementById('step-setup-required');
        _els.loginError = document.getElementById('login-error');
        _els.otpError = document.getElementById('otp-error');
        _els.passwordError = document.getElementById('password-error');
        _els.setupError = document.getElementById('setup-error');
        _els.btnLogin = document.getElementById('btn-login');
        _els.btnVerify = document.getElementById('btn-verify');
        _els.btnLoginPwd = document.getElementById('btn-login-pwd');
        _els.btnRequestSetup = document.getElementById('btn-request-setup');
        _els.countdown = document.getElementById('otp-countdown');

        _els.loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleLogin(cfg);
        });

        _els.otpForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleOtp(cfg);
        });

        if (_els.passwordForm) {
            _els.passwordForm.addEventListener('submit', function (e) {
                e.preventDefault();
                _handlePasswordLogin(cfg);
            });
        }

        if (_els.btnRequestSetup) {
            _els.btnRequestSetup.addEventListener('click', function (e) {
                e.preventDefault();
                _handleRequestSetup(cfg);
            });
        }

        // Wire resend OTP link
        var resendLink = document.getElementById('resend-link');
        if (resendLink) {
            resendLink.addEventListener('click', function (e) {
                e.preventDefault();
                if (!_email) return;
                var role = resendLink.getAttribute('data-role') || _role;
                resendLink.textContent = 'Sending…';
                resendLink.style.pointerEvents = 'none';

                fetch('/auth/resend-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: _email, role: role }),
                })
                .then(function (res) { return res.json(); })
                .then(function (body) {
                    resendLink.textContent = 'Code resent!';
                    if (body.expires_in_seconds) {
                        _startCountdown(body.expires_in_seconds);
                    }
                    setTimeout(function () {
                        resendLink.textContent = 'Resend code';
                        resendLink.style.pointerEvents = '';
                    }, 3000);
                })
                .catch(function () {
                    resendLink.textContent = 'Failed — try again';
                    resendLink.style.pointerEvents = '';
                });
            });
        }
    }

    // ── Login submit (send OTP) ──────────────────────────────
    function _handleLogin(cfg) {
        _clearAllErrors();

        var emailEl = document.getElementById('email');
        var email = (emailEl.value || '').trim().toLowerCase();

        if (!email) {
            _showFieldError('email', 'Email is required');
            return;
        }
        if (!_emailRe.test(email)) {
            _showFieldError('email', 'Enter a valid email address');
            return;
        }

        _email = email;

        _postJSON(cfg.loginEndpoint, { email: email }, _els.btnLogin, _els.loginError, function (body) {
            if (body.auth_method === 'password') {
                _els.stepEmail.hidden = true;
                if (_els.stepPassword) {
                    _els.stepPassword.hidden = false;
                    document.getElementById('password').focus();
                }
            } else if (body.auth_method === 'setup_required') {
                _els.stepEmail.hidden = true;
                if (_els.stepSetupRequired) _els.stepSetupRequired.hidden = false;
            } else if (body.auth_method === 'direct') {
                sessionStorage.setItem('otto_token_handoff', body.session_token);
                sessionStorage.setItem('otto_id_handoff', body.id);
                sessionStorage.setItem('otto_role_handoff', body.role);
                window.location.href = _dashboardUrl;
            } else {
                // Check if email delivery failed
                if (body.email_delivery === 'failed') {
                    _showEmailWarning('Email delivery failed — please resend email.');
                }
                // Show OTP step
                _els.stepEmail.hidden = true;
                _els.stepOtp.hidden = false;
                _startCountdown(body.expires_in_seconds || 300);
                document.getElementById('otp').focus();
            }
        });
    }

    // ── Password submit ──────────────────────────────────────
    function _handlePasswordLogin(cfg) {
        _clearError(_els.passwordError);
        var pwdEl = document.getElementById('password');
        var pwd = (pwdEl.value || '').trim();

        if (!pwd) {
            _showFieldError('password', 'Password is required');
            return;
        }

        var payload = { email: _email, password: pwd };

        _postJSON('/auth/login/user/password', payload, _els.btnLoginPwd, _els.passwordError, function (body) {
            sessionStorage.setItem('otto_token_handoff', body.session_token);
            sessionStorage.setItem('otto_id_handoff', body.id);
            sessionStorage.setItem('otto_role_handoff', body.role);
            window.location.href = _dashboardUrl;
        });
    }

    // ── Request Setup Link ───────────────────────────────────
    function _handleRequestSetup(cfg) {
        _clearError(_els.setupError);
        var payload = { email: _email };
        
        _postJSON('/auth/login/user/request-setup-link', payload, _els.btnRequestSetup, _els.setupError, function (body) {
            _els.btnRequestSetup.hidden = true;
            document.getElementById('setup-success').style.display = 'block';
        });
    }

    // ── OTP submit ───────────────────────────────────────────
    function _handleOtp(cfg) {
        _clearError(_els.otpError);
        var otpEl = document.getElementById('otp');
        var otp = otpEl.value.trim();

        if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            _showFieldError('otp', 'Enter a 6-digit numeric code');
            return;
        }

        var payload = {
            email: _email,
            otp: otp,
            role: _role,
        };

        _postJSON(cfg.verifyEndpoint, payload, _els.btnVerify, _els.otpError, function (body) {
            _stopCountdown();

            // One-time sessionStorage handoff for cross-page token transfer
            // This is the ONLY acceptable sessionStorage use.
            sessionStorage.setItem('otto_token_handoff', body.session_token);
            sessionStorage.setItem('otto_id_handoff', body.id);
            sessionStorage.setItem('otto_role_handoff', body.role);

            // Navigate to dashboard
            window.location.href = _dashboardUrl;
        });
    }

    // ── Fetch helper ─────────────────────────────────────────
    function _postJSON(url, data, btn, errorEl, onSuccess) {
        if (_inflight) return;
        _inflight = true;
        _setBtnLoading(btn, true);
        _clearError(errorEl);

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(function (res) {
            return res.json().then(function (body) {
                return { status: res.status, body: body };
            });
        })
        .then(function (result) {
            _inflight = false;
            _setBtnLoading(btn, false);

            if (result.status >= 200 && result.status < 300) {
                onSuccess(result.body);
            } else {
                var msg = result.body.error || 'Unknown error';
                _showFormError(errorEl, msg, false);
            }
        })
        .catch(function () {
            _inflight = false;
            _setBtnLoading(btn, false);
            _showFormError(errorEl, "Can\u2019t reach the server \u2014 check your connection or try again.", true);
        });
    }

    // ── Countdown timer ──────────────────────────────────────
    function _startCountdown(seconds) {
        _stopCountdown();
        var remaining = seconds;
        _renderCountdown(remaining);

        _countdownInterval = setInterval(function () {
            remaining--;
            _renderCountdown(remaining);
            if (remaining <= 0) {
                _stopCountdown();
                _els.countdown.classList.add('expired');
                _els.countdown.textContent = 'OTP expired — go back and resend.';
            }
        }, 1000);
    }

    function _stopCountdown() {
        if (_countdownInterval) {
            clearInterval(_countdownInterval);
            _countdownInterval = null;
        }
    }

    function _renderCountdown(sec) {
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        _els.countdown.textContent = 'Expires in ' + m + ':' + (s < 10 ? '0' : '') + s;
        _els.countdown.classList.remove('expired');
    }

    // ── Email warning ────────────────────────────────────────
    function _showEmailWarning(msg) {
        var el = document.getElementById('otp-error');
        if (el) {
            el.textContent = msg;
            el.className = 'form-error email-warning';
        }
    }

    // ── Error display helpers ────────────────────────────────
    function _showFieldError(fieldId, msg) {
        var errEl = document.getElementById('err-' + fieldId);
        if (errEl) errEl.textContent = msg;
        var field = document.getElementById(fieldId);
        if (field && field.parentElement) {
            field.parentElement.classList.add('has-error');
        }
    }

    function _showFormError(el, msg, isNetwork) {
        el.textContent = msg;
        el.className = 'form-error' + (isNetwork ? ' network-error' : '');
    }

    function _clearError(el) {
        if (el) {
            el.textContent = '';
            el.className = 'form-error';
        }
    }

    function _clearAllErrors() {
        var fieldErrors = document.querySelectorAll('.field-error');
        for (var i = 0; i < fieldErrors.length; i++) {
            fieldErrors[i].textContent = '';
        }
        var errorFields = document.querySelectorAll('.has-error');
        for (var j = 0; j < errorFields.length; j++) {
            errorFields[j].classList.remove('has-error');
        }
        _clearError(_els.loginError);
        _clearError(_els.otpError);
    }

    // ── Button loading state ─────────────────────────────────
    function _setBtnLoading(btn, loading) {
        btn.disabled = loading;
        var textEl = btn.querySelector('.btn-text');
        var loadEl = btn.querySelector('.btn-loading');
        if (textEl) textEl.hidden = loading;
        if (loadEl) loadEl.hidden = !loading;
    }

    // ── Public API ───────────────────────────────────────────
    return { init: init };
})();
