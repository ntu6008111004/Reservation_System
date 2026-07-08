# Deployment Guide

เอกสารนี้ใช้สำหรับ deploy ระบบด้วยบัญชี Google เจ้าของระบบ `tsmile.it.official@gmail.com`

## 1. Login ด้วยบัญชีเจ้าของ

ติดตั้ง clasp แล้ว login:

```bash
npm install -g @google/clasp
clasp login
```

เลือกบัญชี `tsmile.it.official@gmail.com` เท่านั้นสำหรับ production

## 2. สร้างหรือเชื่อม Apps Script project

สร้าง project ใหม่:

```bash
clasp create --type webapp --title "Reservation System"
clasp push
```

ถ้ามี project อยู่แล้ว:

```bash
clasp clone <SCRIPT_ID>
clasp push
```

ใช้ `.clasp.example.json` เป็นตัวอย่างเท่านั้น ห้าม commit `.clasp.json` หรือ `.clasprc.json` ที่มีข้อมูลส่วนตัว

## 3. ตั้งค่า Script Properties

เปิด Apps Script editor แล้วรัน:

```javascript
setupScriptProperties()
```

ค่าที่ระบบตั้งให้ถ้ายังไม่มี:

- `OWNER_EMAIL = tsmile.it.official@gmail.com`
- `CALENDAR_ID = primary`
- `APP_TIMEZONE = Asia/Bangkok`
- `APP_ENV = production`

ถ้ามี Google Sheet อยู่แล้ว ให้ตั้ง:

```javascript
setSpreadsheetId('<SPREADSHEET_ID>')
```

## 4. สร้าง Google Sheet database

รัน:

```javascript
setupDatabase()
```

ถ้ายังไม่มี spreadsheet ระบบจะสร้าง `Reservation System DB` และบันทึก `SPREADSHEET_ID` ใน Script Properties

## 5. สร้าง admin แรก

รันโดยใช้รหัสผ่านชั่วคราวที่ส่งผ่านแบบ manual เท่านั้น:

```javascript
setupInitialAdmin('tsmile.it.official@gmail.com', '<TEMPORARY_PASSWORD>')
```

ระบบเก็บเฉพาะ salt และ password hash ไม่เก็บ plain text password

## 6. เปิด Calendar API และ Google Meet

ต้องตั้งค่าทั้งสองจุด:

1. Apps Script editor > Services > เพิ่ม Calendar API
2. Google Cloud project ที่ผูกกับ Apps Script > APIs & Services > Enable Google Calendar API

Google Meet URL จะสร้างได้เมื่อ Web App ได้รับ authorization จากบัญชีเจ้าของ และ calendar `primary` หรือ `CALENDAR_ID` ที่ตั้งไว้เข้าถึงได้

## 7. Deploy Web App

Apps Script editor > Deploy > New deployment > Web app

- Execute as: Me
- Who has access: Anyone with the link

ถ้าองค์กรต้องการจำกัดสิทธิ์ ให้เลือก `Anyone in the organization` และบันทึกไว้ใน checklist

## 8. Authorize scopes

เมื่อ deploy หรือรัน setup ครั้งแรก ให้ยืนยัน scopes:

- Spreadsheet access
- Calendar access
- Script Properties storage

## 9. ทดสอบ Online Meeting + Google Meet URL

1. เปิด Web App URL
2. เลือก meeting type เป็น `ออนไลน์พร้อม Google Meet`
3. ส่งแบบฟอร์มจอง
4. ตรวจว่า booking มี Meet URL ในหน้าเว็บ
5. เปิด Google Sheet ชีต `bookings` แล้วตรวจ column `meetUrl` และ `calendarEventId`

## 10. ทดสอบ email reminder

1. สร้าง booking แบบ online โดยตั้งเวลาในอนาคต
2. เปิด Google Calendar ของบัญชีเจ้าของ
3. ตรวจ event ว่ามี reminders แบบ email 30 และ 15 นาที
4. ตรวจว่า attendee ได้รับ email invitation ตาม policy ของ Google Calendar

## 11. Diagnostics

หลังตั้งค่าครบให้รัน:

```javascript
runSystemDiagnostics()
```

ถ้า Calendar Advanced Service หรือ Google Cloud Calendar API ยังไม่เปิด diagnostics จะแสดง error ที่เกี่ยวข้องอย่างชัดเจน

## 12. Push ไป GitHub

ตั้ง remote:

```bash
git remote add origin https://github.com/ntu6008111004/Reservation_System.git
```

ถ้ามี remote อยู่แล้ว:

```bash
git remote set-url origin https://github.com/ntu6008111004/Reservation_System.git
```

push branch:

```bash
git checkout dev
git add .
git commit -m "Initial complete meeting reservation system"
git push -u origin dev
git checkout main || git checkout -b main
git merge dev
git push -u origin main
```

ใช้ Git Credential Manager, SSH key หรือ GitHub Personal Access Token เท่านั้น ห้ามใช้ account password และห้าม commit token

## 13. ตรวจ secret ก่อน commit

บน macOS/Linux/Git Bash:

```bash
grep -R "password\\|token\\|secret\\|Tsmile\\|credentials" .
```

บน PowerShell:

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern 'password|token|secret|Tsmile|credentials'
```

ถ้าพบรหัสผ่านจริง token หรือ credential ให้ลบออกก่อน commit
