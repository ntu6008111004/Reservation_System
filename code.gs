/**
 * Code.gs - Extended Hours & Conflict Names
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบจองห้องประชุม')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  let result;
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    const data = params.data;

    switch (action) {
      case 'getAvailableTimeSlots':
        result = getAvailableTimeSlots(data.date, data.room);
        break;
      case 'getAvailableEndTimes':
        result = getAvailableEndTimes(data.date, data.room, data.startTime);
        break;
      case 'checkDuplicateBooking':
        result = checkDuplicateBooking(data.date, data.room, data.startTime, data.endTime);
        break;
      case 'saveReservation':
        result = saveReservation(data);
        break;
      case 'getReservationsByDateAndRoom':
        result = getReservationsByDateAndRoom(data.date, data.room);
        break;
      case 'getAllReservations':
        result = getAllReservations();
        break;
      case 'cancelReservation':
        result = cancelReservation(data);
        break;
      default:
        throw new Error('Invalid action');
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ดึงข้อมูลการจองทั้งหมด
 */
function getAllReservations() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Reservations');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const results = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      
      results.push({
        date: formatDate(new Date(row[0])),
        room: String(row[1]),
        startTime: formatTime(row[2]),
        endTime: formatTime(row[3]),
        name: String(row[4]),
        phone: String(row[5])
      });
    }

    results.sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });

    return results;
  } catch (e) { return []; }
}

/**
 * ยกเลิกการจอง
 */
function cancelReservation(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Reservations');
    if (!sheet) return { success: false, message: 'ไม่พบชีทข้อมูล' };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowDate = formatDate(new Date(row[0]));
      const rowRoom = String(row[1]);
      const rowStart = formatTime(row[2]);
      const rowName = String(row[4]);

      if (rowDate === data.date && rowRoom === data.room && rowStart === data.startTime && rowName === data.name) {
        sheet.deleteRow(i + 1);
        const cache = CacheService.getScriptCache();
        cache.remove(`res_${data.date}_${data.room}`.replace(/\s+/g, '_'));
        return { success: true, message: 'ยกเลิกการจองเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลที่ต้องการยกเลิก' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getReservationsByDateAndRoom(date, room) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `res_${date}_${room}`.replace(/\s+/g, '_');
  const cachedData = cache.get(cacheKey);

  if (cachedData) return JSON.parse(cachedData);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Reservations');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const reservations = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowDate = formatDate(new Date(row[0]));
      const rowRoom = String(row[1]).trim();
      if (rowDate === date && rowRoom === room) {
        reservations.push({
          startTime: formatTime(row[2]),
          endTime: formatTime(row[3]),
          name: String(row[4]) // เก็บชื่อไว้ตรวจสอบชนกัน
        });
      }
    }
    cache.put(cacheKey, JSON.stringify(reservations), 20);
    return reservations;
  } catch (e) { return []; }
}

function saveReservation(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Reservations');
    if (!sheet) {
      sheet = ss.insertSheet('Reservations');
      sheet.appendRow(['วันที่', 'ห้อง', 'เริ่ม', 'จบ', 'ชื่อ', 'เบอร์']);
    }
    const phoneVal = data.phone ? "'" + data.phone : "-";
    sheet.appendRow([data.date, data.room, data.startTime, data.endTime, data.name, phoneVal]);
    const cache = CacheService.getScriptCache();
    cache.remove(`res_${data.date}_${data.room}`.replace(/\s+/g, '_'));
    return { success: true, message: 'บันทึกการจองเรียบร้อยแล้ว' };
  } catch (error) { return { success: false, message: error.toString() }; }
}

function getAvailableTimeSlots(date, room) {
  const allSlots = [];
  // ปรับเวลาเป็น 8:00 - 20:00
  for (let h = 8; h <= 19; h++) {
    for (let m = 0; m < 60; m += 30) {
      allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  const reservations = getReservationsByDateAndRoom(date, room);
  const booked = new Set();
  reservations.forEach(res => {
    const startMin = timeToMin(res.startTime);
    const endMin = timeToMin(res.endTime);
    allSlots.forEach(slot => {
      const slotMin = timeToMin(slot);
      if (slotMin >= startMin && slotMin < endMin) booked.add(slot);
    });
  });
  return allSlots.filter(s => !booked.has(s));
}

function getAvailableEndTimes(date, room, startTime) {
  const allSlots = [];
  // สิ้นสุดได้ถึง 20:00
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 20 && m > 0) break;
      allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  const startMin = timeToMin(startTime);
  const reservations = getReservationsByDateAndRoom(date, room);
  let nextStart = 1200; // 20:00 (20 * 60)
  reservations.forEach(res => {
    const resStart = timeToMin(res.startTime);
    if (resStart > startMin && resStart < nextStart) nextStart = resStart;
  });
  return allSlots.filter(s => {
    const m = timeToMin(s);
    return m > startMin && m <= nextStart;
  });
}

/**
 * ตรวจสอบการจองซ้ำ พร้อมระบุชื่อผู้จอง
 */
function checkDuplicateBooking(date, room, startTime, endTime) {
  const reservations = getReservationsByDateAndRoom(date, room);
  const s = timeToMin(startTime);
  const e = timeToMin(endTime);
  
  const conflict = reservations.find(res => {
    const rs = timeToMin(res.startTime);
    const re = timeToMin(res.endTime);
    return (s >= rs && s < re) || (e > rs && e <= re) || (s <= rs && e >= re);
  });

  if (conflict) {
    return { isDuplicate: true, name: conflict.name };
  }
  return { isDuplicate: false };
}

function timeToMin(t) {
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function formatTime(t) {
  if (t instanceof Date) return Utilities.formatDate(t, Session.getScriptTimeZone(), 'HH:mm');
  return String(t);
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}