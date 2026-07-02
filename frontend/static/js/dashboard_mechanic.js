/* ═══════════════════════════════════════════════════════════
   OttoMech — dashboard_mechanic.js
   Mechanic dashboard: availability toggle, job accept, GPS emit.
   IIFE module. All state in JS variables. No localStorage.
   GPS interval cleared on: complete, beforeunload, offline.
   ═══════════════════════════════════════════════════════════ */

var OttoMechDashboard = (function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    var _token = null;
    var _mechanicId = null;
    var _role = null;
    var _socket = null;
    var _isOnline = false;
    var _activeJobId = null;
    var _gpsInterval = null;
    var _activeMap = null;
    var _driverMarker = null;
    var _mechanicMarker = null;
    var _driverLat = null;
    var _driverLng = null;

    // ── Leaflet icons ────────────────────────────────────────
    var _orangeIcon = null;
    var _blueIcon = null;

    function _createIcons() {
        _orangeIcon = L.divIcon({
            className: 'marker-driver',
            html: '<div style="width:16px;height:16px;background:#F5A623;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
        _blueIcon = L.divIcon({
            className: 'marker-mechanic',
            html: '<div style="width:16px;height:16px;background:#007AFF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
    }

    // ── DOM refs ─────────────────────────────────────────────
    var _els = {};

    // ── Init ─────────────────────────────────────────────────
    function init() {
        _token = sessionStorage.getItem('otto_token_handoff');
        _mechanicId = sessionStorage.getItem('otto_id_handoff');
        _role = sessionStorage.getItem('otto_role_handoff');

        sessionStorage.removeItem('otto_token_handoff');
        sessionStorage.removeItem('otto_id_handoff');
        sessionStorage.removeItem('otto_role_handoff');

        if (!_token) {
            window.location.href = '/login/mechanic';
            return;
        }

        _createIcons();
        _cacheDom();
        _bindAvailability();
        _bindComplete();
        _bindBackOnline();
        _connectSocket();

        // Clean up GPS on page unload
        window.addEventListener('beforeunload', function () {
            _stopGps();
        });
    }

    function _cacheDom() {
        _els.panelStatus = document.getElementById('panel-status');
        _els.panelIncoming = document.getElementById('panel-incoming');
        _els.panelActive = document.getElementById('panel-active');
        _els.panelDone = document.getElementById('panel-done');
        _els.togglePill = document.getElementById('availability-toggle');
        _els.toggleLabel = _els.togglePill.querySelector('.toggle-label');
        _els.toggleStatus = document.getElementById('availability-status');
        _els.waitingMsg = document.getElementById('waiting-msg');
        _els.jobCards = document.getElementById('job-cards-container');
        _els.noJobsMsg = document.getElementById('no-jobs-msg');
        _els.reconnectBanner = document.getElementById('reconnect-banner');
        _els.toast = document.getElementById('toast');
    }

    // ── Availability Toggle ──────────────────────────────────
    function _bindAvailability() {
        _els.togglePill.addEventListener('click', function () {
            _toggleAvailability();
        });
    }

    function _toggleAvailability() {
        var newState = !_isOnline;

        fetch('/mechanics/' + _mechanicId + '/availability', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _token,
            },
            body: JSON.stringify({ is_available: newState }),
        })
        .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
        .then(function (result) {
            if (result.status === 200) {
                _isOnline = result.body.is_available;
                _updateToggleUI();

                if (!_isOnline) {
                    _stopGps();
                    _els.panelIncoming.hidden = true;
                    _els.waitingMsg.hidden = true;
                } else {
                    _els.panelIncoming.hidden = false;
                    _els.waitingMsg.hidden = false;
                }
            }
        })
        .catch(function () {});
    }

    function _updateToggleUI() {
        if (_isOnline) {
            _els.togglePill.classList.add('active');
            _els.toggleLabel.textContent = 'Go Offline';
            _els.toggleStatus.textContent = 'Online';
        } else {
            _els.togglePill.classList.remove('active');
            _els.toggleLabel.textContent = 'Go Online';
            _els.toggleStatus.textContent = 'Offline';
        }
    }

    // ── Socket.IO ────────────────────────────────────────────
    function _connectSocket() {
        _socket = io(location.origin, { auth: { token: _token } });

        _socket.on('connect', function () {
            _els.reconnectBanner.hidden = true;
        });

        _socket.on('disconnect', function () {
            _els.reconnectBanner.hidden = false;
        });

        _socket.on('connect_error', function () {
            _els.reconnectBanner.hidden = false;
        });

        _socket.on('new_job', function (data) {
            _renderJobCard(data);
        });

        _socket.on('job_completed', function () {
            _stopGps();
            _activeJobId = null;
            _showPanel('done');
        });
    }

    // ── Job Card Rendering ───────────────────────────────────
    function _renderJobCard(data) {
        _els.noJobsMsg.hidden = true;

        var card = document.createElement('div');
        card.className = 'job-card';
        card.setAttribute('data-job-id', data.job_id);

        var issueLabel = (data.issue_type || 'unknown').replace(/_/g, ' ');
        card.innerHTML =
            '<div class="job-card-header">' +
                '<span class="job-type">' + _escapeHtml(issueLabel) + '</span>' +
                '<span class="job-distance">📍 Nearby</span>' +
            '</div>' +
            '<div class="map-thumbnail" id="map-job-' + data.job_id + '"></div>' +
            '<div class="job-card-actions">' +
                '<button class="btn-accept" data-job-id="' + data.job_id +
                    '" data-lat="' + (data.driver_lat || 0) +
                    '" data-lng="' + (data.driver_lng || 0) + '">Accept</button>' +
            '</div>';

        _els.jobCards.appendChild(card);

        // Init small map thumbnail
        setTimeout(function () {
            var mapEl = document.getElementById('map-job-' + data.job_id);
            if (mapEl && data.driver_lat && data.driver_lng) {
                var miniMap = L.map(mapEl, {
                    zoomControl: false,
                    dragging: false,
                    scrollWheelZoom: false,
                }).setView([data.driver_lat, data.driver_lng], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OSM',
                }).addTo(miniMap);
                L.marker([data.driver_lat, data.driver_lng], { icon: _orangeIcon }).addTo(miniMap);
            }
        }, 100);

        // Bind accept button
        var acceptBtn = card.querySelector('.btn-accept');
        acceptBtn.addEventListener('click', function () {
            _acceptJob(
                this.getAttribute('data-job-id'),
                parseFloat(this.getAttribute('data-lat')),
                parseFloat(this.getAttribute('data-lng'))
            );
        });
    }

    // ── Accept Job ───────────────────────────────────────────
    function _acceptJob(jobId, driverLat, driverLng) {
        fetch('/jobs/' + jobId + '/accept', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _token,
            },
            body: JSON.stringify({ mechanic_id: _mechanicId }),
        })
        .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
        .then(function (result) {
            if (result.status === 200) {
                _activeJobId = jobId;
                _driverLat = driverLat;
                _driverLng = driverLng;

                // Join job room
                if (_socket && _socket.connected) {
                    _socket.emit('join_job', { job_id: jobId, role: 'mechanic' });
                }

                // Set issue type display
                var issue = result.body.job ? result.body.job.issue_type : '';
                document.getElementById('active-issue-type').textContent =
                    (issue || 'unknown').replace(/_/g, ' ');

                _showPanel('active');
                _initActiveMap();
                _startGps();
            } else if (result.status === 409) {
                // Job taken by another mechanic
                _showToast('Job taken by another mechanic');
                var card = document.querySelector('[data-job-id="' + jobId + '"]');
                if (card) card.remove();
            }
        })
        .catch(function () {});
    }

    // ── Active Job Map ───────────────────────────────────────
    function _initActiveMap() {
        if (_activeMap) {
            _activeMap.remove();
            _activeMap = null;
        }
        var container = document.getElementById('map-active');
        var lat = _driverLat || 26.855;
        var lng = _driverLng || 80.94;
        _activeMap = L.map(container).setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_activeMap);
        _driverMarker = L.marker([lat, lng], { icon: _orangeIcon }).addTo(_activeMap);
        _mechanicMarker = null;
    }

    // ── GPS Emit Loop ────────────────────────────────────────
    function _startGps() {
        _stopGps(); // clear any existing interval
        _gpsInterval = setInterval(function () {
            if (!_activeJobId) { _stopGps(); return; }
            if (!navigator.geolocation) return; // skip silently
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    var lat = pos.coords.latitude;
                    var lng = pos.coords.longitude;

                    if (_socket && _socket.connected) {
                        _socket.emit('mechanic_location', {
                            job_id: _activeJobId,
                            lat: lat,
                            lng: lng,
                            timestamp: new Date().toISOString(),
                        });
                    }

                    // Update own marker on active map
                    if (_activeMap) {
                        if (!_mechanicMarker) {
                            _mechanicMarker = L.marker([lat, lng], { icon: _blueIcon }).addTo(_activeMap);
                        } else {
                            _mechanicMarker.setLatLng([lat, lng]);
                        }
                    }
                },
                function () {
                    // Geolocation error — skip silently, retry next interval
                },
                { timeout: 3000, enableHighAccuracy: true }
            );
        }, 4000);
    }

    function _stopGps() {
        if (_gpsInterval) {
            clearInterval(_gpsInterval);
            _gpsInterval = null;
        }
    }

    // ── Mark Complete ────────────────────────────────────────
    function _bindComplete() {
        document.getElementById('btn-complete').addEventListener('click', function () {
            var cashInput = document.getElementById('cash-amount');
            var cashStr = cashInput.value.trim();
            var errEl = document.getElementById('err-cash');

            errEl.textContent = '';

            if (!cashStr || isNaN(parseFloat(cashStr)) || parseFloat(cashStr) < 0) {
                errEl.textContent = 'Enter a valid non-negative amount';
                return;
            }

            var cashAmount = parseFloat(cashStr);

            fetch('/jobs/' + _activeJobId + '/complete', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + _token,
                },
                body: JSON.stringify({ cash_amount: cashAmount, warranty_days: 0 }),
            })
            .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
            .then(function (result) {
                if (result.status === 200) {
                    _stopGps();
                    _activeJobId = null;
                    _showPanel('done');
                }
            })
            .catch(function () {});
        });
    }

    // ── Back Online ──────────────────────────────────────────
    function _bindBackOnline() {
        document.getElementById('btn-back-online').addEventListener('click', function () {
            _showPanel('status');
            _els.panelIncoming.hidden = !_isOnline;
            // Clear old job cards
            _els.jobCards.innerHTML = '<p class="empty-state" id="no-jobs-msg">Waiting for job requests…</p>';
            _els.noJobsMsg = document.getElementById('no-jobs-msg');
        });
    }

    // ── Panel Management ─────────────────────────────────────
    function _showPanel(panel) {
        _els.panelStatus.hidden = panel !== 'status';
        _els.panelIncoming.hidden = panel !== 'status' && panel !== 'incoming';
        _els.panelActive.hidden = panel !== 'active';
        _els.panelDone.hidden = panel !== 'done';

        // Show incoming alongside status when online
        if (panel === 'status' && _isOnline) {
            _els.panelIncoming.hidden = false;
        }
    }

    // ── Toast ────────────────────────────────────────────────
    function _showToast(msg) {
        _els.toast.textContent = msg;
        _els.toast.hidden = false;
        setTimeout(function () {
            _els.toast.hidden = true;
        }, 3000);
    }

    // ── HTML escaping ────────────────────────────────────────
    function _escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Auto-init ────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init: init };
})();
