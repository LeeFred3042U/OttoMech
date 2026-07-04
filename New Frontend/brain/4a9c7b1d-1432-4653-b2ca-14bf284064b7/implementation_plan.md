# Implementation Plan - Dual Flow (Driver & Mechanic) Roadside Assistance App

This plan outlines the architecture for integrating the **Mechanic User Flow** alongside the existing **Driver User Flow** in the OttoMech web app. The application theme (White and Violet) will be preserved, and branding remains consistent with the local logo file.

## User Review Required

> [!IMPORTANT]
> **Mechanic Role Selection**: The role selection on the landing page ("I need a mechanic" vs "I'm a mechanic") will dictate which signup forms and dashboard screens are displayed.
> **Garage Registration**: Mechanics will have options to define if they are independent or belong to a physical garage, exposing inputs for "Garage Name" and "Garage Address".
> **UPI Payment QR Codes**: A payment screen on the mechanic's interface will render a functional visual QR code representing UPI details so that customers can pay by scanning the mechanic's phone.

## Proposed Changes

We will modify files inside `C:\Users\hp\.gemini\antigravity\scratch\ottomech-app`.

### Core Application Views

#### [MODIFY] [index.html](file:///C:/Users/hp/.gemini/antigravity/scratch/ottomech-app/index.html)
- Add conditional garage input fields in the registration form (hidden by default, displayed only when the mechanic role is active).
- Add new single-page application screen panels:
  1. **Mechanic Dashboard (`screen-mechanic-home`)**: Profile overview, online/offline status switch, active standby status indicator.
  2. **Booking Alert Modal (`screen-booking-alert`)**: Slide-down card showing an incoming driver request, detailing customer name, issue, distance, and predicted cost.
  3. **Mechanic Active Job Navigation (`screen-mechanic-job`)**: Navigation map, job status timeline (Drive -> Inspect -> Repair), and a "Complete Repair" button.
  4. **Mechanic Payment QR (`screen-mechanic-qr`)**: In-person billing invoice summary and a styled mock UPI QR Code block.

#### [MODIFY] [styles.css](file:///C:/Users/hp/.gemini/antigravity/scratch/ottomech-app/styles.css)
- Style garage conditional form fields with slide-down transition animations.
- Create dashboard styles for the mechanic home screen (active grid states, toggle status colors).
- Style the incoming request alert card with floating borders, violet glow, and high-priority z-indexing.
- Style the payment QR code graphic with responsive scaling.

#### [MODIFY] [app.js](file:///C:/Users/hp/.gemini/antigravity/scratch/ottomech-app/app.js)
- Extend routing state machine to handle the dual flow (Driver vs Mechanic paths).
- Update the form submission event to capture mechanic profile values (Garage Name, Garage Address, affiliation type).
- Simulate booking alert trigger: If the mechanic goes online, queue a simulated booking request after 5 seconds.
- Calculate the predicted cost dynamically depending on the driver's registered issue.
- Draw route animations on the mechanic tracking map showing navigation toward the customer's coordinates.
- Inject UPI details dynamically into the QR code template.

## Verification Plan

### Manual Verification
1. Open the application locally.
2. Select **"I'm a mechanic"** on the landing screen and click **"Sign Up"**.
3. Verify that the form dynamically displays options for Independent vs Garage with inputs for "Garage Name" and "Garage Address".
4. Complete the signup and OTP screens.
5. Verify navigation to the **Mechanic Dashboard**. Toggle the status switch to **"Online"**.
6. Wait 5 seconds and confirm that the **Booking Alert Modal** appears, showing the predicted cost (e.g. ₹354 for a flat tyre) and distance.
7. Click **"Accept"** and watch the navigation map update.
8. Click **"Complete Repair"** and verify that the payment QR code screen shows up with the correct invoice amount.
9. Click **"Confirm Payment"** and confirm it returns you safely to the dashboard.
