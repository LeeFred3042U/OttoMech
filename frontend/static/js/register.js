/* ═══════════════════════════════════════════════════════════
   OttoAssist — register.js
   Shared registration + OTP verification logic.
   No localStorage/sessionStorage. All state in JS variables.
   OTP keyed on email, not phone. Geolocation for mechanics.
   ═══════════════════════════════════════════════════════════ */

var OttoRegister = (function () {
    'use strict';

    // ── State (memory only, never persisted) ─────────────────
    var _email = '';
    var _role = '';
    var _countdownInterval = null;
    var _inflight = false;

    // ── DOM refs (set during init) ───────────────────────────
    var _els = {};

    // ── Email validation regex ───────────────────────────────
    var _emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Public: init ─────────────────────────────────────────
    function init(cfg) {
        _role = cfg.role;

        _els.registerForm = document.getElementById(cfg.registerFormId);
        _els.otpForm = document.getElementById(cfg.otpFormId);
        _els.stepRegister = document.getElementById('step-register');
        _els.stepOtp = document.getElementById('step-otp');
        _els.stepSuccess = document.getElementById('step-success');
        _els.registerError = document.getElementById('register-error');
        _els.otpError = document.getElementById('otp-error');
        _els.btnRegister = document.getElementById('btn-register');
        _els.btnVerify = document.getElementById('btn-verify');
        _els.countdown = document.getElementById('otp-countdown');
        _els.sessionToken = document.getElementById('session-token');
        _els.geoNotice = document.getElementById('geo-notice');
        _els.geoStatus = document.getElementById('geo-status');

        _els.registerForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleRegister(cfg);
        });

        _els.otpForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleOtp();
        });
    }

    // ── Registration submit ──────────────────────────────────
    function _handleRegister(cfg) {
        _clearAllErrors();

        // Collect form data
        var data = {};
        var allFields = cfg.fields.concat(cfg.optionalFields || []);
        for (var i = 0; i < allFields.length; i++) {
            var el = document.getElementById(allFields[i]);
            if (el) {
                data[allFields[i]] = el.value.trim();
            }
        }

        // Client-side required field check
        var missing = [];
        for (var j = 0; j < cfg.fields.length; j++) {
            var key = cfg.fields[j];
            if (!data[key]) {
                missing.push(key);
                _showFieldError(key, 'This field is required');
            }
        }
        if (missing.length > 0) return;

        // Client-side email validation
        if (data.email && !_emailRe.test(data.email)) {
            _showFieldError('email', 'Enter a valid email address');
            return;
        }

        _email = data.email;

        // If geolocation is needed (mechanic), capture it before POST
        if (cfg.useGeolocation) {
            _captureGeolocationAndSubmit(cfg, data);
        } else {
            _submitRegistration(cfg, data);
        }
    }

    // ── Geolocation capture ──────────────────────────────────
    function _captureGeolocationAndSubmit(cfg, data) {
        if (!navigator.geolocation) {
            // Geolocation not supported — proceed without
            data.lat = null;
            data.lng = null;
            _showGeoNotice('Location not available — your browser does not support geolocation. You can update your location later from the dashboard.');
            _submitRegistration(cfg, data);
            return;
        }

        // Show loading state
        _showGeoStatus('Getting your location…');
        _setBtnLoading(_els.btnRegister, true);

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                // Success
                data.lat = pos.coords.latitude;
                data.lng = pos.coords.longitude;
                _hideGeoStatus();
                _submitRegistration(cfg, data);
            },
            function () {
                // Denied or error
                data.lat = null;
                data.lng = null;
                _hideGeoStatus();
                _showGeoNotice('Location not set — enable location access later from your dashboard to appear in nearby search.');
                _submitRegistration(cfg, data);
            },
            { timeout: 5000, enableHighAccuracy: false }
        );
    }

    // ── Submit registration POST ─────────────────────────────
    function _submitRegistration(cfg, data) {
        _postJSON(cfg.endpoint, data, _els.btnRegister, _els.registerError, function (body) {
            // Check if email delivery failed
            if (body.email_delivery === 'failed') {
                _showEmailWarning('Email delivery failed — check the server terminal for your OTP code.');
            }
            // Show OTP step
            _els.stepRegister.hidden = true;
            _els.stepOtp.hidden = false;
            _startCountdown(body.expires_in_seconds || 300);
            document.getElementById('otp').focus();
        });
    }

    // ── OTP submit ───────────────────────────────────────────
    function _handleOtp() {
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

        _postJSON('/auth/verify-otp', payload, _els.btnVerify, _els.otpError, function (body) {
            // Success — show token
            _stopCountdown();
            _els.stepOtp.hidden = true;
            _els.stepSuccess.hidden = false;
            _els.sessionToken.textContent = body.session_token;
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
                // Show exact error from backend
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

    // ── Geolocation UI helpers ───────────────────────────────
    function _showGeoNotice(msg) {
        if (_els.geoNotice) {
            _els.geoNotice.textContent = msg;
            _els.geoNotice.hidden = false;
        }
    }

    function _showGeoStatus(msg) {
        if (_els.geoStatus) {
            _els.geoStatus.textContent = msg;
            _els.geoStatus.hidden = false;
        }
    }

    function _hideGeoStatus() {
        if (_els.geoStatus) {
            _els.geoStatus.hidden = true;
        }
    }

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
        _clearError(_els.registerError);
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
