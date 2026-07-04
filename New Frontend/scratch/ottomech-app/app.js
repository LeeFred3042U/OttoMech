/**
 * OttoMech Roadside Assistance - Application Engine
 * Pure JS State Machine, Canvas Map Simulator, and Uber UX Flow
 */

// Application State
const appState = {
  currentScreen: 'landing',
  userRole: 'user', // 'user' or 'mechanic'
  userInfo: {
    firstName: '',
    lastName: '',
    phone: '',
    email: ''
  },
  selectedIssues: ['Flat tyre'],
  uploadedPhoto: null,
  isOffline: false,
  detectedLocation: 'Gomti Nagar, Lucknow',
  userCoords: { x: 180, y: 220 }, // Center-ish coordinate on our canvas map
  seededMechanics: [
    {
      id: 'mech-1',
      name: 'Deepak Singh',
      garage: 'Lucknow Precision Garages',
      rating: 4.8,
      distance: 0.8,
      eta: 3,
      mri: 98,
      vehicle: 'Royal Enfield Bullet - UP 32 AB 1234',
      avatar: 'DS',
      startCoords: { x: 50, y: 120 }
    },
    {
      id: 'mech-2',
      name: 'Rahul Bajpai',
      garage: 'Bajpai Auto Tech',
      rating: 4.6,
      distance: 1.4,
      eta: 5,
      mri: 94,
      vehicle: 'Hero Splendor - UP 32 XY 5678',
      avatar: 'RB',
      startCoords: { x: 320, y: 80 }
    },
    {
      id: 'mech-3',
      name: 'Amit Verma',
      garage: 'Gomti Motor Works',
      rating: 4.9,
      distance: 1.9,
      eta: 7,
      mri: 97,
      vehicle: 'Suzuki Access - UP 32 CZ 9012',
      avatar: 'AV',
      startCoords: { x: 120, y: 380 }
    },
    {
      id: 'mech-4',
      name: 'Vinay Kumar',
      garage: 'Lalbagh Multi-Brand',
      rating: 4.5,
      distance: 2.3,
      eta: 9,
      mri: 91,
      vehicle: 'TVS Jupiter - UP 32 DM 3456',
      avatar: 'VK',
      startCoords: { x: 350, y: 290 }
    }
  ],
  selectedMechanic: null,
  activeRating: 5,
  activeTip: 50,
  chatMessages: [
    { sender: 'mechanic', text: 'Hello, I have accepted your request. Please share your landmarks.', time: '10:14 AM' }
  ],
  paymentMethod: 'UPI',
  jobId: '#JOB-7643',
  warrantyId: 'OM-2026-9871'
};

