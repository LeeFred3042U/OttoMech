# Walkthrough - OttoMech Mobile Roadside Assistance App (Dual Journeys)

I have built the OttoMech (OttoAssist) roadside assistance mobile web application. The implementation incorporates a clean, modern **White and Violet** design theme, standardizes the gear-and-curve-arrow logo image, and implements an interactive single-page application (SPA) powered by **Leaflet.js interactive mapping** (complete with sepia-violet brand-matching CSS tile coloring filters) for real-world GPS routing and tracking, replicating the full journeys of both **Customers (Drivers)** and **Mechanics**.

---

## Dual User Flows

### A. The Customer (Driver) Journey
1. **Role Select**: Click **"I need a mechanic"** on the landing screen, then click **"Sign Up"**.
2. **Registration & Passwords**: Enter profile details along with a password (minimum 6 characters). Registration saves credentials locally to the browser's database.
3. **Home Map & Issue Grid**:
   - Views Lucknow landmarks (Gomti River, Faizabad Road, Lohia Park, Janeshwar Park) on the canvas map.
   - Detects the driver's real physical coordinates using the browser's HTML5 Geolocation API, and reverse-geocodes it into an actual street/neighborhood address string dynamically using the public OpenStreetMap Nominatim API.
   - Selects multiple items from an Uber-style issue selector grid (*Flat tyre, Battery, Engine, Overheating, Other*) to request custom consolidated services. The system dynamically sums up repair rates and scales taxes accordingly.
   - Attaches breakdown photos using the photo upload file input.
   - Displays upfront pricing guarantees.
4. **Dispatching Radar**: Searches Lucknow for active garages, rendering cards with ratings, distances, and MRI (Mechanic Reliability Index) scores.
5. **Route Tracking**: Once matched with a mechanic (e.g. *Deepak Singh*), tracks their live pin as they drive along Lucknow roads to the user's location. Renders ETA countdowns and enables telephone calls.
6. **Payment & Review**: Displays an itemized invoice receipt, requests rating stars (1-5★), tip inputs (₹30, ₹50, ₹100), and issues a **30-Day active warranty guarantee certificate** with digital print options.

---

### B. The Mechanic Journey (New!)
1. **Role Select**: Click **"I'm a mechanic"** on the landing screen, then click **"Sign Up"**.
2. **Garage Affiliation Registration**:
   - In addition to standard details, the form exposes a choice: **Independent Mechanic** vs **Has Registered Garage**.
   - Choosing **"Has Garage"** slides down custom inputs for **Garage Name** and **Garage Address**.
   - Input fields are validated dynamically.
3. **Mechanic Dashboard**:
   - Displays profile overview linking registered names and avatars.
   - Exhibits a garage tag card with their registered garage location.
   - Hosts an **"Online Status" switch toggle**. Switching **"Online"** activates the GPS standby radar animation and registers them as active.
4. **Simulated Customer Booking Alert**:
   - After being online for 5 seconds, the mechanic receives an **incoming request alert popup**.
   - Renders the driver name (*"Aarav Sharma"*), issue (*"Flat tyre"*), distance to driver (*"1.4 km"*), breakdown address, and the **Predicted Cost of Repair** (calculated dynamically, e.g. ₹354.00 for flat tyre assistance).
   - Allows the mechanic to **Decline** (which resets standby) or **Accept & Ride**.
5. **Route Navigation Map**:
   - Renders a live canvas map showing the mechanic navigating towards the customer's coordinates.
   - Displays step progress states: *Drive -> Inspect -> Repair*.
   - Features a **Call Customer** quick-action button.
6. **Payment QR Code Screen**:
   - Once the mechanic marks the repair as completed, a scan-and-pay screen opens.
   - Exhibits an invoice bill summary.
   - Generates a **UPI QR Code** dynamically (rendered in inline vector paths with a violet/white theme and center UPI emblem) for in-person settlements.
   - Clicking **"Confirm Payment Received"** takes the mechanic back online on the dashboard.

---

## Local Verification Instructions

The HTTP server is running at `http://localhost:8000`. Open this url in your browser to verify:

1. **Verify Driver Flow**: Choose **"I need a mechanic"** and register to verify map dispatch, route tracking, invoice billing, ratings, and 30-day warranty certificate outputs.
2. **Verify Mechanic Flow**: Restart the app (click "Switch to Driver View" or click "Request New Service" at the end of the driver flow, then click the back buttons to return to the landing screen). Choose **"I'm a mechanic"**, sign up (inputting custom garage details and setting a password), log in with those credentials, toggle status **"Online"**, wait 5 seconds, and accept the booking request to play through the navigation steps and scan the payment QR code.
3. **Verify Offline Caches**: Toggle the **"Network Status"** switch at the top right of the viewport to simulate low-connectivity offline behaviors.
