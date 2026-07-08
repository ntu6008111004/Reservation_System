# คู่มือส่งต่องานระบบจองห้องประชุม

เอกสารนี้สำหรับคนที่รับงานต่อแบบไม่จำเป็นต้องเป็น developer มาก่อน ให้ทำตามทีละขั้นตอนเพื่อเอาระบบขึ้น Google Apps Script, ตั้งค่า Google Sheet, เปิด Google Calendar/Google Meet และ deploy Web App

## 1. ลิงก์สำคัญ

- GitHub repo: https://github.com/ntu6008111004/Reservation_System
- Google Apps Script: https://script.google.com
- Google Cloud Calendar API: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
- Google Sheets: https://sheets.google.com

## 2. สถานะงานตอนนี้

โค้ดระบบทำเสร็จและ push ขึ้น GitHub แล้วทั้ง branch:

- `dev` สำหรับแก้งาน/พัฒนาต่อ
- `main` สำหรับ production/stable

commit ล่าสุด:

```text
c4f627c Initial complete meeting reservation system
```

ไฟล์สำคัญในโปรเจกต์:

- `README.md` อธิบายภาพรวมระบบ
- `DEPLOYMENT.md` ขั้นตอน deploy
- `SETUP_CHECKLIST.md` checklist หลังติดตั้ง
- `appsscript.json` ตั้งค่า Apps Script manifest และ scopes
- `Setup.gs` ฟังก์ชัน setup ระบบ
- `Index.html`, `Styles.html`, `Client.html` หน้าเว็บผู้ใช้งาน

## 3. บัญชีที่ต้องใช้

ให้ใช้บัญชี Google นี้เป็นเจ้าของระบบ production:

```text
tsmile.it.official@gmail.com
```

บัญชีนี้ควรเป็นเจ้าของหรือผู้ deploy:

- Google Sheet database
- Google Apps Script project
- Web App deployment
- Google Calendar
- Google Meet event
- email reminder
- admin หลักของระบบ

ห้ามใช้บัญชี Google ส่วนตัวอื่นสำหรับ production ถ้าไม่ได้รับอนุญาต

## 4. สิ่งที่ต้องติดตั้งในเครื่อง

ต้องมี:

- Git
- Node.js / npm
- Google Apps Script CLI หรือ `clasp`

เช็คว่า npm ใช้ได้:

```powershell
npm --version
```

ถ้า PowerShell ใช้ `npm` ไม่ได้ ให้ลอง:

```powershell
npm.cmd --version
```

ติดตั้ง clasp:

```powershell
npm install -g @google/clasp
```

ถ้า PowerShell block ให้ใช้:

```powershell
npm.cmd install -g @google/clasp
```

เช็ค clasp:

```powershell
clasp --version
```

หรือ:

```powershell
clasp.cmd --version
```

## 5. ดึงโค้ดจาก GitHub

เปิด Terminal หรือ PowerShell แล้วรัน:

```powershell
git clone https://github.com/ntu6008111004/Reservation_System.git
cd Reservation_System
git checkout dev
```

ถ้ามีโฟลเดอร์โปรเจกต์อยู่แล้ว ให้เข้าโฟลเดอร์นั้นแล้วรัน:

```powershell
git checkout dev
git pull origin dev
```

## 6. Login clasp ด้วยบัญชีเจ้าของ

รัน:

```powershell
clasp login
```

หรือ:

```powershell
clasp.cmd login
```

browser จะเปิดหน้า Google login ให้เลือก:

```text
tsmile.it.official@gmail.com
```

สำคัญ: ขั้นตอนนี้เป็น OAuth login ของ Google ห้ามส่ง password ให้คนอื่น และห้ามเอา credential/token ไป commit

## 7. สร้าง Google Apps Script project

หลัง login แล้ว ให้รันจากโฟลเดอร์โปรเจกต์:

```powershell
clasp create --type webapp --title "Reservation System"
```

หรือ:

```powershell
clasp.cmd create --type webapp --title "Reservation System"
```

คำสั่งนี้จะสร้าง Apps Script project ใหม่ และอาจสร้างไฟล์ `.clasp.json` ในเครื่อง

