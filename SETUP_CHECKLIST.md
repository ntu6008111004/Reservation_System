# Setup Checklist

- [ ] Login to Google with owner account
- [ ] Create or confirm Google Sheet
- [ ] Set SPREADSHEET_ID in Script Properties
- [ ] Enable Calendar API advanced service
- [ ] Enable Calendar API in Google Cloud project
- [ ] Run setupDatabase()
- [ ] Run setupInitialAdmin()
- [ ] Deploy Apps Script Web App
- [ ] Authorize requested scopes
- [ ] Test public booking
- [ ] Test Online booking with Google Meet URL
- [ ] Test email reminders at 30 and 15 minutes
- [ ] Test admin login
- [ ] Test conflict prevention
- [ ] Test dashboard
- [ ] Test audit log
- [ ] Push dev branch
- [ ] Push main branch

## Production Safety

- [ ] No Google password committed
- [ ] No GitHub password committed
- [ ] No OAuth refresh token committed
- [ ] No `.clasprc.json`, `.env`, `credentials.json`, or `token.json` committed
- [ ] README and DEPLOYMENT use placeholders for sensitive values
- [ ] Final Web App access mode documented
