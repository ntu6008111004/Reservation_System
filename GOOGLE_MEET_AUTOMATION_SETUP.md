# ตั้งค่า Google Meet Automation

เอกสารนี้อธิบายการเปิดใช้ Google Meet สำหรับระบบจองห้องประชุม โดยการจองออนไลน์แต่ละรายการจะตั้งค่าให้ผู้มีลิงก์เข้าห้องได้ทันที และบันทึกวิดีโออัตโนมัติเมื่อบัญชีที่มีสิทธิ์บันทึกเข้าร่วมประชุม

## สิ่งที่ระบบทำ

- สร้าง Google Calendar event และ Google Meet จากบัญชีเจ้าของระบบเหมือนเดิม
- ตั้งค่า Meet เป็น `OPEN`: ผู้ที่มีลิงก์เข้าร่วมได้โดยไม่ต้องรอผู้จัดกดยอมรับ
- ตั้งค่า Auto-record ต่อรายการจองออนไลน์
- เมื่อไฟล์บันทึกพร้อม ระบบตรวจทุก 15 นาที แล้วตั้งชื่อเป็น `Meet ddMMyyyy - หัวข้อประชุม.mp4`
- ไฟล์จะถูกรวมไว้ในโฟลเดอร์ Drive ชื่อ `Reservation System - Google Meet Recordings`
- Admin กด `ตรวจและจัดไฟล์บันทึก Meet` เพื่อสั่งตรวจทันทีได้

## ข้อจำกัดของ Google Meet

- Auto-record จะเริ่มเมื่อมีบัญชีที่ Google Workspace อนุญาตให้บันทึกเข้าร่วมประชุม ไม่สามารถให้ผู้ใช้ที่มีเพียงลิงก์ทุกคนกดบันทึกได้เอง เพราะสิทธิ์นี้ถูกควบคุมโดย Google Workspace และผู้จัดประชุม
- เมื่อผู้เข้าร่วมออกหมด Google Meet จะหยุดการประชุม/บันทึกตามพฤติกรรมของ Google Meet เอง ระบบไม่สามารถกำหนดกฎ “ไม่มีคนเกิน 5 นาที” แบบละเอียดผ่าน Apps Script ได้
- การสร้างไฟล์หลังประชุมอาจใช้เวลาหลายนาที ระบบจึงตรวจเป็นรอบทุก 15 นาที
- ฟังก์ชันบันทึกวิดีโอต้องรองรับโดย Google Workspace edition และต้องเปิดสิทธิ์ Record/Drive จาก Google Workspace Admin

## ตั้งค่าครั้งแรก

1. เปิด Google Cloud project ที่ผูกกับ Apps Script นี้ แล้วเปิด Google Meet REST API:
   [Google Cloud API Library](https://console.cloud.google.com/apis/library/meet.googleapis.com)

2. เปิด Apps Script editor ของโปรเจกต์ แล้วกด Run ฟังก์ชัน `setupDatabase` หนึ่งครั้ง

3. ยอมรับสิทธิ์ใหม่ของระบบ ได้แก่ Google Meet settings, อ่านข้อมูล Meet recording, จัดการไฟล์ Google Drive, เรียก API ภายนอก และสร้าง time trigger

4. เปิดหน้า Web App, เข้าสู่ระบบ Admin แล้วไปที่ `ตั้งค่าฟีเจอร์`

5. เปิดสองรายการนี้ แล้วกดบันทึก:

   - `ผู้ที่มีลิงก์ Google Meet เข้าประชุมได้ทันที`
   - `บันทึกการประชุมออนไลน์อัตโนมัติ`

6. Deploy เวอร์ชันใหม่ของ Web App หลัง push โค้ดแล้ว

## ทดสอบรับงาน

1. จองรายการประเภท `ออนไลน์` โดยกำหนดเวลาในอนาคตไม่กี่นาที
2. ตรวจว่าหน้าสรุปมี Google Meet URL
3. เปิด URL ด้วยบัญชีทดสอบที่ไม่ใช่เจ้าของ แล้วตรวจว่าเข้าได้โดยไม่ต้องกดขออนุญาต
4. เข้าห้องด้วยบัญชีเจ้าของ/บัญชีที่องค์กรให้สิทธิ์บันทึก และตรวจว่า Meet เริ่มบันทึกอัตโนมัติ
5. ออกจากห้องทุกคน รอให้ Google สร้างไฟล์บันทึก
6. รอไม่เกิน 15 นาที หรือกด `ตรวจและจัดไฟล์บันทึก Meet` ใน Admin
7. ตรวจไฟล์ใน Drive ว่าชื่อขึ้นต้นด้วย `Meet` ตามด้วยวันที่และหัวข้อประชุม

## หากขึ้น PENDING_SETUP

การจองยังสำเร็จและ Meet URL ยังใช้งานได้ แต่ระบบตั้งค่านโยบาย Meet ไม่สำเร็จ ให้ตรวจตามลำดับนี้:

1. เปิด Google Meet REST API ใน Cloud project ที่ผูกกับ Apps Script ถูกตัว
2. Run `setupDatabase` อีกครั้งและยอมรับ OAuth scopes ใหม่
3. ตรวจ Google Workspace Admin ว่าบัญชีเจ้าของระบบมีสิทธิ์สร้าง Meet และบันทึกวิดีโอ
4. เปิด Admin > ตรวจระบบ เพื่อดูข้อความผิดพลาดจาก Google Meet API

แหล่งอ้างอิง: [Google Meet API: Configure meeting spaces](https://developers.google.com/workspace/meet/api/guides/meeting-spaces-configuration), [Google Meet API: recording artifacts](https://developers.google.com/workspace/meet/api/guides/artifacts), [Google Meet Help: access and auto-record](https://support.google.com/meet/answer/9302870)