สำคัญมาก:

- ห้าม commit `.clasp.json`
- ห้าม commit `.clasprc.json`
- ห้าม commit credential/token/password ใด ๆ

จากนั้น push โค้ดขึ้น Apps Script:

```powershell
clasp push
```

หรือ:

```powershell
clasp.cmd push
```

## 8. ถ้ามี Apps Script project อยู่แล้ว

ถ้าได้รับ `SCRIPT_ID` มาแล้ว ไม่ต้อง create ใหม่ ให้ clone project เดิม:

```powershell
clasp clone <SCRIPT_ID>
```

แล้ว push โค้ด:

```powershell
clasp push
```

ตัวอย่างไฟล์ config ดูได้จาก:

```text
.clasp.example.json
```

## 9. เปิด Apps Script Editor

รัน:

```powershell
clasp open
```

หรือเข้า:

```text
https://script.google.com
```

แล้วเปิด project ชื่อ:

```text
Reservation System
```

## 10. เปิด Calendar API ใน Apps Script

ในหน้า Apps Script:

1. ไปที่เมนู `Services`
2. กด `+`
3. เลือก `Calendar API`
4. กด `Add`

ขั้นตอนนี้จำเป็นสำหรับการสร้าง Google Meet URL

## 11. เปิด Google Calendar API ใน Google Cloud

เปิดลิงก์:

```text
https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
```

เลือก Google Cloud project ที่ผูกกับ Apps Script project แล้วกด:

```text
Enable
```

ถ้าไม่รู้ว่า Apps Script ผูกกับ Google Cloud project ไหน:

1. เปิด Apps Script project
2. ไปที่ `Project Settings`
3. ดูหัวข้อ Google Cloud Platform project
4. เปิด project นั้นใน Google Cloud Console
5. Enable `Google Calendar API`

## 12. ตั้งค่า Script Properties

ใน Apps Script Editor ให้เลือก function:

```javascript
setupScriptProperties
```

แล้วกด `Run`

ระบบจะตั้งค่า default ถ้ายังไม่มี:

```text
OWNER_EMAIL = tsmile.it.official@gmail.com
CALENDAR_ID = primary
APP_TIMEZONE = Asia/Bangkok
APP_ENV = production
```

ถ้ามี Google Sheet เดิมอยู่แล้ว ให้ตั้ง Spreadsheet ID ด้วย:

```javascript
setSpreadsheetId('<SPREADSHEET_ID>')
```

วิธีหา Spreadsheet ID:

URL ของ Google Sheet จะหน้าตาประมาณนี้:

```text
https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
```

ให้ copy ค่าในตำแหน่ง `<SPREADSHEET_ID>`

## 13. สร้าง Google Sheet database

ใน Apps Script Editor ให้รัน:

```javascript
setupDatabase()
```

ถ้ายังไม่มี `SPREADSHEET_ID` ระบบจะสร้าง Google Sheet ใหม่ชื่อ:

```text
Reservation System DB
```

ระบบจะสร้าง sheet เหล่านี้:

```text
bookings
booking_index
admins
admin_sessions
audit_logs
usage_events
settings
rooms
system_meta
```

ฟังก์ชันนี้รันซ้ำได้ ไม่ลบข้อมูลเดิม และใช้ซ่อมโครงสร้าง header ได้

## 14. สร้าง admin คนแรก

เตรียมรหัสผ่านชั่วคราวเอง ห้ามใส่ไว้ใน GitHub, README, chat สาธารณะ หรือเอกสารที่คนไม่เกี่ยวข้องเห็นได้

ใน Apps Script Editor ให้รัน:

```javascript
setupInitialAdmin('tsmile.it.official@gmail.com', '<TEMPORARY_PASSWORD>')
```

ตัวอย่าง:

```javascript
setupInitialAdmin('tsmile.it.official@gmail.com', 'ใส่รหัสผ่านชั่วคราวตรงนี้')
```

ระบบจะเก็บเฉพาะ:

- password hash
- salt

ระบบจะไม่เก็บ plain text password

## 15. ตรวจระบบด้วย Diagnostics

