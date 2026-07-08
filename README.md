# Reservation System

ระบบจองห้องประชุมบน Google Apps Script, Google Sheets และ Google Calendar โดยออกแบบให้บัญชี `tsmile.it.official@gmail.com` เป็นเจ้าของการใช้งาน production

## โครงสร้างไฟล์

- `appsscript.json` manifest, scopes และ Calendar Advanced Service
- `Code.gs`, `ApiRouter.gs` จุดเข้าใช้งาน Web App/API
- `Setup.gs` ฟังก์ชันตั้งค่าระบบ ฐานข้อมูล admin และ diagnostics
- `DatabaseService.gs`, `BookingService.gs`, `CalendarService.gs` บริการหลัก
- `Index.html`, `Styles.html`, `Client.html` หน้าเว็บจองห้องประชุม
- `DEPLOYMENT.md` ขั้นตอน deploy
- `SETUP_CHECKLIST.md` checklist หลังติดตั้ง

## ฟังก์ชันตั้งค่าหลัก

รันจาก Apps Script editor ด้วยบัญชีเจ้าของระบบ:

```javascript
setupScriptProperties()
setupDatabase()
setupInitialAdmin('tsmile.it.official@gmail.com', 'TEMP_PASSWORD_FROM_SECURE_PLACE')
runSystemDiagnostics()
```

ห้าม commit รหัสผ่านจริง token, OAuth credential, `.clasprc.json`, `.env`, `credentials.json` หรือไฟล์ credential ใด ๆ

## Spreadsheet ID

ถ้ายังไม่มี `SPREADSHEET_ID` ระบบจะสร้าง Google Sheet ชื่อ `Reservation System DB` เมื่อรัน `setupDatabase()` แล้วบันทึก ID ใน Script Properties ให้อัตโนมัติ

วิธียืนยัน ID:

1. เปิด Google Sheet ที่ถูกสร้าง
2. ดู URL รูปแบบ `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
3. ตรวจว่า Script Properties มีค่า `SPREADSHEET_ID` ตรงกัน

## ชีตที่ระบบสร้าง

`bookings`, `booking_index`, `admins`, `admin_sessions`, `audit_logs`, `usage_events`, `settings`, `rooms`, `system_meta`

ฟังก์ชัน `setupDatabase()` ออกแบบให้รันซ้ำได้ ไม่ลบข้อมูลเดิม และซ่อม header ที่ขาดได้
