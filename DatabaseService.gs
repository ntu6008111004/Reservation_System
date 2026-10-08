var DatabaseService = (function () {
  var SHEETS = {
    bookings: ['id', 'createdAt', 'updatedAt', 'status', 'roomId', 'roomName', 'title', 'requesterName', 'requesterEmail', 'startTime', 'endTime', 'meetingType', 'meetUrl', 'calendarEventId', 'notes', 'createdBy', 'approvedBy', 'cancelledAt', 'gpsUrl', 'meetCode', 'meetSpaceName', 'meetConfigStatus', 'recordingFileId', 'recordingUrl', 'recordingSyncedAt', 'meetingSpaceId', 'conferenceRecordName', 'singletonSince', 'autoEndedAt', 'autoEndReason', 'autoEndStatus', 'attendeeEmails', 'memberId', 'requesterPhone', 'calendarId', 'meetSource', 'department'],
    booking_index: ['key', 'bookingId', 'roomId', 'startTime', 'endTime', 'status'],
    admins: ['username', 'email', 'passwordHash', 'salt', 'role', 'active', 'mustChangePassword', 'createdAt', 'updatedAt'],
    admin_sessions: ['sessionId', 'username', 'tokenHash', 'createdAt', 'expiresAt', 'active'],
    audit_logs: ['id', 'timestamp', 'actor', 'action', 'entityType', 'entityId', 'details'],
    usage_events: ['id', 'timestamp', 'eventName', 'actor', 'metadata'],
    settings: ['key', 'value', 'description', 'updatedAt'],
    rooms: ['id', 'name', 'capacity', 'location', 'type', 'active', 'notes'],
    members: ['id', 'phone', 'phoneKey', 'fullName', 'nickName', 'department', 'email', 'source', 'assetStaffId', 'active', 'createdAt', 'updatedAt', 'lastLoginAt', 'lastDepartment'],
    member_sessions: ['sessionId', 'memberId', 'tokenHash', 'createdAt', 'expiresAt', 'active'],
    system_meta: ['key', 'value', 'updatedAt']
  };
  var ROW_BUFFER_THRESHOLD = 100;
  var ROW_GROWTH_SIZE = 5000;

  function spreadsheet() {
    return SpreadsheetApp.openById(getSpreadsheetId());
  }

  function ensureColumnCapacity(sheet, columns) {
    var maxColumns = sheet.getMaxColumns();
    // New Google Sheets tabs have 26 columns; wider schemas must grow the grid before getRange.
    if (maxColumns < columns) sheet.insertColumnsAfter(maxColumns, columns - maxColumns);
  }

  function ensureSheet(name) {
    var headers = SHEETS[name];
    if (!headers) throw new Error('Unknown sheet: ' + name);
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureColumnCapacity(sheet, headers.length);
    var current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0] : [];
    var changed = false;
    headers.forEach(function (header, index) {
      if (current[index] !== header) {
        sheet.getRange(1, index + 1).setValue(header);
        changed = true;
      }
    });
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
    sheet.autoResizeColumns(1, headers.length);
    if (changed) AuditLogService.log('SYSTEM', 'SCHEMA_REPAIR', 'sheet', name, {});
    return sheet;
  }

  function headers(name) {
    return SHEETS[name].slice();
  }

  function rowToObject(name, row) {
    var object = {};
    headers(name).forEach(function (key, index) { object[key] = row[index]; });
    return object;
  }

  function listObjects(name) {
    var sheet = ensureSheet(name);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, headers(name).length).getValues()
      .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
      .map(function (row) { return rowToObject(name, row); });
  }

  function sheetCapacity(name, sheet) {
    sheet = sheet || ensureSheet(name);
    var maxRows = sheet.getMaxRows();
    var lastRow = sheet.getLastRow();
    return {
      sheet: name,
      maxRows: maxRows,
      usedRows: lastRow,
      remainingRows: maxRows - lastRow,
      threshold: ROW_BUFFER_THRESHOLD,
      growthSize: ROW_GROWTH_SIZE
    };
  }

  function ensureRowCapacity(name, sheet) {
    var capacity = sheetCapacity(name, sheet);
    if (capacity.remainingRows <= ROW_BUFFER_THRESHOLD) {
      sheet.insertRowsAfter(capacity.maxRows, ROW_GROWTH_SIZE);
      capacity.expanded = true;
      capacity.addedRows = ROW_GROWTH_SIZE;
      capacity.maxRows += ROW_GROWTH_SIZE;
      capacity.remainingRows += ROW_GROWTH_SIZE;
    } else {
      capacity.expanded = false;
      capacity.addedRows = 0;
    }
    return capacity;
  }

  function sheetCapacityReport() {
    return Object.keys(SHEETS).map(function (name) {
      return sheetCapacity(name);
    });
  }

  // Public form text must never become a live formula (e.g. =IMPORTXML(...) could leak sheet data);
  // the leading apostrophe makes Sheets store it as plain text and is not returned on read.
  function toCellValue(value) {
    if (value === undefined) return '';
    return typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
  }

  function appendObject(name, object) {
    var sheet = ensureSheet(name);
    ensureRowCapacity(name, sheet);
    var row = headers(name).map(function (key) { return toCellValue(object[key]); });
    sheet.appendRow(row);
    return object;
  }

  function clearObjects(name) {
    var sheet = ensureSheet(name);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    return { sheet: name, clearedRows: Math.max(lastRow - 1, 0) };
  }

  function upsertByKey(name, keyField, keyValue, object) {
    var sheet = ensureSheet(name);
    var allHeaders = headers(name);
    var keyIndex = allHeaders.indexOf(keyField);
    if (keyIndex === -1) throw new Error('Unknown key field: ' + keyField);
    var lastRow = sheet.getLastRow();
    for (var rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
      if (String(sheet.getRange(rowIndex, keyIndex + 1).getValue()) === String(keyValue)) {
        var row = allHeaders.map(function (key) { return toCellValue(object[key] === undefined ? sheet.getRange(rowIndex, allHeaders.indexOf(key) + 1).getValue() : object[key]); });
        sheet.getRange(rowIndex, 1, 1, allHeaders.length).setValues([row]);
        return object;
      }
    }
    return appendObject(name, object);
  }

  function findByKey(name, keyField, keyValue) {
    return listObjects(name).filter(function (item) { return String(item[keyField]) === String(keyValue); })[0] || null;
  }

  return {
    SHEETS: SHEETS,
    spreadsheet: spreadsheet,
    ensureSheet: ensureSheet,
    headers: headers,
    listObjects: listObjects,
    appendObject: appendObject,
    clearObjects: clearObjects,
    sheetCapacity: sheetCapacity,
    ensureRowCapacity: ensureRowCapacity,
    sheetCapacityReport: sheetCapacityReport,
    upsertByKey: upsertByKey,
    findByKey: findByKey
  };
})();