ใน Apps Script Editor ให้รัน:

```javascript
runSystemDiagnostics()
```

เช็คผลลัพธ์ว่าแต่ละหัวข้อผ่านหรือไม่:

- `scriptProperties`
- `spreadsheetId`
- `databaseSchema`
- `settings`
- `calendarAccess`
- `calendarMeetCreation`
- `cacheService`
- `lockService`
- `adminExists`
- `revision`
- `webAppConfig`

ถ้า `calendarMeetCreation` fail สาเหตุที่พบบ่อยคือ:

- ยังไม่ได้เปิด Calendar API ใน Apps Script Services
- ยังไม่ได้เปิด Google Calendar API ใน Google Cloud
- ยังไม่ได้ authorize scopes ด้วยบัญชีเจ้าของ
- `CALENDAR_ID` ผิด หรือบัญชีเจ้าของไม่มีสิทธิ์ calendar นั้น

## 16. Deploy Web App

ใน Apps Script Editor:

1. กด `Deploy`
2. เลือก `New deployment`
3. เลือก type เป็น `Web app`
4. ตั้งค่า:

```text
Execute as: Me
Who has access: Anyone with the link
```

5. กด `Deploy`
6. Google จะให้ authorize scopes ให้กดอนุญาตด้วยบัญชี `tsmile.it.official@gmail.com`
7. Copy Web App URL เก็บไว้

ถ้าบริษัทต้องการจำกัดเฉพาะในองค์กร ให้เลือก:

```text
Who has access: Anyone in the organization
```

แต่สำหรับ mode เบาและใช้ง่าย แนะนำ:

```text
Anyone with the link
```

## 17. ทดสอบจองห้องแบบปกติ

เปิด Web App URL ที่ได้จาก deploy แล้วทดสอบ:

1. เลือกห้องประชุม
2. ใส่หัวข้อประชุม
3. ใส่ชื่อผู้จอง
4. ใส่อีเมลผู้จอง
5. เลือกเวลาเริ่มและเวลาสิ้นสุด
6. เลือก `ประชุมในห้อง`
7. กดจอง

หลังจองสำเร็จ ให้เปิด Google Sheet แล้วดู sheet:

```text
bookings
```

ต้องมีรายการจองใหม่ขึ้นมา

## 18. ทดสอบ Online Meeting และ Google Meet URL

เปิด Web App URL แล้วทดสอบ:

1. เลือกห้องหรือ online resource
2. ใส่ข้อมูลการจอง
3. เลือกรูปแบบประชุม:

```text
ออนไลน์พร้อม Google Meet
```

4. กดจอง
5. หน้าเว็บควรแสดง Google Meet URL
6. เปิด Google Sheet sheet `bookings`
7. เช็ค column:

```text
meetUrl
calendarEventId
```

ต้องมีค่า

## 19. ทดสอบ email reminder 30 และ 15 นาที

หลังสร้าง booking แบบ online:

1. เปิด Google Calendar ของ `tsmile.it.official@gmail.com`
2. เปิด event ที่ระบบสร้าง
3. เช็คว่ามี reminders:

```text
email 30 minutes before
email 15 minutes before
```

4. เช็คว่า attendee ได้รับ calendar invitation ตาม policy ของ Google

หมายเหตุ: บางครั้ง email delivery ขึ้นกับ policy ของ Google Calendar, spam filter หรือ domain settings

## 20. ทดสอบป้องกันการจองชนกัน

ลองจองห้องเดิมในช่วงเวลาที่ทับซ้อนกับ booking เดิม

ผลที่ควรได้:

```text
ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น
```

ถ้าระบบยังยอมให้จองซ้ำ ต้องตรวจ `booking_index` และ logic ใน `BookingIndexService.gs`

## 21. ทดสอบ admin login

ตอนนี้ backend มี API สำหรับ admin login และ dashboard แล้ว แต่หน้า admin UI ยังเป็นงานที่สามารถ polish/ต่อเติมเพิ่มได้

ข้อมูล admin แรกถูกสร้างจาก:

```javascript
setupInitialAdmin('tsmile.it.official@gmail.com', '<TEMPORARY_PASSWORD>')
```

