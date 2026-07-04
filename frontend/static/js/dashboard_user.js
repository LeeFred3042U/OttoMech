/* ═══════════════════════════════════════════════════════════
   OttoMech — dashboard_user.js
   User dashboard: issue select → job create → live tracking.
   IIFE module, same pattern as register.js / login.js.
   All state in JS module variables. No localStorage.
   sessionStorage used ONCE for token handoff (read + delete).
   ═══════════════════════════════════════════════════════════ */

var OttoDashboard = (function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    var _token = null;
    var _userId = null;
    var _role = null;
    var _socket = null;
    var _jobId = null;
    var _selectedIssue = null;
    var _photoBase64 = null;
    var _description = '';
    var _driverLat = null;
    var _driverLng = null;
    var _geoGranted = false;
    var _pollCount = 0;
    var _pollTimer = null;

    // Leaflet objects
    var _searchMap = null;
    var _trackMap = null;
    var _driverMarker = null;
    var _mechanicMarker = null;

    // ── DOM refs ─────────────────────────────────────────────
    var _els = {};

    // ── Orange/Blue Leaflet markers ──────────────────────────
    var _orangeIcon = null;
    var _blueIcon = null;

    function _createIcons() {
        _orangeIcon = L.divIcon({
            className: 'marker-driver',
            html: '<div style="width:16px;height:16px;background:#14161B;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
        _blueIcon = L.divIcon({
            className: 'marker-mechanic',
            html: '<div style="width:16px;height:16px;background:#2E6BE6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        // Read token handoff from sessionStorage (one-time)
        _token = sessionStorage.getItem('otto_token_handoff');
        _userId = sessionStorage.getItem('otto_id_handoff');
        _role = sessionStorage.getItem('otto_role_handoff');

        // Delete immediately — never cached
        sessionStorage.removeItem('otto_token_handoff');
        sessionStorage.removeItem('otto_id_handoff');
        sessionStorage.removeItem('otto_role_handoff');

        if (!_token) {
            window.location.href = '/login/user';
            return;
        }

        _createIcons();
        _cacheDom();
        _bindIssueCards();
        _bindPhotoUpload();
        _bindDescriptionToggle();
        _bindFindButton();
        _bindReceiptButton();
        _requestGeolocation();
        _connectSocket();
    }

    function _cacheDom() {
        _els.stepIssue = document.getElementById('step-issue');
        _els.stepSearching = document.getElementById('step-searching');
        _els.stepMatched = document.getElementById('step-matched');
        _els.stepTracking = document.getElementById('step-tracking');
        _els.stepComplete = document.getElementById('step-complete');
        _els.btnFind = document.getElementById('btn-find');
        _els.geoWarning = document.getElementById('geo-warning');
        _els.reconnectBanner = document.getElementById('reconnect-banner');
        _els.noMechanicsMsg = document.getElementById('no-mechanics-msg');
    }

    // ── Issue Selection ──────────────────────────────────────
    function _bindIssueCards() {
        var cards = document.querySelectorAll('.chip');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function () {
                // Deselect all
                var all = document.querySelectorAll('.chip');
                for (var j = 0; j < all.length; j++) {
                    all[j].classList.remove('selected');
                }
                this.classList.add('selected');
                _selectedIssue = this.getAttribute('data-issue');
                _updateFindButton();
            });
        }
    }

    function _updateFindButton() {
        var hasLocation = _geoGranted || (
            document.getElementById('manual-lat').value &&
            document.getElementById('manual-lng').value
        );
        _els.btnFind.disabled = !(_selectedIssue && hasLocation);
    }

    // ── Photo Upload ─────────────────────────────────────────
    function _bindPhotoUpload() {
        var input = document.getElementById('photo-upload');
        var thumb = document.getElementById('upload-thumb');
        var title = document.getElementById('upload-title');
        var hint = document.getElementById('upload-hint');
        var removeBtn = document.getElementById('upload-remove');
        var defaultThumbHTML = thumb.innerHTML;

        function reset() {
            _photoBase64 = null;
            input.value = '';
            thumb.innerHTML = defaultThumbHTML;
            title.textContent = 'Add a photo of the damage';
            hint.textContent = 'Camera or gallery · optional, max 1 MB';
            removeBtn.hidden = true;
        }

        input.addEventListener('change', function () {
            var file = input.files[0];
            if (!file) { reset(); return; }
            if (file.size > 1024 * 1024) {
                document.getElementById('err-photo').textContent = 'Photo must be under 1 MB';
                reset();
                return;
            }
            document.getElementById('err-photo').textContent = '';
            var reader = new FileReader();
            reader.onload = function (e) {
                _photoBase64 = e.target.result.split(',')[1]; // strip data URI prefix
                thumb.innerHTML = '<img src="' + e.target.result + '" alt="Damage photo">';
                title.textContent = 'Photo attached';
                hint.textContent = file.name;
                removeBtn.hidden = false;
            };
            reader.readAsDataURL(file);
        });

        removeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            reset();
        });
    }

    // ── Description Toggle ───────────────────────────────────
    function _bindDescriptionToggle() {
        var toggle = document.getElementById('desc-toggle');
        var panel = document.getElementById('desc-panel');
        var textarea = document.getElementById('issue-description');
        var count = document.getElementById('desc-count');

        toggle.addEventListener('click', function () {
            var willOpen = !panel.classList.contains('open');
            panel.classList.toggle('open', willOpen);
            toggle.classList.toggle('open', willOpen);
            if (willOpen) textarea.focus();
        });

        textarea.addEventListener('input', function () {
            _description = textarea.value;
            count.textContent = textarea.value.length;
        });
    }

    // ── Geolocation ──────────────────────────────────────────
    function _requestGeolocation() {
        if (!navigator.geolocation) {
            _showGeoWarning();
            return;
        }
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                _driverLat = pos.coords.latitude;
                _driverLng = pos.coords.longitude;
                _geoGranted = true;
                _setLocationText('Using your current location', false);
                _updateFindButton();
            },
            function () {
                _showGeoWarning();
            },
            { timeout: 8000, enableHighAccuracy: true }
        );
    }

    function _setLocationText(text, pending) {
        var row = document.getElementById('location-row');
        var label = document.getElementById('location-text');
        if (!row || !label) return;
        label.textContent = text;
        row.classList.toggle('pending', !!pending);
    }

    function _showGeoWarning() {
        _els.geoWarning.hidden = false;
        _setLocationText('Location needed — enter coordinates below', true);
        // Listen for manual input changes
        document.getElementById('manual-lat').addEventListener('input', _updateFindButton);
        document.getElementById('manual-lng').addEventListener('input', _updateFindButton);
    }

    // ── Find Mechanic ────────────────────────────────────────
    function _bindFindButton() {
        _els.btnFind.addEventListener('click', function () {
            _createJob();
        });
    }

    function _createJob() {
        // Resolve coordinates
        var lat = _driverLat;
        var lng = _driverLng;
        if (!_geoGranted) {
            lat = parseFloat(document.getElementById('manual-lat').value);
            lng = parseFloat(document.getElementById('manual-lng').value);
        }
        if (isNaN(lat) || isNaN(lng)) return;

        _driverLat = lat;
        _driverLng = lng;

        var payload = {
            issue_type: _selectedIssue,
            lat: lat,
            lng: lng,
        };
        if (_photoBase64) payload.photo_base64 = _photoBase64;
        if (_description) payload.description = _description;

        _setBtnLoading(_els.btnFind, true);

        fetch('/jobs/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _token,
            },
            body: JSON.stringify(payload),
        })
        .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
        .then(function (r) {
            _setBtnLoading(_els.btnFind, false);
            if (r.status === 201) {
                _jobId = r.body.job.job_id;

                // Join job room via socket
                if (_socket && _socket.connected) {
                    _socket.emit('join_job', { job_id: _jobId, role: 'user' });
                }

                // Transition to searching
                _showStep('searching');
                _initSearchMap();

                // Handle no mechanics notified
                if (r.body.mechanics_notified === 0) {
                    _els.noMechanicsMsg.hidden = false;
                    _startPolling();
                }
            }
        })
        .catch(function () {
            _setBtnLoading(_els.btnFind, false);
        });
    }

    // ── Poll for job status changes ──────────────────────────
    function _startPolling() {
        _pollCount = 0;
        _pollTimer = setInterval(function () {
            _pollCount++;
            if (_pollCount > 5) {
                clearInterval(_pollTimer);
                return;
            }
            fetch('/jobs/' + _jobId, {
                headers: { 'Authorization': 'Bearer ' + _token },
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.job && data.job.status !== 'pending') {
                    clearInterval(_pollTimer);
                }
            })
            .catch(function () {});
        }, 10000);
    }

    // ── Step management ──────────────────────────────────────
    function _showStep(step) {
        _els.stepIssue.hidden = step !== 'issue';
        _els.stepSearching.hidden = step !== 'searching';
        _els.stepMatched.hidden = step !== 'matched';
        _els.stepTracking.hidden = step !== 'tracking';
        _els.stepComplete.hidden = step !== 'complete';
    }

    // ── Leaflet Maps ─────────────────────────────────────────
    function _initSearchMap() {
        if (_searchMap) return;
        var container = document.getElementById('map-searching');
        _searchMap = L.map(container).setView([_driverLat, _driverLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_searchMap);
        L.marker([_driverLat, _driverLng], { icon: _orangeIcon }).addTo(_searchMap);
    }

    function _initTrackMap() {
        if (_trackMap) return;
        var container = document.getElementById('map-tracking');
        _trackMap = L.map(container).setView([_driverLat, _driverLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_trackMap);
        _driverMarker = L.marker([_driverLat, _driverLng], { icon: _orangeIcon }).addTo(_trackMap);
    }

    // ── Socket.IO ────────────────────────────────────────────
    function _connectSocket() {
        _socket = io(location.origin, { auth: { token: _token } });

        _socket.on('connect', function () {
            _els.reconnectBanner.hidden = true;
            // Rejoin job if we had one
            if (_jobId) {
                _socket.emit('join_job', { job_id: _jobId, role: 'user' });
            }
        });

        _socket.on('disconnect', function () {
            _els.reconnectBanner.hidden = false;
        });

        _socket.on('connect_error', function () {
            _els.reconnectBanner.hidden = false;
        });

        _socket.on('match_confirmed', function (data) {
            if (_pollTimer) clearInterval(_pollTimer);

            // Populate mechanic card (Step 3)
            document.getElementById('mech-name').textContent = data.mechanic_name || '—';
            document.getElementById('mech-workshop').textContent = data.workshop_name || '—';
            document.getElementById('mech-mri').textContent = data.mri_score != null ? data.mri_score.toFixed(0) : '—';
            var distKm = data.distance_km != null ? data.distance_km.toFixed(1) + ' km' : '—';
            document.getElementById('mech-distance').textContent = distKm;
            var etaMin = data.distance_km != null ? Math.ceil((data.distance_km * 1000) / 500) : '—';
            document.getElementById('mech-eta').textContent = etaMin + ' min';
            var phoneLink = document.getElementById('mech-phone-link');
            if (data.phone) {
                phoneLink.href = 'tel:' + data.phone;
                phoneLink.title = 'Call ' + data.phone;
                phoneLink.setAttribute('aria-label', 'Call ' + data.phone);
            }

            // Also populate tracking card
            document.getElementById('track-mech-name').textContent = data.mechanic_name || '—';
            document.getElementById('track-mech-workshop').textContent = data.workshop_name || '—';

            // Show matched step briefly, then transition to tracking
            _showStep('matched');
            setTimeout(function () {
                _showStep('tracking');
                _initTrackMap();
            }, 3000);
        });

        _socket.on('mechanic_ping', function (data) {
            var lat = data.lat;
            var lng = data.lng;
            var distM = data.distance_remaining_m;

            if (_trackMap) {
                if (!_mechanicMarker) {
                    _mechanicMarker = L.marker([lat, lng], { icon: _blueIcon }).addTo(_trackMap);
                } else {
                    _mechanicMarker.setLatLng([lat, lng]);
                }
                // Fit bounds to show both markers
                _trackMap.fitBounds([
                    [_driverLat, _driverLng],
                    [lat, lng],
                ], { padding: [40, 40] });
            }

            // Update ETA: 30 km/h = 500 m/min
            var etaMin = distM != null ? Math.ceil(distM / 500) : '—';
            document.getElementById('eta-badge').textContent = 'ETA: ' + etaMin + ' min';
        });

        _socket.on('job_completed', function (data) {
            var cashAmount = data.cash_amount != null ? '₹' + parseFloat(data.cash_amount).toFixed(0) : '₹—';
            document.getElementById('complete-cash').textContent = cashAmount;
            _showStep('complete');
        });
    }

    // ── Receipt Download ─────────────────────────────────────
    function _bindReceiptButton() {
        document.getElementById('btn-download-receipt').addEventListener('click', function () {
            if (!_jobId) return;
            var btn = this;
            _setBtnLoading(btn, true);

            fetch('/receipts/' + _jobId, {
                headers: { 'Authorization': 'Bearer ' + _token },
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                _setBtnLoading(btn, false);
                if (data.pdf_base64) {
                    var byteChars = atob(data.pdf_base64);
                    var byteNumbers = new Array(byteChars.length);
                    for (var i = 0; i < byteChars.length; i++) {
                        byteNumbers[i] = byteChars.charCodeAt(i);
                    }
                    var byteArray = new Uint8Array(byteNumbers);
                    var blob = new Blob([byteArray], { type: 'application/pdf' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'OttoMech-Receipt.pdf';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            })
            .catch(function () {
                _setBtnLoading(btn, false);
            });
        });
    }

    // ── Button loading state ─────────────────────────────────
    function _setBtnLoading(btn, loading) {
        btn.disabled = loading;
        var textEl = btn.querySelector('.btn-text');
        var loadEl = btn.querySelector('.btn-loading');
        if (textEl) textEl.hidden = loading;
        if (loadEl) loadEl.hidden = !loading;
    }

    // ── Auto-init on DOMContentLoaded ────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init: init };
})();