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
    var _currentStep = 'issue';
    var _socket = null;
    var _jobId = null;
    var _selectedIssues = [];
    var _photosBase64 = [];
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
            html: '<img src="/static/img/motorbike.svg" style="width:32px;height:32px;filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.3));">',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
        });
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        // Read token handoff from localStorage
        _token = localStorage.getItem('otto_token_handoff');
        _userId = localStorage.getItem('otto_id_handoff');
        _role = localStorage.getItem('otto_role_handoff');

        if (!_token || _role !== 'user') {
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
        _bindRating();
        _bindChat();
        _bindNavigation();
        _bindGeolocation();
        _requestGeolocation();
        _connectSocket();
        
        _prefetchWorkshops();

        // Check for active job on reload
        var savedJobId = localStorage.getItem('otto_active_job_id');
        if (savedJobId) {
            _jobId = savedJobId;
            _restoreActiveJob();
        }
    }

    function _restoreActiveJob() {
        fetch('/jobs/' + _jobId, {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.job) {
                if (data.job.status === 'pending') {
                    _showStep('searching');
                    _initSearchMap();
                    _startPolling();
                } else if (data.job.status === 'accepted') {
                    // Bug #7 fix: restore driver coords before map init to prevent fitBounds null crash
                    _driverLat = parseFloat(data.job.lat);
                    _driverLng = parseFloat(data.job.lng);
                    _showStep('matched');
                    document.getElementById('mechanic-name') && (document.getElementById('mechanic-name').textContent = data.job.mechanic_name || 'Mechanic');
                    _loadChatMessages();
                    setTimeout(function() {
                        _showStep('tracking');
                        _initTrackMap();
                        setTimeout(function() { if (_trackMap) _trackMap.invalidateSize(); }, 150);
                    }, 3000);
                } else if (data.job.status === 'completed') {
                    localStorage.removeItem('otto_active_job_id');
                }
            } else {
                localStorage.removeItem('otto_active_job_id');
                _jobId = null;
            }
        })
        .catch(function(e) {});
    }

    function _prefetchWorkshops() {
        if (!_token) return;
        fetch('/mechanics/available?limit=5', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.mechanics) {
                localStorage.setItem('otto_cached_workshops', JSON.stringify(data.mechanics));
            }
        })
        .catch(function() {
            // Silently fail if offline
        });
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
        var vehicleInput = document.getElementById('vehicle_model');
        if (vehicleInput) {
            vehicleInput.addEventListener('input', _updateFindButton);
        }
        var cards = document.querySelectorAll('.chip');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function () {
                var issue = this.getAttribute('data-issue');
                if (issue === 'other') {
                    // Exclusive "other"
                    for (var j = 0; j < cards.length; j++) cards[j].classList.remove('selected');
                    this.classList.add('selected');
                    _selectedIssues = ['other'];
                } else {
                    // Toggle current, remove "other"
                    this.classList.toggle('selected');
                    var otherCard = document.querySelector('.chip[data-issue="other"]');
                    if (otherCard) otherCard.classList.remove('selected');
                    
                    var index = _selectedIssues.indexOf('other');
                    if (index > -1) _selectedIssues.splice(index, 1);
                    
                    var issueIndex = _selectedIssues.indexOf(issue);
                    if (this.classList.contains('selected')) {
                        if (issueIndex === -1) _selectedIssues.push(issue);
                    } else {
                        if (issueIndex > -1) _selectedIssues.splice(issueIndex, 1);
                    }
                }
                _updateFindButton();
            });
        }
    }

    function _updateFindButton() {
        var vehicleModel = document.getElementById('vehicle_model') ? document.getElementById('vehicle_model').value.trim() : '';
        var hasLocation = _geoGranted;
        _els.btnFind.disabled = !(_selectedIssues.length > 0 && hasLocation && vehicleModel && _photosBase64.length > 0);
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
            _photosBase64 = [];
            input.value = '';
            thumb.innerHTML = defaultThumbHTML;
            title.textContent = 'Add photo(s)';
            hint.textContent = 'Camera or gallery · mandatory, max 30 MB';
            removeBtn.hidden = true;
            _updateFindButton();
        }

        input.addEventListener('change', function () {
            var files = input.files;
            if (!files || files.length === 0) return;
            
            var totalSize = 0;
            for (var i = 0; i < files.length; i++) {
                totalSize += files[i].size;
            }
            if (totalSize > 30 * 1024 * 1024) {
                document.getElementById('err-photo').textContent = 'New photos must be under 30 MB';
                return;
            }
            
            document.getElementById('err-photo').textContent = '';
            var loaded = 0;
            
            Array.from(files).forEach(function(file) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    _photosBase64.push(e.target.result);
                    loaded++;
                    if (loaded === files.length) {
                        thumb.innerHTML = '<img src="' + e.target.result + '" style="width:100%; height:100%; object-fit:cover;">';
                        title.textContent = _photosBase64.length + ' photo(s) added';
                        hint.textContent = 'Tap × to remove all';
                        removeBtn.hidden = false;
                        _updateFindButton();
                    }
                };
                reader.readAsDataURL(file);
            });
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
    function _bindGeolocation() {
        var btnGetLoc = document.getElementById('btn-get-location');
        if (btnGetLoc) {
            btnGetLoc.addEventListener('click', function() {
                _requestGeolocation();
            });
        }
    }

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
        _setLocationText('Location access needed', true);
        _updateFindButton();
    }

    // ── Find Mechanic ────────────────────────────────────────
    function _bindFindButton() {
        _els.btnFind.addEventListener('click', function () {
            _createJob();
        });
        
        var btnTryAgain = document.getElementById('btn-try-again');
        if (btnTryAgain) {
            btnTryAgain.addEventListener('click', function () {
                // Bug #5 fix: destroy stale search map so next job gets a fresh one
                if (_searchMap) { _searchMap.remove(); _searchMap = null; }
                _showStep('issue');
                _els.btnFind.disabled = false;
                _els.noMechanicsMsg.hidden = true;
            });
        }
        
        var btnCallDirectly = document.getElementById('btn-call-directly');
        if (btnCallDirectly) {
            btnCallDirectly.addEventListener('click', function () {
                if (_pollTimer) clearInterval(_pollTimer);
                _showFallback();
            });
        }
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
        var vehicleModel = document.getElementById('vehicle_model') ? document.getElementById('vehicle_model').value.trim() : '';

        var payload = {
            issue_type: _selectedIssues.join(','),
            vehicle_model: vehicleModel,
            lat: lat,
            lng: lng,
        };
        if (_photosBase64.length > 0) payload.photos = _photosBase64;
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
                localStorage.setItem('otto_active_job_id', _jobId);

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
                }
                
                // Start polling/timeout for fallback
                _startPolling();
            }
        })
        .catch(function (error) {
            _setBtnLoading(_els.btnFind, false);
            if (!navigator.onLine || error.name === 'TypeError') {
                _showFallback();
            }
        });
    }

    // ── Poll for job status changes ──────────────────────────
    function _startPolling() {
        _pollCount = 0;
        _pollTimer = setInterval(function () {
            _pollCount++;
            if (_pollCount > 6) { // 60 seconds total
                clearInterval(_pollTimer);
                _showFallback();
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
    
    function _showFallback() {
        _showStep('fallback');
        
        var listContainer = document.getElementById('fallback-mechanics-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.875rem;">Loading mechanics...</p>';
        
        fetch('/mechanics/available?limit=5', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            _renderFallbackMechanics(listContainer, data.mechanics);
        })
        .catch(function() {
            var cached = localStorage.getItem('otto_cached_workshops');
            if (cached) {
                try {
                    var mechanics = JSON.parse(cached);
                    _renderFallbackMechanics(listContainer, mechanics);
                    return;
                } catch(e) {}
            }
            listContainer.innerHTML = '<p style="text-align: center; color: var(--error); font-size: 0.875rem;">Failed to load mechanics.</p>';
        });
    }

    function _renderFallbackMechanics(listContainer, mechanics) {
        listContainer.innerHTML = '';
        if (!mechanics || mechanics.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.875rem;">No other mechanics found.</p>';
            return;
        }
        
        mechanics.forEach(function(mech) {
            var rating = mech.rating ? mech.rating + ' ★' : 'New';
            var html = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100);">
                    <div>
                        <p style="font-weight: 500; font-size: 0.875rem;">${mech.first_name} ${mech.last_name} <span style="color: var(--warning); font-size: 0.75rem;">${rating}</span></p>
                        <p style="color: var(--text-muted); font-size: 0.75rem;">${mech.workshop_name}</p>
                    </div>
                    <a href="tel:${mech.phone_number}" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Call</a>
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    // ── Step management ──────────────────────────────────────
    function _showStep(step) {
        // Keep track of the active job step if we are showing it
        if (['issue', 'searching', 'fallback', 'matched', 'tracking', 'complete'].indexOf(step) !== -1) {
            _currentStep = step;
        }

        _els.stepIssue.hidden = step !== 'issue';
        _els.stepSearching.hidden = step !== 'searching';
        
        var stepFallback = document.getElementById('step-fallback');
        if (stepFallback) stepFallback.hidden = step !== 'fallback';
        
        _els.stepMatched.hidden = step !== 'matched';
        _els.stepTracking.hidden = step !== 'tracking';
        _els.stepComplete.hidden = step !== 'complete';
        
        var panelAccount = document.getElementById('panel-account');
        if (panelAccount) panelAccount.hidden = step !== 'account';
        var panelActivity = document.getElementById('panel-activity');
        if (panelActivity) panelActivity.hidden = step !== 'activity';

        // Bug #8 fix: invalidate Leaflet size after any visibility change
        setTimeout(_invalidateMaps, 50);
    }

    // ── Invalidate all active Leaflet maps ─────────────────────────
    function _invalidateMaps() {
        if (_searchMap) _searchMap.invalidateSize();
        if (_trackMap)  _trackMap.invalidateSize();
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
            var dist = data.distance_km != null ? data.distance_km.toFixed(1) + ' km away' : '';
            document.getElementById('track-mech-name').textContent = data.mechanic_name || 'Mechanic';
            document.getElementById('track-mech-workshop').textContent = data.workshop_name || dist;

            var trackPhoneLink = document.getElementById('track-mech-phone-link');
            if (trackPhoneLink && data.phone) {
                trackPhoneLink.href = 'tel:' + data.phone;
                trackPhoneLink.title = 'Call ' + data.phone;
                trackPhoneLink.setAttribute('aria-label', 'Call ' + data.phone);
            }

            _loadChatMessages();
            
            // Show matched step briefly, then transition to tracking
            _showStep('matched');
            setTimeout(function () {
                _showStep('tracking');
                _initTrackMap();
                // Bug #1 fix: invalidateSize after the step is visible
                setTimeout(function() { if (_trackMap) _trackMap.invalidateSize(); }, 150);
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
                // Bug #7 fix: guard against null driver coords (race on page reload)
                if (_driverLat != null && _driverLng != null) {
                    _trackMap.fitBounds([
                        [_driverLat, _driverLng],
                        [lat, lng],
                    ], { padding: [40, 40] });
                } else {
                    _trackMap.setView([lat, lng], 15);
                }
            }

            // Update ETA: 30 km/h = 500 m/min
            var etaMin = distM != null ? Math.ceil(distM / 500) : '—';
            document.getElementById('eta-badge').textContent = 'ETA: ' + etaMin + ' min';
        });

        _socket.on('job_completed', function (data) {
            _driverMarker = null;
            _mechanicMarker = null;
            // Bug #2 fix: destroy map instances so a subsequent job gets a fresh map
            if (_trackMap)  { _trackMap.remove();  _trackMap  = null; }
            if (_searchMap) { _searchMap.remove(); _searchMap = null; }
            localStorage.removeItem('otto_active_job_id');

            var cashAmount = data.cash_amount != null ? '₹' + parseFloat(data.cash_amount).toFixed(0) : '₹—';
            document.getElementById('complete-cash').textContent = cashAmount;
            _showStep('complete');
        });

        _socket.on('chat_message', function (data) {
            _appendChatMessage(data);
        });

        _socket.on('error', function (err) {});
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

    // ── Rating Submission ────────────────────────────────────
    function _bindRating() {
        var stars = document.querySelectorAll('#star-rating span');
        var btnSubmit = document.getElementById('btn-submit-rating');
        var successMsg = document.getElementById('rating-success-msg');
        var selectedRating = 0;

        if (!stars.length || !btnSubmit) return;

        stars.forEach(function (star) {
            star.addEventListener('click', function () {
                selectedRating = parseInt(this.getAttribute('data-val'), 10);
                stars.forEach(function (s) {
                    var val = parseInt(s.getAttribute('data-val'), 10);
                    s.style.color = val <= selectedRating ? 'var(--warning)' : 'var(--gray-300)';
                });
                btnSubmit.style.display = 'block';
            });
        });

        btnSubmit.addEventListener('click', function () {
            if (!_jobId || !selectedRating) return;
            
            _setBtnLoading(btnSubmit, true);
            fetch('/jobs/' + _jobId + '/rate', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + _token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ rating: selectedRating })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                _setBtnLoading(btnSubmit, false);
                if (data.message) {
                    btnSubmit.style.display = 'none';
                    successMsg.style.display = 'block';
                }
            })
            .catch(function () {
                _setBtnLoading(btnSubmit, false);
            });
        });
    }

    // ── Chat Logic ───────────────────────────────────────────
    function _bindChat() {
        var btnSend = document.getElementById('btn-send-chat');
        var inputChat = document.getElementById('chat-input');
        if (!btnSend || !inputChat) return;

        btnSend.addEventListener('click', function() {
            var msg = inputChat.value.trim();
            if (!msg || !_jobId || !_socket) return;
            
            _socket.emit('chat_message', {
                session_token: _token,
                job_id: _jobId,
                message: msg
            });
            inputChat.value = '';
        });

        inputChat.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                btnSend.click();
            }
        });
    }

    function _loadChatMessages() {
        var container = document.getElementById('chat-messages');
        if (!container || !_jobId) return;
        
        container.innerHTML = '';
        fetch('/jobs/' + _jobId + '/messages', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.messages) {
                data.messages.forEach(_appendChatMessage);
            }
        })
        .catch(function(err) { console.error('Failed to load chat:', err); });
    }

    function _appendChatMessage(data) {
        var container = document.getElementById('chat-messages');
        if (!container) return;

        var isMe = data.sender_role === 'user';
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

    // ── Button loading state ─────────────────────────────────
    function _setBtnLoading(btn, loading) {
        btn.disabled = loading;
        var textEl = btn.querySelector('.btn-text');
        var loadEl = btn.querySelector('.btn-loading');
        if (textEl) textEl.hidden = loading;
        if (loadEl) loadEl.hidden = !loading;
    }

    // ── HTML escaping ────────────────────────────────────────
    function _escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Navigation & Tabs ────────────────────────────────────
    function _bindNavigation() {
        var tabHome = document.getElementById('tab-home');
        var tabActivity = document.getElementById('tab-activity');
        var tabAccount = document.getElementById('tab-account');
        if (!tabHome || !tabActivity || !tabAccount) return;

        var panelAccount = document.getElementById('panel-account');
        var stepIssue = document.getElementById('step-issue');

        function switchTab(tabId) {
            tabHome.classList.toggle('active', tabId === 'home');
            tabActivity.classList.toggle('active', tabId === 'activity');
            tabAccount.classList.toggle('active', tabId === 'account');

            if (tabId === 'account') {
                _showStep('account');
                _fetchAccount();
            } else if (tabId === 'activity') {
                _showStep('activity');
                _fetchActivity();
            } else {
                _showStep(_currentStep);
            }
        }

        tabHome.addEventListener('click', function() { switchTab('home'); });
        tabActivity.addEventListener('click', function() { switchTab('activity'); });
        tabAccount.addEventListener('click', function() { switchTab('account'); });

        var btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', function() {
                localStorage.removeItem('otto_token_handoff');
                localStorage.removeItem('otto_id_handoff');
                localStorage.removeItem('otto_role_handoff');
                window.location.href = '/login/user';
            });
        }
    }

    function _fetchAccount() {
        fetch('/auth/me', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.profile) {
                document.getElementById('acct-name').textContent = data.profile.first_name + (data.profile.last_name ? ' ' + data.profile.last_name : '');
                document.getElementById('acct-email').textContent = data.profile.email;
                document.getElementById('acct-phone').textContent = data.profile.phone_number;
                
                var badge = document.getElementById('acct-email-badge');
                if (badge) badge.style.display = data.profile.email_verified ? 'none' : 'inline-block';
                
                var setPwdBtn = document.getElementById('btn-set-password');
                if (setPwdBtn) {
                    setPwdBtn.style.display = (data.profile.status === 'PENDING_PASSWORD' || !data.profile.password_hash_exists) ? 'block' : 'none';
                    setPwdBtn.onclick = function() {
                        _setBtnLoading(setPwdBtn, true);
                        fetch('/auth/login/user/request-setup-link', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: data.profile.email })
                        }).then(function() {
                            _setBtnLoading(setPwdBtn, false);
                            alert('Check terminal for the setup link!');
                        }).catch(function() {
                            _setBtnLoading(setPwdBtn, false);
                        });
                    };
                }
            }
        })
        .catch(function() {
            document.getElementById('acct-name').textContent = 'Error loading profile';
        });
    }

    function _fetchActivity() {
        var listEl = document.getElementById('activity-list');
        if (!listEl) return;
        
        listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">Loading activity...</p>';
        
        fetch('/jobs', {
            headers: { 'Authorization': 'Bearer ' + _token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            listEl.innerHTML = '';
            if (!data.jobs || data.jobs.length === 0) {
                listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">No recent jobs.</p>';
                return;
            }
            
            data.jobs.forEach(function(job) {
                var d = new Date(job.created_at).toLocaleDateString();
                var issues = (job.issue_type || '').split(',').join(', ');
                var status = job.status || 'unknown';
                var statusColor = status === 'completed' ? 'var(--success, #22c55e)'
                                : status === 'pending'   ? 'var(--brand-400, #f5a623)'
                                : status === 'cancelled' ? 'var(--text-muted)'
                                : 'var(--gray-400)';
                
                var card = document.createElement('div');
                card.className = 'mechanic-info-card';
                card.style.marginBottom = '1rem';
                card.setAttribute('data-job-id', job.job_id);
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 500; text-transform: capitalize;">${_escapeHtml(issues)}</span>
                        <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; background: var(--cream-100); color: ${statusColor}; font-weight: 600;">${status}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        Date: ${d} <br>
                        Vehicle: ${job.vehicle_model ? _escapeHtml(job.vehicle_model) : '—'} <br>
                        Amount: ${job.cash_amount != null ? '₹' + job.cash_amount : '—'}
                    </div>
                    ${status === 'pending' ? `
                    <button class="btn-cancel-job" data-job-id="${job.job_id}"
                        style="margin-top: 10px; width: 100%; padding: 8px; border: none;
                               background: transparent; color: var(--error, #ef4444);
                               font-size: 0.825rem; font-weight: 500; cursor: pointer;
                               border: 1px solid var(--error, #ef4444); border-radius: var(--radius-sm);">
                        Cancel Request
                    </button>` : ''}
                `;
                listEl.appendChild(card);
            });

            // Bind cancel buttons
            listEl.querySelectorAll('.btn-cancel-job').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var jobId = this.getAttribute('data-job-id');
                    var cardEl = listEl.querySelector('[data-job-id="' + jobId + '"]');
                    btn.disabled = true;
                    btn.textContent = 'Cancelling…';

                    fetch('/jobs/' + jobId + '/cancel', {
                        method: 'PATCH',
                        headers: { 'Authorization': 'Bearer ' + _token }
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        if (res.status === 'cancelled' && cardEl) {
                            // Update status badge in place
                            var badge = cardEl.querySelector('span:last-of-type');
                            if (badge) { badge.textContent = 'cancelled'; badge.style.color = 'var(--text-muted)'; }
                            btn.remove();
                        } else {
                            btn.disabled = false;
                            btn.textContent = 'Cancel Request';
                            alert(res.error || 'Could not cancel job.');
                        }
                    })
                    .catch(function() {
                        btn.disabled = false;
                        btn.textContent = 'Cancel Request';
                    });
                });
            });
        })
        .catch(function() {
            listEl.innerHTML = '<p style="color: var(--error); font-size: 0.875rem;">Failed to load activity.</p>';
        });
    }

    // ── Auto-init on DOMContentLoaded ────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init: init };
})();