// ----------------------------------------------------
// DYNAMIC SVG LOGO GENERATOR
// ----------------------------------------------------
// Inject Logo Images on load
window.addEventListener('DOMContentLoaded', () => {
  // Inject logos
  document.getElementById('logo-landing').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(109, 40, 217, 0.1));">`;
  document.getElementById('logo-signup').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  document.getElementById('logo-login').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  document.getElementById('logo-payment').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  document.getElementById('logo-rating').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  document.getElementById('logo-mechanic-home').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  document.getElementById('logo-mechanic-qr').innerHTML = `<img src="logo.jpg" alt="OttoMech Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
  
  // Start dynamic clock in device status bar
  updateDeviceClock();
  setInterval(updateDeviceClock, 60000);

  // Setup Canvas Map
  initCanvasMap('map-canvas');

  // Network Offline Toggle listener
  setupOfflineSimulator();

  // Detect physical user GPS coordinates on startup
  detectUserRealLocation();
});

// Device status bar clock
function updateDeviceClock() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  hours = hours < 10 ? '0' + hours : hours;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  document.getElementById('status-time').innerText = `${hours}:${minutes}`;
}

// ----------------------------------------------------
// NAVIGATION SYSTEM
// ----------------------------------------------------
function goToScreen(screenId) {
  // Hide all screens
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => {
    s.classList.remove('active', 'screen-slide-in');
  });

  // Show target screen
  const target = document.getElementById(`screen-${screenId}`);
  if (target) {
    target.classList.add('active', 'screen-slide-in');
    appState.currentScreen = screenId;
    
    // Custom logic on entering screens
    if (screenId === 'home') {
      // Re-trigger map sizing and draw
      setTimeout(() => initCanvasMap('map-canvas'), 100);
    } else if (screenId === 'tracking') {
      startTrackingSimulation();
    } else if (screenId === 'mechanic-home') {
      // Update mechanic profile labels from signup
      document.getElementById('mech-home-name').innerText = `${appState.userInfo.firstName} ${appState.userInfo.lastName}`.trim() || 'Deepak Singh';
      document.getElementById('mech-home-avatar').innerText = ((appState.userInfo.firstName[0] || 'D') + (appState.userInfo.lastName[0] || 'S')).toUpperCase();
      
      const garageTag = document.getElementById('mech-home-garage-display');
      const garageName = document.getElementById('mech-home-garage-name');
      if (appState.mechanicInfo && appState.mechanicInfo.garageName) {
        garageTag.classList.remove('hidden');
        garageName.innerText = appState.mechanicInfo.garageName;
      } else {
        garageTag.classList.add('hidden');
      }
    }
  }
}

function selectRole(role) {
  appState.userRole = role;
  
  // Toggle UI cards
  document.querySelectorAll('.role-card').forEach(card => card.classList.remove('active'));
  if (role === 'user') {
    document.querySelector('.user-card').classList.add('active');
    document.getElementById('mechanic-fields').classList.add('hidden');
    document.querySelector('.step-indicator').innerText = 'Register a new profile';
  } else {
    document.querySelector('.mechanic-card').classList.add('active');
    document.getElementById('mechanic-fields').classList.remove('hidden');
    document.querySelector('.step-indicator').innerText = 'Register a new mechanic';
  }
}

// ----------------------------------------------------
// LOCAL DATABASE & USER AUTHENTICATION FLOWS
// ----------------------------------------------------
const DB_KEY = 'ottomech_accounts';

function getAccounts() {
  const data = localStorage.getItem(DB_KEY);
  return data ? JSON.parse(data) : [];
}

function saveAccount(account) {
  const accounts = getAccounts();
  accounts.push(account);
  localStorage.setItem(DB_KEY, JSON.stringify(accounts));
}

function findAccount(emailOrPhone) {
  const accounts = getAccounts();
  const cleanKey = emailOrPhone.trim().toLowerCase();
  return accounts.find(acc => 
    acc.email.toLowerCase() === cleanKey || 
    acc.phone.replace(/\s+/g, '') === cleanKey.replace(/\s+/g, '')
  );
}

function handleSignup(event) {
  event.preventDefault();
  
  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('signup-password').value;
  
  // Duplication checks
  if (findAccount(email) || findAccount(phone)) {
    showToast('An account with this email/phone already exists. Please Log In.');
    return;
  }
  
  const account = {
    firstName,
    lastName,
    phone,
    email,
    password,
    role: appState.userRole,
    mechanicInfo: null
  };
  
  // Save mechanic specific details
  if (appState.userRole === 'mechanic') {
    const isGarage = document.querySelector('input[name="affiliation"]:checked').value === 'garage';
    account.mechanicInfo = {
      isGarage: isGarage,
      garageName: isGarage ? document.getElementById('garage-name').value.trim() : '',
      garageAddress: isGarage ? document.getElementById('garage-address').value.trim() : ''
    };
  }
  
  // Store account
  saveAccount(account);
  setCurrentUserSession(account);
  
  showToast('Registration successful!');
  
  if (account.role === 'mechanic') {
    goToScreen('mechanic-home');
  } else {
    goToScreen('home');
  }
}

function handleLogin(event) {
  event.preventDefault();
  
  const emailOrPhone = document.getElementById('login-email-phone').value.trim();
  const password = document.getElementById('login-password').value;
  
  const account = findAccount(emailOrPhone);
  
  if (!account) {
    showToast('No account found. Please Register first.');
    return;
  }
  
  if (account.password !== password) {
    showToast('Incorrect password. Please try again.');
    return;
  }
  
  setCurrentUserSession(account);
  showToast('Logged in successfully!');
  
  if (account.role === 'mechanic') {
    goToScreen('mechanic-home');
  } else {
    goToScreen('home');
  }
}

function setCurrentUserSession(account) {
  appState.userInfo = {
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    email: account.email
  };
  appState.userRole = account.role;
  appState.mechanicInfo = account.mechanicInfo;
}

// ----------------------------------------------------
// LEAFLET INTERACTIVE MAP SYSTEM
// ----------------------------------------------------
const leafletMaps = {
  home: null,
  tracking: null,
  job: null
};

const leafletMarkers = {
  homeUser: null,
  homeMechanics: [],
  trackingUser: null,
  trackingMech: null,
  trackingRoute: null,
  jobCustomer: null,
  jobMech: null,
  jobRoute: null
};

function initCanvasMap(mapId) {
  const mapDiv = document.getElementById(mapId);
  if (!mapDiv) return;

  // Clear existing to avoid double-init crashes
  if (leafletMaps.home) {
    leafletMaps.home.invalidateSize();
    
    // Update user marker position
    let userLat = 26.8467;
    let userLon = 80.9462;
    if (appState.realCoordinates) {
      userLat = appState.realCoordinates.lat;
      userLon = appState.realCoordinates.lon;
    }
    leafletMaps.home.setView([userLat, userLon], 14);
    if (leafletMarkers.homeUser) {
      leafletMarkers.homeUser.setLatLng([userLat, userLon]);
    }
    seedLocalMechanicsOnMap(userLat, userLon);
    return;
  }

  let centerLat = 26.8467;
  let centerLon = 80.9462;
  if (appState.realCoordinates) {
    centerLat = appState.realCoordinates.lat;
    centerLon = appState.realCoordinates.lon;
  }

  // Initialize leaflet map
  leafletMaps.home = L.map(mapId, {
    zoomControl: false,
    attributionControl: false
  }).setView([centerLat, centerLon], 14);

  // Add CartoDB Positron clean light tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(leafletMaps.home);

  // Add zoom control at bottom right to fit notches
  L.control.zoom({ position: 'bottomright' }).addTo(leafletMaps.home);

  // Custom pulsing user icon
  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `<div style="width: 16px; height: 16px; background-color: var(--primary-violet); border: 2.5px solid #FFFFFF; border-radius: 50%; box-shadow: 0 0 10px var(--primary-violet); animation: user-pulse 1.8s infinite;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  leafletMarkers.homeUser = L.marker([centerLat, centerLon], { icon: userIcon }).addTo(leafletMaps.home);

  // Inject user marker animation style globally
  if (!document.getElementById('user-pulse-style')) {
    const style = document.createElement("style");
    style.id = 'user-pulse-style';
    style.innerText = `
      @keyframes user-pulse {
        0% { box-shadow: 0 0 0 0 rgba(109, 40, 217, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(109, 40, 217, 0); }
        100% { box-shadow: 0 0 0 0 rgba(109, 40, 217, 0); }
      }
      @keyframes customer-pulse-green {
        0% { box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(5, 150, 105, 0); }
        100% { box-shadow: 0 0 0 0 rgba(5, 150, 105, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  // Seed mechanics surrounding center Coordinates
  seedLocalMechanicsOnMap(centerLat, centerLon);
}

function seedLocalMechanicsOnMap(userLat, userLon) {
  // Clear existing
  leafletMarkers.homeMechanics.forEach(m => leafletMaps.home.removeLayer(m));
  leafletMarkers.homeMechanics = [];

  // Seeding parameters offsets
  const offsets = [
    { dLat: 0.005, dLon: -0.007, id: 'mech-1' },
    { dLat: 0.007, dLon: 0.006, id: 'mech-2' },
    { dLat: -0.006, dLon: 0.008, id: 'mech-3' },
    { dLat: -0.008, dLon: -0.005, id: 'mech-4' }
  ];

  appState.seededMechanics.forEach((mech, idx) => {
    const offset = offsets[idx] || { dLat: 0, dLon: 0 };
    const mechLat = userLat + offset.dLat;
    const mechLon = userLon + offset.dLon;
    
    // Save coordinate fields in data state
    mech.coords = { lat: mechLat, lon: mechLon };

    const mechIcon = L.divIcon({
      className: 'custom-mech-marker',
      html: `
        <div style="
          background-color: var(--primary-violet);
          color: var(--white);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2.5px solid var(--white);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          box-shadow: var(--shadow-md);
        ">${mech.avatar}</div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([mechLat, mechLon], { icon: mechIcon }).addTo(leafletMaps.home);
    marker.on('click', () => {
      selectMechanic(mech.id);
    });

    leafletMarkers.homeMechanics.push(marker);
  });
}

