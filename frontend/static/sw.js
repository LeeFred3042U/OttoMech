self.addEventListener('push', function(event) {
    if (event.data) {
        var data = event.data.json();
        var options = {
            body: data.body,
            icon: '/static/favicon.ico',
            data: { url: data.url }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});

// --- PWA Offline Caching ---
const CACHE_NAME = 'ottomech-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/login/user',
    '/dashboard/user',
    '/static/css/base.css',
    '/static/img/oLogo.svg',
    '/static/img/motorbike.svg',
    '/static/js/login.js',
    '/static/js/dashboard_user.js',
    '/static/js/register.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.socket.io/4.7.5/socket.io.min.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;
    
    // Ignore API calls and socket.io requests for the general cache strategy
    if (event.request.url.includes('/socket.io/') || event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request).then(function(networkResponse) {
            // Clone and cache the successful response
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                var responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
        }).catch(function() {
            // Fallback to cache if offline
            return caches.match(event.request);
        })
    );
});
