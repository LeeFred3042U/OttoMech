/* ═══════════════════════════════════════════════════════════
   OttoMech — dashboard_mechanic.js
   Mechanic dashboard: availability toggle, job accept, GPS emit.
   IIFE module. All state in JS variables. No localStorage.
   GPS interval cleared on: complete, beforeunload, offline.
   ═══════════════════════════════════════════════════════════ */

var OttoMechDashboard = (function () {
    'use strict';

    //  State 
    var _token = null;
    var _mechanicId = null;
    var _role = null;
    var _socket = null;
    var _isOnline = false;
    var _activeJobId = null;
    var _currentStep = 'status';
    var _gpsInterval = null;
    var _activeMap = null;
    var _idleMap = null;
    var _miniMaps = [];
    var _driverMarker = null;
    var _mechanicMarker = null;
    var _driverLat = null;
    var _driverLng = null;

    //  Leaflet icons 
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

    //  DOM refs ─
    var _els = {};

    //  Init ─
    function init() {
        _token = localStorage.getItem('otto_token_handoff');
        _mechanicId = localStorage.getItem('otto_id_handoff');
        _role = localStorage.getItem('otto_role_handoff');

        if (!_token || _role !== 'mechanic') {
            window.location.href = '/login/mechanic';
            return;
        }

        _createIcons();
        _cacheDom();
        _bindAvailability();
        _bindComplete();
        _bindBackOnline();
        _bindChat();
        _bindNavigation();
        _connectSocket();

        var savedJobId = localStorage.getItem('otto_active_job_id');
        if (savedJobId) {
            _activeJobId = savedJobId;
            _restoreActiveJob();
        }

        // Clean up GPS on page unload
        window.addEventListener('beforeunload', function () {
            _stopGps();
        });

        // Push Notifications
        _initPushNotifications();
    }

    function _restoreActiveJob() {
        fetch('/jobs/' + _activeJobId, {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.job && data.job.status === 'accepted') {
                    _driverLat = data.job.lat;
                    _driverLng = data.job.lng;

                    var issue = data.job.issue_type || '';
                    document.getElementById('active-issue-type').textContent = issue.replace(/_/g, ' ');

                    var activePhoneLink = document.getElementById('active-phone-link');
                    var activePhoneText = document.getElementById('active-phone-text');
                    if (data.job.driver_phone) {
                        if (activePhoneLink) {
                            activePhoneLink.href = 'tel:' + data.job.driver_phone;
                            activePhoneLink.title = 'Call ' + data.job.driver_phone;
                        }
                        if (activePhoneText) {
                            activePhoneText.textContent = data.job.driver_phone;
                        }
                    }

                    var activeModel = document.getElementById('active-vehicle-model');
                    if (activeModel) {
                        activeModel.textContent = data.job.vehicle_model || 'Not provided';
                    }

                    var photosContainer = document.getElementById('active-photos-container');
                    if (photosContainer) {
                        if (data.job.photos && data.job.photos.length > 0) {
                            photosContainer.innerHTML = '';
                            var photos = [];
                            try {
                                photos = JSON.parse(data.job.photos);
                            } catch (e) { }

                            if (photos.length > 0) {
                                photos.forEach(function (base64) {
                                    var img = document.createElement('img');
                                    img.src = base64;
                                    img.style.width = '60px';
                                    img.style.height = '60px';
                                    img.style.objectFit = 'cover';
                                    img.style.borderRadius = 'var(--radius-sm)';
                                    img.style.cursor = 'pointer';
                                    img.onclick = function () {
                                        var w = window.open();
                                        w.document.write('<img src="' + base64 + '" style="max-width:100%;">');
                                    };
                                    photosContainer.appendChild(img);
                                });
                            } else {
                                photosContainer.innerHTML = '<span style="color: var(--text-muted);">No photos provided</span>';
                            }
                        } else {
                            photosContainer.innerHTML = '<span style="color: var(--text-muted);">No photos provided</span>';
                        }
                    }

                    _loadChatMessages();
                    _showPanel('active');
                    _initActiveMap();
                    _startGps();

                    if (_socket && _socket.connected) {
                        _socket.emit('join_job', { job_id: _activeJobId, role: 'mechanic' });
                    }
                } else {
                    localStorage.removeItem('otto_active_job_id');
                    _activeJobId = null;
                }
            })
            .catch(function (e) { });
    }

    function _initPushNotifications() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        navigator.serviceWorker.register('/static/sw.js')
            .then(function (swReg) {
                return fetch('/push/vapid-public-key').then(function (r) { return r.json(); })
                    .then(function (data) {
                        var vapidPublicKey = data.public_key;
                        var convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
                        return swReg.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: convertedVapidKey
                        });
                    });
            })
            .then(function (subscription) {
                return fetch('/push/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + _token
                    },
                    body: JSON.stringify(subscription)
                });
            })
            .catch(function (err) {
                console.error('Push registration failed:', err);
            });
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function _cacheDom() {
        _els.panelStatus = document.getElementById('panel-status');
        _els.panelIncoming = document.getElementById('panel-incoming');
        _els.panelActive = document.getElementById('panel-active');
        _els.panelDone = document.getElementById('panel-done');
        _els.togglePill = document.getElementById('availability-toggle');
        _els.btnToggle = document.getElementById('availability-toggle');
        _els.toggleLabel = _els.togglePill.querySelector('.toggle-label');
        _els.toggleStatus = document.getElementById('availability-status');
        _els.waitingMsg = document.getElementById('waiting-msg');
        _els.jobCards = document.getElementById('job-cards-container');
        _els.noJobsMsg = document.getElementById('no-jobs-msg');
        _els.reconnectBanner = document.getElementById('reconnect-banner');
        _els.toast = document.getElementById('toast');
    }

    //  Availability Toggle 
    function _bindAvailability() {
        _els.togglePill.addEventListener('click', function () {
            _toggleOnline();
        });
    }

    function _toggleOnline() {
        var newState = !_isOnline;
        var btn = _els.btnToggle;
        if (btn) btn.disabled = true;

        var payload = { is_available: newState };

        function sendUpdate() {
            fetch('/mechanics/' + _mechanicId + '/availability', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + _token,
                },
                body: JSON.stringify(payload),
            })
                .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
                .then(function (result) {
                    if (btn) btn.disabled = false;
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
                            if (_idleMap) {
                                setTimeout(function () { _idleMap.invalidateSize(); }, 100);
                            }
                            if (!_activeJobId) {
                                _startIdleGps();
                            }
                        }
                    }
                })
                .catch(function () {
                    if (btn) btn.disabled = false;
                });
        }

        if (newState && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    payload.lat = pos.coords.latitude;
                    payload.lng = pos.coords.longitude;
                    // Register location with backend for proximity matching
                    if (_socket && _socket.connected) {
                        _socket.emit('mechanic_online', {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                        });
                    }
                    _initIdleMap(pos.coords.latitude, pos.coords.longitude);
                    sendUpdate();
                },
                function () {
                    sendUpdate();
                },
                { timeout: 5000, enableHighAccuracy: true }
            );
        } else {
            sendUpdate();
        }
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

    //  Socket.IO 
    function _connectSocket() {
        _socket = io(location.origin, { auth: { token: _token } });

        _socket.on('connect', function () {
            _els.reconnectBanner.hidden = true;
            // Re-broadcast location if mechanic is already marked online
            if (_isOnline && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        _socket.emit('mechanic_online', {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                        });
                    },
                    function () { /* location unavailable on reconnect — silently skip */ },
                    { timeout: 5000, enableHighAccuracy: true }
                );
            }
            if (_activeJobId) {
                _socket.emit('join_job', { job_id: _activeJobId, role: 'mechanic' });
            }
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
            localStorage.removeItem('otto_active_job_id');
            _activeJobId = null;
            _showPanel('done');
        });

        _socket.on('chat_message', function (data) {
            _appendChatMessage(data);
        });
    }

    //  Job Card Rendering ─
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
                _miniMaps.push(miniMap);
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

    //  Accept Job ─
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
                    localStorage.setItem('otto_active_job_id', _activeJobId);
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

                    var activePhoneLink = document.getElementById('active-phone-link');
                    var activePhoneText = document.getElementById('active-phone-text');
                    if (result.body.job && result.body.job.driver_phone) {
                        if (activePhoneLink) {
                            activePhoneLink.href = 'tel:' + result.body.job.driver_phone;
                            activePhoneLink.title = 'Call ' + result.body.job.driver_phone;
                        }
                        if (activePhoneText) {
                            activePhoneText.textContent = result.body.job.driver_phone;
                        }
                    }

                    var activeModel = document.getElementById('active-vehicle-model');
                    if (activeModel && result.body.job) {
                        activeModel.textContent = result.body.job.vehicle_model || 'Not provided';
                    }

                    var photosContainer = document.getElementById('active-photos-container');
                    if (photosContainer && result.body.job) {
                        if (result.body.job.photos && result.body.job.photos.length > 0) {
                            photosContainer.innerHTML = '';
                            var photos = [];
                            try {
                                photos = JSON.parse(result.body.job.photos);
                            } catch (e) { }

                            if (photos.length > 0) {
                                photos.forEach(function (base64) {
                                    var img = document.createElement('img');
                                    img.src = base64;
                                    img.style.width = '60px';
                                    img.style.height = '60px';
                                    img.style.objectFit = 'cover';
                                    img.style.borderRadius = 'var(--radius-sm)';
                                    img.style.cursor = 'pointer';
                                    img.onclick = function () {
                                        var w = window.open();
                                        w.document.write('<img src="' + base64 + '" style="max-width:100%;">');
                                    };
                                    photosContainer.appendChild(img);
                                });
                            } else {
                                photosContainer.innerHTML = '<span style="color: var(--text-muted);">No photos provided</span>';
                            }
                        } else {
                            photosContainer.innerHTML = '<span style="color: var(--text-muted);">No photos provided</span>';
                        }
                    }

                    _loadChatMessages();
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
            .catch(function () { });
    }

    //  Active Job Map ─
    function _initActiveMap() {
        if (_activeMap) {
            _activeMap.remove();
            _activeMap = null;
        }
        _driverMarker = null;
        _mechanicMarker = null;
        var container = document.getElementById('map-active');
        var lat = _driverLat || 26.855;
        var lng = _driverLng || 80.94;
        _activeMap = L.map(container).setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_activeMap);
        _driverMarker = L.marker([lat, lng], { icon: _orangeIcon }).addTo(_activeMap);
        setTimeout(function () { if (_activeMap) _activeMap.invalidateSize(); }, 100);
    }

    //  Idle Map (while online, waiting for jobs) 
    function _initIdleMap(lat, lng) {
        var container = document.getElementById('map-idle');
        if (!container) return;
        if (_idleMap) {
            _idleMap.setView([lat, lng], 14);
            setTimeout(function () { _idleMap.invalidateSize(); }, 100);
            return;
        }
        _idleMap = L.map(container, { zoomControl: false }).setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_idleMap);
        L.marker([lat, lng], { icon: _blueIcon }).addTo(_idleMap);
        setTimeout(function () { if (_idleMap) _idleMap.invalidateSize(); }, 100);
    }

    //  Invalidate all active Leaflet maps ─
    function _invalidateMaps() {
        if (_activeMap) _activeMap.invalidateSize();
        if (_idleMap) _idleMap.invalidateSize();
    }

    //  Idle GPS Emit Loop (No Job) 
    function _startIdleGps() {
        _stopGps(); // clear any existing interval
        _gpsInterval = setInterval(function () {
            if (_activeJobId || !_isOnline) { _stopGps(); return; }
            if (!navigator.geolocation) return;

            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    var lat = pos.coords.latitude;
                    var lng = pos.coords.longitude;

                    // Just update DB in the background
                    fetch('/mechanics/' + _mechanicId + '/availability', {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + _token,
                        },
                        body: JSON.stringify({
                            is_available: true,
                            lat: lat,
                            lng: lng
                        })
                    }).catch(function () { });
                },
                function () { },
                { timeout: 5000, enableHighAccuracy: true }
            );
        }, 30000); // every 30s while idle
    }

    //  GPS Emit Loop (Active Job) ─
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

    //  Mark Complete 
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
                .catch(function () { });
        });
    }

    //  Back Online 
    function _bindBackOnline() {
        document.getElementById('btn-back-online').addEventListener('click', function () {
            // Bug #6 fix: destroy orphaned mini-map Leaflet instances before clearing DOM
            _miniMaps.forEach(function (m) { try { m.remove(); } catch (e) { } });
            _miniMaps = [];
            _showPanel('status');
            _els.panelIncoming.hidden = !_isOnline;
            // Clear old job cards
            _els.jobCards.innerHTML = '<p class="empty-state" id="no-jobs-msg">Waiting for job requests…</p>';
            _els.noJobsMsg = document.getElementById('no-jobs-msg');
        });
    }

    //  Panel Management ─
    function _showPanel(panel) {
        _currentStep = panel;
        _els.panelStatus.hidden = panel !== 'status';
        _els.panelIncoming.hidden = panel !== 'status' && panel !== 'incoming';
        _els.panelActive.hidden = panel !== 'active';
        _els.panelDone.hidden = panel !== 'done';

        // Show incoming alongside status when online
        if (panel === 'status' && _isOnline) {
            _els.panelIncoming.hidden = false;
            if (_idleMap) {
                setTimeout(function () { _idleMap.invalidateSize(); }, 100);
            }
        }

        // Bug #8 fix: invalidate all Leaflet maps after visibility changes
        setTimeout(_invalidateMaps, 50);
    }

    //  Toast 
    function _showToast(msg) {
        _els.toast.textContent = msg;
        _els.toast.hidden = false;
        setTimeout(function () {
            _els.toast.hidden = true;
        }, 3000);
    }

    //  HTML escaping 
    function _escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    //  Navigation & Tabs 
    function _bindNavigation() {
        var tabJobs = document.getElementById('tab-jobs');
        var tabEarnings = document.getElementById('tab-earnings');
        var tabAccount = document.getElementById('tab-account');
        if (!tabJobs || !tabEarnings || !tabAccount) return;

        var panelAccount = document.getElementById('panel-account');
        var panelStatus = document.getElementById('panel-status');
        var panelIncoming = document.getElementById('panel-incoming');
        var panelActive = document.getElementById('panel-active');
        var panelDone = document.getElementById('panel-done');

        var panelEarnings = document.getElementById('panel-earnings');

        function switchTab(tabId) {
            tabJobs.classList.toggle('active', tabId === 'jobs');
            tabEarnings.classList.toggle('active', tabId === 'earnings');
            tabAccount.classList.toggle('active', tabId === 'account');

            if (tabId === 'account') {
                if (panelStatus) panelStatus.hidden = true;
                if (panelIncoming) panelIncoming.hidden = true;
                if (panelActive) panelActive.hidden = true;
                if (panelDone) panelDone.hidden = true;
                if (panelEarnings) panelEarnings.hidden = true;
                if (panelAccount) panelAccount.hidden = false;
                _fetchAccount();
            } else if (tabId === 'earnings') {
                if (panelStatus) panelStatus.hidden = true;
                if (panelIncoming) panelIncoming.hidden = true;
                if (panelActive) panelActive.hidden = true;
                if (panelDone) panelDone.hidden = true;
                if (panelAccount) panelAccount.hidden = true;
                if (panelEarnings) panelEarnings.hidden = false;
                _fetchEarnings();
            } else {
                if (panelAccount) panelAccount.hidden = true;
                if (panelEarnings) panelEarnings.hidden = true;
                _showPanel(_currentStep || 'status');
            }
        }

        tabJobs.addEventListener('click', function () { switchTab('jobs'); });
        tabEarnings.addEventListener('click', function () { switchTab('earnings'); });
        tabAccount.addEventListener('click', function () { switchTab('account'); });

        var btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', function () {
                localStorage.removeItem('otto_token_handoff');
                localStorage.removeItem('otto_id_handoff');
                localStorage.removeItem('otto_role_handoff');
                window.location.href = '/login/mechanic';
            });
        }
    }

    function _fetchAccount() {
        fetch('/auth/me', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.profile) {
                    document.getElementById('acct-name').textContent = data.profile.first_name + (data.profile.last_name ? ' ' + data.profile.last_name : '');
                    document.getElementById('acct-workshop').textContent = data.profile.workshop_name || '—';
                    document.getElementById('acct-email').textContent = data.profile.email;
                    document.getElementById('acct-status').textContent = data.profile.status;

                    var badge = document.getElementById('acct-email-badge');
                    if (badge) badge.style.display = data.profile.email_verified ? 'none' : 'inline-block';

                    var setPwdBtn = document.getElementById('btn-set-password');
                    if (setPwdBtn) {
                        setPwdBtn.style.display = (data.profile.status === 'PENDING_PASSWORD' || !data.profile.password_hash_exists) ? 'block' : 'none';
                        setPwdBtn.onclick = function () {
                            var loadEl = setPwdBtn.querySelector('.btn-loading');
                            var textEl = setPwdBtn.querySelector('.btn-text');
                            if (textEl) textEl.hidden = true;
                            if (loadEl) loadEl.hidden = false;

                            fetch('/auth/login/mechanic/request-setup-link', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email: data.profile.email })
                            }).then(function () {
                                if (textEl) textEl.hidden = false;
                                if (loadEl) loadEl.hidden = true;
                                alert('Check terminal for the setup link!');
                            }).catch(function () {
                                if (textEl) textEl.hidden = false;
                                if (loadEl) loadEl.hidden = true;
                            });
                        };
                    }
                }
            })
            .catch(function (err) {
                document.getElementById('acct-status').textContent = 'Error loading account';
            });
    }

    //  Earnings Logic ─
    function _fetchEarnings() {
        var panelEarnings = document.getElementById('panel-earnings');
        if (!panelEarnings) return;

        panelEarnings.innerHTML = '<p>Loading earnings...</p>';

        fetch('/mechanics/' + _mechanicId + '/earnings', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.error) {
                    panelEarnings.innerHTML = '<p class="error-msg">Failed to load earnings: ' + data.error + '</p>';
                    return;
                }

                var html = '<div class="card"><h1>Earnings Dashboard</h1>';
                html += '<h2>Total Earnings: ₹' + (data.total_earnings || 0).toFixed(2) + '</h2>';

                if (!data.jobs || data.jobs.length === 0) {
                    html += '<p class="empty-state">No completed jobs yet.</p>';
                } else {
                    html += '<div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">';
                    data.jobs.forEach(function (job) {
                        var d = new Date(job.completed_at);
                        html += '<div style="padding: 1rem; border: 1px solid var(--gray-200); border-radius: var(--radius-md); display: flex; justify-content: space-between;">';
                        html += '<div><strong>' + (job.issue_type || 'Job').replace(/_/g, ' ') + '</strong><br>';
                        html += '<small class="gray-text">' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString() + '</small></div>';
                        html += '<div style="font-weight: 600;">₹' + job.cash_amount.toFixed(2) + '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                }

                html += '</div>';
                panelEarnings.innerHTML = html;
            })
            .catch(function (err) {
                panelEarnings.innerHTML = '<p class="error-msg">Failed to load earnings.</p>';
            });
    }

    //  Chat Logic ─
    function _bindChat() {
        var btnSend = document.getElementById('btn-send-chat');
        var inputChat = document.getElementById('chat-input');
        if (!btnSend || !inputChat) return;

        btnSend.addEventListener('click', function () {
            var msg = inputChat.value.trim();
            if (!msg || !_activeJobId || !_socket) return;

            _socket.emit('chat_message', {
                session_token: _token,
                job_id: _activeJobId,
                message: msg
            });
            inputChat.value = '';
        });

        inputChat.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                btnSend.click();
            }
        });
    }

    function _loadChatMessages() {
        var container = document.getElementById('chat-messages');
        if (!container || !_activeJobId) return;

        container.innerHTML = '';
        fetch('/jobs/' + _activeJobId + '/messages', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.messages) {
                    data.messages.forEach(_appendChatMessage);
                }
            })
            .catch(function (err) { console.error('Failed to load chat:', err); });
    }

    function _appendChatMessage(data) {
        var container = document.getElementById('chat-messages');
        if (!container) return;

        var isMe = data.sender_role === 'mechanic';
        var div = document.createElement('div');
        div.style.padding = '0.5rem';
        div.style.borderRadius = 'var(--radius-sm)';
        div.style.maxWidth = '80%';
        div.style.alignSelf = isMe ? 'flex-end' : 'flex-start';
        div.style.background = isMe ? 'var(--brand-darkest)' : 'var(--bg-surface)';
        div.style.color = isMe ? '#fff' : 'var(--text-primary)';
        div.style.border = isMe ? 'none' : '1px solid var(--border-subtle)';

        div.textContent = data.message;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    //  Auto-init on DOMContentLoaded 
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Automatically go online after short delay if offline
    setTimeout(function () {
        if (!_isOnline) {
            _toggleOnline();
        }
    }, 1000);

    return { init: init };
})();
