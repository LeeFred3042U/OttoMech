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