function reLocateUser() {
  detectUserRealLocation();
}

function detectUserRealLocation() {
  if (navigator.geolocation) {
    showToast('Locating your GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Stash coordinates
        appState.realCoordinates = { lat, lon };
        
        // Reverse-geocode coordinates using public OSM Nominatim (Free, no keys needed)
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
          headers: {
            'Accept-Language': 'en'
          }
        })
        .then(response => response.json())
        .then(data => {
          if (data && data.address) {
            // Reconstruct a human-readable neighborhood/street/city format
            const road = data.address.road || '';
            const neighborhood = data.address.neighbourhood || data.address.suburb || '';
            const city = data.address.city || data.address.town || data.address.state || '';
            
            let formattedAddress = '';
            if (road && neighborhood) {
              formattedAddress = `${road}, ${neighborhood}`;
            } else if (road && city) {
              formattedAddress = `${road}, ${city}`;
            } else if (data.display_name) {
              formattedAddress = data.display_name.split(',').slice(0, 3).join(',').trim();
            } else {
              formattedAddress = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
            }
            
            appState.detectedLocation = formattedAddress;
            updateLocationUI(formattedAddress);
            showToast(`Location resolved: ${formattedAddress}`);
          } else {
            const coordsStr = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
            appState.detectedLocation = coordsStr;
            updateLocationUI(coordsStr);
          }
        })
        .catch(err => {
          console.warn('OSM Reverse Geocoding failed:', err);
          const coordsStr = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
          appState.detectedLocation = coordsStr;
          updateLocationUI(coordsStr);
        });
      },
      (error) => {
        console.warn('GPS location permission denied or error:', error);
        showToast('Location permission denied. Using default: Gomti Nagar, Lucknow.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    showToast('GPS navigation is not supported by this browser.');
  }
}

function updateLocationUI(address) {
  const elVal = document.getElementById('current-location-val');
  if (elVal) elVal.innerText = address;
  
  const elReceipt = document.getElementById('receipt-location');
  if (elReceipt) elReceipt.innerText = address;
}

function triggerLocationSearch() {
  const newLoc = prompt('Enter breakdown address in Lucknow:', appState.detectedLocation);
  if (newLoc) {
    appState.detectedLocation = newLoc;
    document.getElementById('current-location-val').innerText = newLoc;
    showToast('Location set successfully');
  }
}

// ----------------------------------------------------
// ISSUE SELECTION & DAMAGE PHOTOS
// ----------------------------------------------------
function selectIssue(element, issueName) {
  if (!appState.selectedIssues) {
    appState.selectedIssues = [];
  }
  
  // Toggle selection
  if (appState.selectedIssues.includes(issueName)) {
    if (appState.selectedIssues.length === 1) {
      showToast('Please select at least one issue.');
      return;
    }
    appState.selectedIssues = appState.selectedIssues.filter(item => item !== issueName);
    element.classList.remove('active');
  } else {
    appState.selectedIssues.push(issueName);
    element.classList.add('active');
  }
  
  // Service base costs
  const costs = {
    'Flat tyre': 300,
    'Battery': 250,
    'Engine': 600,
    'Overheating': 400,
    'Other': 350
  };
  
  // Calculate total pricing based on selected issues
  let cost = 0;
  appState.selectedIssues.forEach(issue => {
    cost += costs[issue] || 300;
  });
  
  const gst = Math.round(cost * 0.18);
  const total = cost + gst;
  
  const billType = document.getElementById('bill-service-type');
  const billTotal = document.getElementById('bill-total-amount');
  const payBtn = document.getElementById('btn-pay');
  
  if (billType) {
    if (appState.selectedIssues.length === 1) {
      billType.innerText = `${appState.selectedIssues[0]} Assistance`;
    } else {
      billType.innerText = `Multiple Assistance (${appState.selectedIssues.length} issues)`;
    }
  }
  
  if (billTotal) billTotal.innerText = `₹${total}.00`;
  if (payBtn) payBtn.innerText = `Pay ₹${total}.00 →`;
  
  // Store amounts in state
  appState.totalBillAmount = total;
  appState.baseCost = cost;
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    appState.uploadedPhoto = e.target.result;
    document.getElementById('photo-preview').src = e.target.result;
    document.getElementById('photo-preview-container').classList.remove('hidden');
    document.getElementById('photo-upload-label').classList.add('hidden');
    showToast('Breakdown photo attached');
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  appState.uploadedPhoto = null;
  document.getElementById('photo-file').value = '';
  document.getElementById('photo-preview-container').classList.add('hidden');
  document.getElementById('photo-upload-label').classList.remove('hidden');
}

