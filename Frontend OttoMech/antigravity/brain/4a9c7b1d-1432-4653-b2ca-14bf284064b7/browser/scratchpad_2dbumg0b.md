# OttoMech Walkthrough Checklist

- [ ] Navigate to http://localhost:8000 and inspect splash page. (Failed: open_browser_url tool is not supported on Windows)
- [ ] Perform signup flow: click 'Sign Up', enter details, click 'Continue'.
- [ ] Enter mock OTP digits and click 'Verify'.
- [ ] Select 'Flat tyre' issue and click 'Find mechanic'.
- [ ] Select 'Deepak Singh' on dispatch screen.
- [ ] Wait for tracking screen route movement.
- [ ] Open chat, send quick reply, close chat.
- [ ] Wait for repair completion and auto-navigation to payment screen.
- [ ] Click 'Pay' and proceed.
- [ ] Select 5-star rating and click 'Submit Review'.
- [ ] Verify 30-day warranty certificate and total paid amount on receipt screen.

## Notes
The `open_browser_url` tool failed with: `local chrome mode is only supported on Linux`.
Since the current environment is running on Windows, the browser subagent cannot perform the walkthrough.