ถ้าจะต่อ UI admin ให้ใช้ action:

```text
adminLogin
adminDashboard
diagnostics
```

ผ่าน function:

```javascript
api(action, data)
```

## 22. วิธีแก้งานแล้ว push กลับ GitHub

ทำงานบน branch `dev` ก่อนเสมอ:

```powershell
git checkout dev
git pull origin dev
```

หลังแก้เสร็จ:

```powershell
git status
git add .
git commit -m "Update reservation system"
git push origin dev
```

ถ้าต้องเอาขึ้น `main`:

```powershell
git checkout main
git pull origin main
git merge dev
git push origin main
git checkout dev
```

## 23. วิธี push โค้ดขึ้น Apps Script หลังแก้

หลังแก้ไฟล์ในเครื่องแล้ว:

```powershell
clasp push
```

หรือ:

```powershell
clasp.cmd push
```

จากนั้นไป Apps Script Editor แล้ว deploy version ใหม่:

1. `Deploy`
2. `Manage deployments`
3. เลือก deployment เดิม
4. กด edit
5. เลือก version ใหม่
6. กด deploy

## 24. ข้อห้ามเรื่อง security

ห้าม commit หรือส่งต่อข้อมูลเหล่านี้:

- Google password
- GitHub password
- Personal Access Token
- OAuth refresh token
- `.clasprc.json`
- `.clasp.json`
- `.env`
- `.env.local`
- `credentials.json`
- `token.json`
- credential file ทุกชนิด

ถ้าจำเป็นต้องใช้ credential ให้ใช้:

- local CLI login session
- Google OAuth login
- Git Credential Manager
- SSH agent
- GitHub Personal Access Token ที่กรอกผ่าน prompt เท่านั้น

ห้ามเอา token ไปใส่ใน source code, README, commit message หรือ log

## 25. เช็ค secret ก่อน commit

บน PowerShell:

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern 'password|token|secret|credentials'
```

บน Git Bash/macOS/Linux:

```bash
grep -R "password\\|token\\|secret\\|credentials" .
```

ถ้าเจอรหัสผ่านจริง token หรือ credential จริง ให้ลบออกก่อน commit

หมายเหตุ: ถ้าเจอคำพวกนี้ในเอกสารคู่มือ เช่นคำว่า `<TEMPORARY_PASSWORD>` หรือคำเตือนเรื่อง token ถือว่าเป็น placeholder/คำเตือน ไม่ใช่ secret จริง

## 26. Checklist สั้นก่อนส่งงาน

- [ ] login Google ด้วย `tsmile.it.official@gmail.com`
- [ ] สร้างหรือ clone Apps Script project แล้ว
- [ ] `clasp push` สำเร็จ
- [ ] เปิด Calendar API ใน Apps Script แล้ว
- [ ] เปิด Google Calendar API ใน Google Cloud แล้ว
- [ ] รัน `setupScriptProperties()` แล้ว
- [ ] รัน `setupDatabase()` แล้ว
- [ ] สร้าง admin ด้วย `setupInitialAdmin()` แล้ว
- [ ] รัน `runSystemDiagnostics()` แล้ว
- [ ] deploy Web App แล้ว
- [ ] ทดสอบจองปกติแล้ว
- [ ] ทดสอบจอง online แล้วได้ Google Meet URL
- [ ] เช็ค email reminder 30 และ 15 นาทีแล้ว
- [ ] push โค้ดกลับ `dev` แล้ว
- [ ] merge/push `main` ถ้าพร้อม production แล้ว

## 27. สรุปให้คนรับงานต่อ

งานโค้ดหลักเสร็จแล้ว เหลือขั้นตอนที่ต้องใช้บัญชี Google เจ้าของระบบทำเอง ได้แก่ login `clasp`, สร้าง Apps Script project, เปิด Calendar API, รัน setup, deploy Web App และทดสอบ Google Meet/reminder ให้ครบ

หลังจาก deploy แล้ว ให้เก็บ Web App URL ไว้ และส่ง URL นั้นให้ทีมใช้งาน