// ----------------------------------------------------
// DISPATCH ENGINE (Radar Matchmaking)
// ----------------------------------------------------
function startDispatch() {
  goToScreen('dispatch');
  
  // Render matching cards with dynamic lists
  const list = document.getElementById('mechanics-list');
  list.innerHTML = '';
  
  appState.seededMechanics.forEach(mech => {
    // Generate markup for mechanic rating card
    const card = document.createElement('div');
    card.className = 'mechanic-card';
    card.onclick = () => selectMechanic(mech.id);
    
    card.innerHTML = `
      <div class="avatar">${mech.avatar}</div>
      <div class="details">
        <h4>${mech.name}</h4>
        <div class="rating">
          <span>⭐ ${mech.rating}</span> &bull; 
          <span class="mri-badge">MRI: ${mech.mri}%</span>
        </div>
      </div>
      <div class="distance">
        <div class="dist-val">${mech.distance} km</div>
        <div class="eta-val">${mech.eta} mins away</div>
      </div>
    `;
    list.appendChild(card);
  });
  
  // Simulating automatic dispatcher fallback in case they don't tap after 6 seconds
  appState.dispatchTimeout = setTimeout(() => {
    if (appState.currentScreen === 'dispatch') {
      showToast('Automatching nearest available mechanic...');
      selectMechanic('mech-1'); // Match Deepak Singh automatically
    }
  }, 7000);
}

function selectMechanic(mechId) {
  if (appState.dispatchTimeout) clearTimeout(appState.dispatchTimeout);
  
  const mechanic = appState.seededMechanics.find(m => m.id === mechId);
  appState.selectedMechanic = mechanic;
  
  // Update Tracking & Receipt layouts with active selections
  document.getElementById('tracking-mechanic-name').innerText = mechanic.name;
  document.getElementById('tracking-mri').innerText = `MRI: ${mechanic.mri}%`;
  document.getElementById('tracking-vehicle').innerText = mechanic.vehicle;
  document.getElementById('tracking-mechanic-avatar').innerText = mechanic.avatar;
  
  document.getElementById('rating-mechanic-title').innerText = mechanic.name;
  document.getElementById('receipt-mechanic-name').innerText = mechanic.name;
  
  goToScreen('tracking');
  showToast(`${mechanic.name} accepted request`);
}

// ----------------------------------------------------
// LIVE TRACKING & CANVAS SIMULATOR
// ----------------------------------------------------
let trackingInterval = null;
let simulatedStep = 0;

function startTrackingSimulation() {
  const mapId = 'tracking-canvas';
  const mapDiv = document.getElementById(mapId);
  if (!mapDiv) return;

  // Clear existing mapping to avoid double-init crashes
  if (leafletMaps.tracking) {
    leafletMaps.tracking.remove();
    leafletMaps.tracking = null;
  }

  // Get current user location
  let userLat = 26.8467;
  let userLon = 80.9462;
  if (appState.realCoordinates) {
    userLat = appState.realCoordinates.lat;
    userLon = appState.realCoordinates.lon;
  }

  // Get selected mechanic start location (seeded offset)
  let mechStartLat = userLat + 0.005;
  let mechStartLon = userLon - 0.007;
  if (appState.selectedMechanic && appState.selectedMechanic.coords) {
    mechStartLat = appState.selectedMechanic.coords.lat;
    mechStartLon = appState.selectedMechanic.coords.lon;
  }

  // Midpoint for centering map view
  const midLat = (userLat + mechStartLat) / 2;
  const midLon = (userLon + mechStartLon) / 2;

  // Initialize leaflet map
  leafletMaps.tracking = L.map(mapId, {
    zoomControl: false,
    attributionControl: false
  }).setView([midLat, midLon], 15);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(leafletMaps.tracking);

  // User icon (pulsing violet dot)
  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `<div style="width: 16px; height: 16px; background-color: var(--primary-violet); border: 2.5px solid #FFFFFF; border-radius: 50%; box-shadow: 0 0 10px var(--primary-violet); animation: user-pulse 1.8s infinite;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  leafletMarkers.trackingUser = L.marker([userLat, userLon], { icon: userIcon }).addTo(leafletMaps.tracking);

  // Mechanic icon (violet initials label)
  const mechIcon = L.divIcon({
    className: 'custom-mech-tracking-marker',
    html: `
      <div style="
        background-color: var(--primary-violet);
        color: var(--white);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2.5px solid var(--white);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        box-shadow: var(--shadow-lg);
      ">${appState.selectedMechanic.avatar}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  leafletMarkers.trackingMech = L.marker([mechStartLat, mechStartLon], { icon: mechIcon }).addTo(leafletMaps.tracking);

  // Draw polyline route connecting them
  const pathCoordinates = [
    [mechStartLat, mechStartLon],
    [userLat, userLon]
  ];
  leafletMarkers.trackingRoute = L.polyline(pathCoordinates, {
    color: '#8B5CF6',
    weight: 4,
    opacity: 0.8,
    dashArray: '5, 10'
  }).addTo(leafletMaps.tracking);

  // Fit bounds to show both
  leafletMaps.tracking.fitBounds(leafletMarkers.trackingRoute.getBounds(), { padding: [40, 40] });

  // Start animation loop
  simulatedStep = 0;
  if (trackingInterval) clearInterval(trackingInterval);

  trackingInterval = setInterval(() => {
    simulatedStep++;
    const t = simulatedStep / 10;

    // Linear interpolate coordinates
    const currentLat = mechStartLat + (userLat - mechStartLat) * t;
    const currentLon = mechStartLon + (userLon - mechStartLon) * t;

    // Update marker position
    if (leafletMarkers.trackingMech) {
      leafletMarkers.trackingMech.setLatLng([currentLat, currentLon]);
    }

    // Update route polyline path
    if (leafletMarkers.trackingRoute) {
      leafletMarkers.trackingRoute.setLatLngs([
        [currentLat, currentLon],
        [userLat, userLon]
      ]);
    }

    // Recenter map slightly if they go out of bounds
    leafletMaps.tracking.panTo([currentLat, currentLon]);

    // ETA display update
    const remainingEta = Math.max(1, appState.selectedMechanic.eta - Math.floor(simulatedStep / 2));
    document.getElementById('tracking-eta').innerText = `${remainingEta} mins`;

    const progressSegments = document.querySelectorAll('.progress-segment');
    if (simulatedStep === 4) {
      showToast(`${appState.selectedMechanic.name.split(' ')[0]} is halfway to your location.`);
    }
    if (simulatedStep >= 7) {
      progressSegments[2].classList.add('active'); // Repairing active
    }

    if (simulatedStep >= 10) {
      clearInterval(trackingInterval);
      showToast('Repair completed by mechanic');
      setTimeout(() => {
        goToScreen('payment');
      }, 1500);
    }
  }, 3500);
}



