function setupScriptProperties(overwrite) {
  var props = PropertiesService.getScriptProperties();
  var defaults = {
    OWNER_EMAIL: 'tsmile.it.official@gmail.com',
    CALENDAR_ID: 'primary',
    APP_TIMEZONE: 'Asia/Bangkok',
    APP_ENV: 'production'
  };
  Object.keys(defaults).forEach(function (key) {
    if (overwrite || !props.getProperty(key)) props.setProperty(key, defaults[key]);
  });
  return props.getProperties();
}

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);
  return spreadsheetId;
}

function getSpreadsheetId() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) spreadsheetId = createSpreadsheetIfMissing();
  return spreadsheetId;
}

function createSpreadsheetIfMissing() {
  setupScriptProperties();
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) return spreadsheetId;
  var spreadsheet = SpreadsheetApp.create('Reservation System DB');
  props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet.getId();
}

function setupDatabase() {
  setupScriptProperties();
  createSpreadsheetIfMissing();
  Object.keys(DatabaseService.SHEETS).forEach(function (name) {
    DatabaseService.ensureSheet(name);
  });
  seedSettings();
  seedRooms();
  DatabaseService.upsertByKey('system_meta', 'key', 'schema_version', {
    key: 'schema_version',
    value: '1',
    updatedAt: Utils.nowIso()
  });
  verifyDatabaseSchema();
  return { spreadsheetId: getSpreadsheetId(), status: 'ready' };
}

function seedSettings() {
  SettingsService.setDefault('booking_policy', 'first_conflict_wins', 'Reject overlapping bookings for the same room.');
  SettingsService.setDefault('online_meeting_provider', 'google_meet', 'Online meetings use Google Calendar conference data.');
  SettingsService.setDefault('web_app_access', 'Anyone with the link', 'Recommended lightweight access mode.');
  SettingsService.setDefault('email_notifications_enabled', 'false', 'Keep email notifications disabled until users are ready.');
  SettingsService.setDefault('calendar_invite_requester_enabled', 'false', 'Invite requester email to Calendar/Meet only when admins enable it.');
}

function seedRooms() {
  var defaults = [
    { id: 'ROOM-101', name: 'Meeting Room 101', capacity: 8, location: 'Office', type: 'ONSITE', active: 'true', notes: 'ใช้สำหรับประชุมในห้อง' },
    { id: 'ROOM-102', name: 'Meeting Room 102', capacity: 12, location: 'Office', type: 'ONSITE', active: 'true', notes: 'ใช้สำหรับประชุมในห้อง' },
    { id: 'ONLINE', name: 'Online Meeting', capacity: 100, location: 'Google Meet', type: 'ONLINE', active: 'true', notes: 'ใช้สำหรับประชุมออนไลน์และสร้าง Google Meet URL' },
    { id: 'OFFSITE', name: 'นอกสถานที่', capacity: 100, location: 'External', type: 'OFFSITE', active: 'true', notes: 'ใช้สำหรับบันทึกการประชุมนอกสถานที่' }
  ];
  defaults.forEach(function (room) {
    if (!DatabaseService.findByKey('rooms', 'id', room.id)) DatabaseService.appendObject('rooms', room);
  });
}

function verifyDatabaseSchema() {
  var report = {};
  Object.keys(DatabaseService.SHEETS).forEach(function (name) {
    var sheet = DatabaseService.ensureSheet(name);
    var actual = sheet.getRange(1, 1, 1, DatabaseService.headers(name).length).getValues()[0];
    report[name] = JSON.stringify(actual) === JSON.stringify(DatabaseService.headers(name));
  });
  var failed = Object.keys(report).filter(function (key) { return !report[key]; });
  if (failed.length) throw new Error('Schema mismatch: ' + failed.join(', '));
  return report;
}

function repairDatabaseSchema() {
  Object.keys(DatabaseService.SHEETS).forEach(function (name) {
    DatabaseService.ensureSheet(name);
  });
  return verifyDatabaseSchema();
}

function clearBookingDataForTesting(actor) {
  setupDatabase();
  var bookings = DatabaseService.listObjects('bookings');
  var calendarCleanup = bookings
    .filter(function (booking) { return booking.calendarEventId; })
    .map(function (booking) {
      return Utils.safeRun('deleteCalendarEvent:' + booking.id, function () {
        return CalendarService.deleteEvent(booking.calendarEventId);
      });
    });
  var clearedBookings = DatabaseService.clearObjects('bookings');
  var clearedIndex = DatabaseService.clearObjects('booking_index');
  AuditLogService.log(actor || 'SYSTEM', 'BOOKING_DATA_CLEARED', 'maintenance', 'clearBookingDataForTesting', {
    bookings: clearedBookings.clearedRows,
    bookingIndex: clearedIndex.clearedRows,
    calendarCleanup: calendarCleanup
  });
  return {
    status: 'cleared',
    bookings: clearedBookings.clearedRows,
    bookingIndex: clearedIndex.clearedRows,
    calendarCleanup: calendarCleanup
  };
}

function setupInitialAdmin(username, temporaryPassword) {
  setupDatabase();
  return AdminAuthService.createAdmin(username || 'tsmile.it.official@gmail.com', temporaryPassword);
}

function runSystemDiagnostics() {
  var checks = [
    Utils.safeRun('scriptProperties', function () { return setupScriptProperties(); }),
    Utils.safeRun('spreadsheetId', function () { return getSpreadsheetId(); }),
    Utils.safeRun('databaseSchema', function () { return verifyDatabaseSchema(); }),
    Utils.safeRun('settings', function () { return DatabaseService.listObjects('settings').length > 0; }),
    Utils.safeRun('emailNotifications', function () {
      return {
        enabled: EmailNotificationService.enabled(),
        mode: EmailNotificationService.enabled() ? 'ready_to_send_optional_email' : 'disabled_waiting_for_user_adoption'
      };
    }),
    Utils.safeRun('sheetCapacity', function () { return DatabaseService.sheetCapacityReport(); }),
    Utils.safeRun('calendarAccess', function () { return CalendarService.testAccess(); }),
    Utils.safeRun('calendarMeetCreation', function () { return CalendarService.testMeetCreation(); }),
    Utils.safeRun('cacheService', function () { return CacheLayer.test(); }),
    Utils.safeRun('lockService', function () {
      var lock = LockService.getScriptLock();
      var locked = lock.tryLock(1000);
      if (locked) lock.releaseLock();
      return locked;
    }),
    Utils.safeRun('adminExists', function () { return DatabaseService.listObjects('admins').length > 0; }),
    Utils.safeRun('revision', function () { return DatabaseService.findByKey('system_meta', 'key', 'schema_version'); }),
    Utils.safeRun('webAppConfig', function () { return SettingsService.publicSettings(); })
  ];
  return {
    generatedAt: Utils.nowIso(),
    ok: checks.every(function (check) { return check.ok; }),
    checks: checks
  };
}