function triggerCall() {
  showToast(`Initiating call with ${appState.selectedMechanic.name}...`);
  window.location.href = `tel:+919876543210`;
}

function cancelRequest() {
  const confirmCancel = confirm('Are you sure you want to cancel this assistance request?');
  if (confirmCancel) {
    if (trackingInterval) clearInterval(trackingInterval);
    showToast('Request cancelled successfully');
    goToScreen('home');
  }
}

// ----------------------------------------------------
// PAYMENT & BILLINGFLOW
// ----------------------------------------------------
function selectPaymentMethod(element, method) {
  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.classList.remove('active');
    opt.querySelector('.pay-radio').classList.remove('active');
  });
  
  element.classList.add('active');
  element.querySelector('.pay-radio').classList.add('active');
  appState.paymentMethod = method;
}

function processPayment() {
  const btn = document.getElementById('btn-pay');
  const total = appState.totalBillAmount || 354;
  
  btn.innerText = 'Authorizing Transaction...';
  btn.disabled = true;
  
  setTimeout(() => {
    btn.innerText = 'Success!';
    showToast('Payment Settled Successfully via UPI');
    
    // Configure Rating screen inputs
    goToScreen('rating');
  }, 2000);
}

// ----------------------------------------------------
// RATING & FEEDBACK PROCESSORS
// ----------------------------------------------------
function setRating(stars) {
  appState.activeRating = stars;
  const elements = document.querySelectorAll('.star');
  
  elements.forEach((el, idx) => {
    if (idx < stars) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

function selectTip(element, amount) {
  document.querySelectorAll('.tip-btn').forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');
  
  const customInput = document.getElementById('custom-tip-input');
  
  if (amount === 'custom') {
    customInput.classList.remove('hidden');
    customInput.focus();
    appState.activeTip = 0;
  } else {
    customInput.classList.add('hidden');
    appState.activeTip = amount;
  }
}

function updateCustomTip(val) {
  appState.activeTip = Number(val) || 0;
}

function submitRating() {
  showToast('Feedback submitted. Generating receipt...');
  
  // Calculate final paid amount (bill total + tip)
  const billTotal = appState.totalBillAmount || 354;
  const finalPaid = billTotal + appState.activeTip;
  
  // Update receipt fields
  document.getElementById('receipt-amount-paid').innerText = `₹${finalPaid}.00`;
  document.getElementById('receipt-location').innerText = appState.detectedLocation;
  
  // Generate mock dates and IDs
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  const expiryStr = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  const randomJobId = '#JOB-' + Math.floor(1000 + Math.random() * 9000);
  const randomCertId = 'OM-' + d.getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
  
  document.getElementById('receipt-date').innerText = dateStr;
  document.getElementById('receipt-job-id').innerText = randomJobId;
  document.getElementById('warranty-id').innerText = randomCertId;
  document.getElementById('warranty-expiry').innerText = expiryStr;
  
  goToScreen('receipt');
}

// ----------------------------------------------------
// RECEIPT, OFFLINE ENGINE, AND INITIALIZERS
// ----------------------------------------------------
function simulatePDFDownload() {
  showToast('Generating Secure PDF Receipt...');
  setTimeout(() => {
    showToast('Download complete. Check file manager.');
  }, 1500);
}

function restartApp() {
  // Reset session flags
  appState.uploadedPhoto = null;
  appState.selectedMechanic = null;
  appState.activeRating = 5;
  appState.activeTip = 50;
  
  // Reset issue selection highlights
  appState.selectedIssues = ['Flat tyre'];
  document.querySelectorAll('.issue-item').forEach(item => {
    const labelText = item.querySelector('.issue-label').innerText;
    if (labelText === 'Flat tyre') {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Reset invoice details
  const billType = document.getElementById('bill-service-type');
  const billTotal = document.getElementById('bill-total-amount');
  const payBtn = document.getElementById('btn-pay');
  if (billType) billType.innerText = 'Flat tyre Assistance';
  if (billTotal) billTotal.innerText = '₹354.00';
  if (payBtn) payBtn.innerText = 'Pay ₹354.00 →';
  appState.totalBillAmount = 354;
  appState.baseCost = 300;
  
  // Remove file value & upload previews
  const fileInput = document.getElementById('photo-file');
  if (fileInput) fileInput.value = '';
  document.getElementById('photo-preview-container').classList.add('hidden');
  document.getElementById('photo-upload-label').classList.remove('hidden');
  
  // Reset star highlight defaults
  setRating(5);
  
  goToScreen('home');
}

function setupOfflineSimulator() {
  const toggle = document.getElementById('offline-toggle');
  const label = document.getElementById('network-status');
  
  toggle.addEventListener('change', (e) => {
    appState.isOffline = e.target.checked;
    
    if (appState.isOffline) {
      label.innerText = 'Offline Mode';
      document.querySelector('.offline-toggle-container').style.background = '#FEE2E2';
      document.querySelector('.offline-toggle-container').style.borderColor = '#FCA5A5';
      label.style.color = '#B91C1C';
      showToast('Network Lost. Caching database onto client via Service Worker.');
    } else {
      label.innerText = 'Online Mode';
      document.querySelector('.offline-toggle-container').style.background = 'rgba(255, 255, 255, 0.9)';
      document.querySelector('.offline-toggle-container').style.borderColor = 'var(--violet-100)';
      label.style.color = 'var(--primary-violet)';
      showToast('Connection Re-established.');
    }
  });
}

// Global Toast utility
function showToast(message) {
  const toast = document.getElementById('app-toast');
  toast.innerText = message;
  toast.classList.remove('hidden');
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// ----------------------------------------------------
// MECHANIC WORKFLOW SIMULATION & OPERATIONS
// ----------------------------------------------------
function toggleGarageFields(show) {
  const container = document.getElementById('garage-details-container');
  const affInd = document.getElementById('aff-ind');
  const affGar = document.getElementById('aff-gar');
  
  const inputName = document.getElementById('garage-name');
  const inputAddr = document.getElementById('garage-address');
  
  if (show) {
    container.classList.remove('hidden');
    inputName.required = true;
    inputAddr.required = true;
    
    affGar.classList.add('active');
    affGar.style.borderColor = 'var(--primary-violet)';
    affGar.style.backgroundColor = 'var(--violet-50)';
    affGar.style.color = 'var(--primary-violet)';
    
    affInd.classList.remove('active');
    affInd.style.borderColor = 'var(--gray-200)';
    affInd.style.backgroundColor = 'var(--white)';
    affInd.style.color = 'var(--text-dark)';
  } else {
    container.classList.add('hidden');
    inputName.required = false;
    inputAddr.required = false;
    inputName.value = '';
    inputAddr.value = '';
    
    affInd.classList.add('active');
    affInd.style.borderColor = 'var(--primary-violet)';
    affInd.style.backgroundColor = 'var(--violet-50)';
    affInd.style.color = 'var(--primary-violet)';
    
    affGar.classList.remove('active');
    affGar.style.borderColor = 'var(--gray-200)';
    affGar.style.backgroundColor = 'var(--white)';
    affGar.style.color = 'var(--text-dark)';
  }
}

let bookingTimeout = null;
appState.mechanicOnline = false;

function toggleMechanicOnlineStatus(isOnline) {
  appState.mechanicOnline = isOnline;
  
  const indicator = document.getElementById('mech-status-indicator');
  const desc = document.getElementById('mech-status-desc');
  const radar = document.getElementById('online-radar-container');
  
  if (bookingTimeout) clearTimeout(bookingTimeout);
  
  if (isOnline) {
    indicator.className = 'status-indicator-box online';
    desc.innerText = 'Online & Active. Waiting for roadside breakdown bookings in Lucknow...';
    radar.classList.remove('hidden');
    showToast('You are now ONLINE. Standing by for customer requests.');
    
    // Simulate incoming booking in 5 seconds
    bookingTimeout = setTimeout(() => {
      triggerSimulatedBookingAlert();
    }, 5000);
  } else {
    indicator.className = 'status-indicator-box offline';
    desc.innerText = 'You are Offline. Go online to start receiving roadside jobs.';
    radar.classList.add('hidden');
    showToast('You are now OFFLINE. Booking alerts disabled.');
  }
}

function triggerSimulatedBookingAlert() {
  if (!appState.mechanicOnline) return;
  
  const predictedCost = "₹354.00";
  const distance = "1.4 km";
  
  // Update Alert visual texts
  document.getElementById('alert-customer-name').innerText = "Aarav Sharma";
  document.getElementById('alert-issue').innerText = "Flat tyre";
  document.getElementById('alert-distance').innerText = `${distance} away`;
  document.getElementById('alert-cost').innerText = predictedCost;
  document.getElementById('alert-location').innerText = "Faizabad Road, near Flyover";
  
  // Show the Alert overlay
  document.getElementById('booking-alert-overlay').classList.remove('hidden');
  showToast('🔊 New breakdown booking received!');
}

function declineBooking() {
  document.getElementById('booking-alert-overlay').classList.add('hidden');
  showToast('Booking request declined.');
  
  // Queue another request in 7 seconds
  if (appState.mechanicOnline) {
    bookingTimeout = setTimeout(() => {
      triggerSimulatedBookingAlert();
    }, 7000);
  }
}

function acceptBooking() {
  document.getElementById('booking-alert-overlay').classList.add('hidden');
  showToast('Request accepted. Initializing routing map.');
  
  // Setup Active Job UI customer values
  document.getElementById('job-driver-name').innerText = "Aarav Sharma";
  document.getElementById('job-driver-avatar').innerText = "AS";
  document.getElementById('job-issue-name').innerText = "Flat Tyre";
  document.getElementById('job-address-detail').innerText = "Faizabad Road, near Flyover";
  
  // Go to navigation tracking
  goToScreen('mechanic-job');
  startMechanicJobSimulation();
}

let jobCanvasInterval = null;
let jobStepIndex = 0; // 0 = Drive, 1 = Inspect, 2 = Repair
let simulatedJobNavProgress = 0;

function startMechanicJobSimulation() {
  const mapId = 'mechanic-job-canvas';
  const mapDiv = document.getElementById(mapId);
  if (!mapDiv) return;

  // Clear existing mapping to avoid double-init crashes
  if (leafletMaps.job) {
    leafletMaps.job.remove();
    leafletMaps.job = null;
  }

  // Driver/customer location
  let customerLat = 26.8467;
  let customerLon = 80.9462;
  if (appState.realCoordinates) {
    customerLat = appState.realCoordinates.lat;
    customerLon = appState.realCoordinates.lon;
  }

  // Mechanic starting spot (offset based on whether they have a garage or not)
  const isGarage = appState.mechanicInfo && appState.mechanicInfo.isGarage;
  let mechStartLat = customerLat + (isGarage ? -0.008 : 0.005);
  let mechStartLon = customerLon + (isGarage ? 0.007 : -0.007);

  // Midpoint
  const midLat = (customerLat + mechStartLat) / 2;
  const midLon = (customerLon + mechStartLon) / 2;

  // Initialize leaflet map
  leafletMaps.job = L.map(mapId, {
    zoomControl: false,
    attributionControl: false
  }).setView([midLat, midLon], 15);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(leafletMaps.job);

  // Customer icon (pulsing green dot)
  const customerIcon = L.divIcon({
    className: 'custom-customer-marker',
    html: `<div style="width: 16px; height: 16px; background-color: #059669; border: 2.5px solid #FFFFFF; border-radius: 50%; box-shadow: 0 0 10px #059669; animation: customer-pulse-green 1.8s infinite;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  leafletMarkers.jobCustomer = L.marker([customerLat, customerLon], { icon: customerIcon }).addTo(leafletMaps.job);

  // Mechanic icon (pulsing violet dot)
  const mechIcon = L.divIcon({
    className: 'custom-mech-job-marker',
    html: `
      <div style="
        background-color: var(--primary-violet);
        color: var(--white);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2.5px solid var(--white);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        box-shadow: var(--shadow-lg);
      ">${(appState.userInfo.firstName[0] || 'D') + (appState.userInfo.lastName[0] || 'S')}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  leafletMarkers.jobMech = L.marker([mechStartLat, mechStartLon], { icon: mechIcon }).addTo(leafletMaps.job);

  // Draw polyline connecting them
  const pathCoordinates = [
    [mechStartLat, mechStartLon],
    [customerLat, customerLon]
  ];
  leafletMarkers.jobRoute = L.polyline(pathCoordinates, {
    color: '#8B5CF6',
    weight: 4,
    opacity: 0.8,
    dashArray: '5, 10'
  }).addTo(leafletMaps.job);

  // Fit bounds to show both
  leafletMaps.job.fitBounds(leafletMarkers.jobRoute.getBounds(), { padding: [40, 40] });

  simulatedJobNavProgress = 0;
  jobStepIndex = 0;

  // Reset active segments
  document.getElementById('seg-nav').className = 'progress-segment active';
  document.getElementById('seg-inspect').className = 'progress-segment';
  document.getElementById('seg-repair').className = 'progress-segment';
  document.getElementById('btn-next-job-step').innerText = "I Have Arrived →";
  document.getElementById('btn-next-job-step').className = "btn btn-primary";
  document.getElementById('job-eta').innerText = "5 mins";
  document.querySelector('#screen-mechanic-job .eta-status').innerText = "Navigating to customer location";

  if (jobCanvasInterval) clearInterval(jobCanvasInterval);

  jobCanvasInterval = setInterval(() => {
    if (jobStepIndex === 0) {
      simulatedJobNavProgress = Math.min(10, simulatedJobNavProgress + 1);
      const t = simulatedJobNavProgress / 10;

      const currentLat = mechStartLat + (customerLat - mechStartLat) * t;
      const currentLon = mechStartLon + (customerLon - mechStartLon) * t;

      // Update mechanic position on map
      if (leafletMarkers.jobMech) {
        leafletMarkers.jobMech.setLatLng([currentLat, currentLon]);
      }

      // Update route polyline path
      if (leafletMarkers.jobRoute) {
        leafletMarkers.jobRoute.setLatLngs([
          [currentLat, currentLon],
          [customerLat, customerLon]
        ]);
      }

      // Recenter map slightly if they go out of bounds
      leafletMaps.job.panTo([currentLat, currentLon]);

      // ETA
      const remainingEta = Math.max(1, 5 - Math.floor(simulatedJobNavProgress / 2));
      document.getElementById('job-eta').innerText = `${remainingEta} mins`;

      if (simulatedJobNavProgress >= 10) {
        clearInterval(jobCanvasInterval);
        document.getElementById('job-eta').innerText = 'Arrived';
        showToast('You have arrived at the customer. Please inspect the breakdown.');
      }
    }
  }, 1200);
}

function advanceJobStep() {
  const btn = document.getElementById('btn-next-job-step');
  const bannerEta = document.getElementById('job-eta');
  const bannerStatus = document.querySelector('#screen-mechanic-job .eta-status');
  
  if (jobStepIndex === 0) {
    if (jobCanvasInterval) clearInterval(jobCanvasInterval);
    
    let customerLat = 26.8467;
    let customerLon = 80.9462;
    if (appState.realCoordinates) {
      customerLat = appState.realCoordinates.lat;
      customerLon = appState.realCoordinates.lon;
    }
    if (leafletMarkers.jobMech) {
      leafletMarkers.jobMech.setLatLng([customerLat, customerLon]);
    }
    if (leafletMarkers.jobRoute) {
      leafletMarkers.jobRoute.setLatLngs([
        [customerLat, customerLon],
        [customerLat, customerLon]
      ]);
    }
    if (leafletMaps.job) {
      leafletMaps.job.panTo([customerLat, customerLon]);
    }
    
    simulatedJobNavProgress = 10;
    jobStepIndex = 1;
    document.getElementById('seg-inspect').className = 'progress-segment active';
    bannerEta.innerText = 'Arrived';
    bannerStatus.innerText = 'Vehicle inspection in progress';
    btn.innerText = 'Start Repair Work →';
    showToast('Inspection started.');
  } else if (jobStepIndex === 1) {
    jobStepIndex = 2;
    document.getElementById('seg-repair').className = 'progress-segment active';
    bannerEta.innerText = 'Repairing';
    bannerStatus.innerText = 'Fixing flat tyre...';
    btn.innerText = 'Complete Repair & Bill →';
    showToast('Repair work started.');
  } else if (jobStepIndex === 2) {
    if (jobCanvasInterval) clearInterval(jobCanvasInterval);
    
    // Configure QR payment card values
    document.getElementById('qr-driver-name').innerText = "Aarav Sharma";
    document.getElementById('qr-issue-type').innerText = "Flat Tyre Assistance";
    document.getElementById('qr-total-amount').innerText = "₹354.00";
    
    // Generate code
    generateUPIQRCode("354.00", "Aarav Sharma");
    goToScreen('mechanic-qr');
  }
}

function triggerCallCustomer() {
  showToast('Initiating call with customer Aarav Sharma...');
  window.location.href = `tel:+919876543210`;
}

function generateUPIQRCode(amount, customerName) {
  const container = document.getElementById('qr-code-container');
  container.innerHTML = `
    <svg viewBox="0 0 160 160" width="160" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="160" height="160" fill="#FFFFFF" rx="12"/>
      
      <!-- Finder Patterns (Top Left, Top Right, Bottom Left) -->
      <rect x="15" y="15" width="30" height="30" fill="#1E1B4B" rx="4"/>
      <rect x="21" y="21" width="18" height="18" fill="#FFFFFF" rx="2"/>
      <rect x="25" y="25" width="10" height="10" fill="#6D28D9" rx="1"/>
      
      <rect x="115" y="15" width="30" height="30" fill="#1E1B4B" rx="4"/>
      <rect x="121" y="21" width="18" height="18" fill="#FFFFFF" rx="2"/>
      <rect x="125" y="25" width="10" height="10" fill="#6D28D9" rx="1"/>
      
      <rect x="15" y="115" width="30" height="30" fill="#1E1B4B" rx="4"/>
      <rect x="21" y="121" width="18" height="18" fill="#FFFFFF" rx="2"/>
      <rect x="25" y="125" width="10" height="10" fill="#6D28D9" rx="1"/>
      
      <!-- Alignment Pattern Bottom Right -->
      <rect x="120" y="120" width="15" height="15" fill="#6D28D9" rx="2"/>
      <rect x="124" y="124" width="7" height="7" fill="#FFFFFF" rx="1"/>
      <rect x="126" y="126" width="3" height="3" fill="#1E1B4B"/>
      
      <!-- Mock QR grid bits -->
      <g fill="#6D28D9">
        <rect x="55" y="15" width="10" height="5"/>
        <rect x="75" y="15" width="15" height="10"/>
        <rect x="100" y="20" width="5" height="15"/>
        
        <rect x="15" y="55" width="10" height="10"/>
        <rect x="35" y="60" width="15" height="5"/>
        <rect x="55" y="35" width="20" height="10"/>
        <rect x="80" y="45" width="10" height="15"/>
        <rect x="95" y="45" width="15" height="10"/>
        
        <rect x="15" y="80" width="15" height="10"/>
        <rect x="40" y="80" width="20" height="5"/>
        <rect x="65" y="70" width="10" height="20"/>
        <rect x="85" y="75" width="20" height="15"/>
        <rect x="110" y="65" width="10" height="10"/>
        <rect x="125" y="55" width="20" height="15"/>
        <rect x="130" y="80" width="15" height="10"/>
        
        <rect x="55" y="100" width="15" height="10"/>
        <rect x="80" y="105" width="10" height="20"/>
        <rect x="95" y="100" width="15" height="15"/>
        
        <rect x="55" y="120" width="10" height="20"/>
        <rect x="70" y="130" width="20" height="10"/>
        <rect x="95" y="130" width="15" height="15"/>
      </g>
      
      <!-- Center UPI Emblem -->
      <rect x="65" y="65" width="30" height="30" fill="#FFFFFF" rx="6" stroke="#EDE9FE" stroke-width="1.5"/>
      <text x="80" y="84" font-family="system-ui, sans-serif" font-weight="900" font-size="8" fill="#6D28D9" text-anchor="middle">UPI</text>
    </svg>
  `;
}

function confirmMechanicPayment() {
  showToast('Settlement Confirmed! Payment Received.');
  setTimeout(() => {
    // Reset toggle
    const toggle = document.getElementById('mech-status-toggle');
    if (toggle) toggle.checked = false;
    toggleMechanicOnlineStatus(false);
    
    goToScreen('mechanic-home');
  }, 1200);
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

