function setupScriptProperties(overwrite) {
  var props = PropertiesService.getScriptProperties();
  var defaults = {
    OWNER_EMAIL: 'info@dentcos.com',
    CALENDAR_ID: 'primary',
    APP_TIMEZONE: 'Asia/Bangkok',
    APP_ENV: 'production',
    ASSET_SPREADSHEET_ID: '14jJNugDujh7W_Z4CZ03QscnAc4s6GH0oz9zyZ2Er9S4'
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
  Utils.safeRun('recordingSyncTrigger', function () { return MeetRecordingService.ensureSyncTrigger(); });
  Utils.safeRun('autoEndTrigger', function () { return MeetAutoEndService.ensureTrigger(); });
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
  SettingsService.setDefault('email_notifications_enabled', 'false');
  SettingsService.setDefault('max_meeting_attendees', '24');
  SettingsService.setDefault('meet_open_access_enabled', 'true');
  SettingsService.setDefault('meet_auto_recording_enabled', 'true');
  SettingsService.setDefault('meet_cohosts_enabled', 'true');
  SettingsService.setDefault('meet_recordings_folder_id', '');
  SettingsService.setDefault('meet_recordings_admin_only', 'false');
  SettingsService.setDefault('extra_departments', '["ผู้บริหาร"]');
  SettingsService.setDefault('meet_auto_end_enabled', 'true');
  SettingsService.setDefault('meet_auto_end_minutes', '10');
}

// Run once from the Apps Script editor while signed in as the Google Workspace account that
// should own the meetings (info@dentcos.com), before deploying with that account. Running it
// grants that account's permissions, makes it the system account, installs the time triggers
// under it (the old account's triggers then remove themselves) and applies the meeting policy.
function activateSystemAccount() {
  var email = SystemAccountService.activate();
  var owner = adoptSystemAccountAsOwner();
  var database = setupDatabase();
  var triggers = {
    recordingSync: MeetRecordingService.ensureSyncTrigger(true),
    autoEnd: MeetAutoEndService.ensureTrigger(true)
  };
  var policy = SettingsService.applyMeetingPolicy();
  var recordingsFolder = MeetRecordingService.adoptSharedFolder();
  MeetAutoEndService.invalidatePlan();
  var diagnostics = runSystemDiagnostics();
  AuditLogService.log(email, 'SYSTEM_ACCOUNT_ACTIVATED', 'system', email, {
    triggers: triggers,
    policyApplied: policy.applied,
    recordingsFolder: recordingsFolder.accessible ? recordingsFolder.name + (recordingsFolder.ownerEmail ? ' (' + recordingsFolder.ownerEmail + ')' : '') : 'ยังไม่ได้ตั้ง/เปิดไม่ได้',
    diagnosticsOk: diagnostics.ok,
    failedChecks: diagnostics.checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name + ': ' + check.error; })
  });
  var report = { systemAccount: email, owner: owner, database: database, triggers: triggers, policy: policy, recordingsFolder: recordingsFolder, diagnostics: diagnostics };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// The system's copy for the Google Workspace account: a new Apps Script project using a copy of the
// database ("สำเนาของ Reservation System DB"). Run once from that project's editor while signed in
// as info@dentcos.com, then deploy the web app with that account. It points the project at the
// copied database, forgets a recordings folder this account cannot open (a new one is then made in
// its Drive unless the admins' folder is shared with it) and activates the account.
var WORKSPACE_DATABASE_ID = '1xnoFTLoXYhkvVAaF8qTuX2n9aNbcJ3aQ1mFk6PVtaJU';

function setupWorkspaceProject() {
  var current = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (current && current !== WORKSPACE_DATABASE_ID) {
    throw new Error('This project already uses database ' + current + ' — setupWorkspaceProject is only for the new Workspace project.');
  }
  setSpreadsheetId(WORKSPACE_DATABASE_ID);
  var folder = MeetRecordingService.folderStatus();
  if (folder.configured && !folder.accessible) SettingsService.set('meet_recordings_folder_id', '');
  var report = activateSystemAccount();
  var meetTest = report.diagnostics.checks.filter(function (check) { return check.name === 'calendarMeetCreation'; })[0] || {};
  var meet = meetTest.ok ? meetTest.result.meetDetails || {} : {};
  console.log('สรุป: บัญชีระบบ ' + report.systemAccount +
    '\nตรวจระบบผ่านทั้งหมด: ' + report.diagnostics.ok +
    '\nไม่ผ่าน: ' + (report.diagnostics.checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name + ' — ' + check.error; }).join('\n  ') || '-') +
    '\nทดสอบสร้างห้อง Meet: ' + (meetTest.ok ? meet.source + (meet.fallbackReason ? ' (ใช้ห้องจาก Calendar เพราะ: ' + meet.fallbackReason + ')' : '') : meetTest.error) +
    '\nทดสอบตั้ง Gmail เป็นผู้ร่วมจัด: ' + JSON.stringify(meet.members || null) +
    '\nโฟลเดอร์ไฟล์บันทึก: ' + (report.recordingsFolder.accessible ? report.recordingsFolder.name : 'จะสร้างใหม่ใน Drive ของบัญชีนี้เมื่อมีไฟล์แรก'));
  return report;
}

// Creates a test meeting the way a booking does (requester = the admins' Gmail account), reads the
// room back from Google Meet and removes the test event: shows the settings Google actually applied.
function verifyMeetRoomPolicy() {
  var created = CalendarService.testMeetCreation();
  var report = { source: created.meetSource, configStatus: created.meetConfigStatus, cleanup: created.cleanup };
  if (created.meetSpaceName) {
    var space = MeetSpaceService.request('https://meet.googleapis.com/v2/' + created.meetSpaceName, 'get');
    var config = space.config || {};
    report.meetingUri = space.meetingUri;
    report.accessType = config.accessType;
    report.moderation = config.moderation;
    report.autoRecording = ((config.artifactConfig || {}).recordingConfig || {}).autoRecordingGeneration;
    report.members = MeetSpaceService.listMembers(created.meetSpaceName).map(function (member) { return member.email + ' (' + member.role + ')'; });
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// The system account becomes the owner (OWNER_EMAIL). Bookings made before the move stay in the
// previous owner's calendar, which is remembered as LEGACY_CALENDAR_ID so they can still be
// cancelled or edited (that calendar must be shared with the system account).
function adoptSystemAccountAsOwner() {
  var props = PropertiesService.getScriptProperties();
  var systemAccount = SystemAccountService.configured();
  if (!systemAccount) throw new Error('No system account is activated.');
  var previous = String(props.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (previous && previous !== systemAccount && !props.getProperty('LEGACY_CALENDAR_ID')) props.setProperty('LEGACY_CALENDAR_ID', previous);
  props.setProperty('OWNER_EMAIL', systemAccount);
  var report = { ownerEmail: systemAccount, legacyCalendarId: props.getProperty('LEGACY_CALENDAR_ID') || '' };
  console.log(JSON.stringify(report));
  return report;
}

// Re-applies the office meeting policy after it changed (for example the co-host limit), without
// re-running the whole activation.
function applyLatestMeetingPolicy() {
  var policy = SettingsService.applyMeetingPolicy();
  console.log(JSON.stringify(policy));
  return policy;
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
  return AdminAuthService.createAdmin(username || 'info@dentcos.com', temporaryPassword);
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
    Utils.safeRun('departments', function () {
      var departments = DepartmentService.summary();
      if (!departments.departments.length) throw new Error('No departments: the asset staff list is unreadable and no department was added.');
      return departments;
    }),
    Utils.safeRun('systemAccount', function () {
      var account = SystemAccountService.status();
      if (!account.matches) {
        throw new Error('The web app runs as ' + account.runningAs + ' but the system account is ' + account.systemAccount + ' — deploy with ' + account.systemAccount + '.');
      }
      return account;
    }),
    Utils.safeRun('assetStaffDirectory', function () {
      var directory = AssetDirectory.status();
      if (!directory.ok) throw new Error('Cannot read Tsmile Asset staff: ' + directory.error);
      return directory;
    }),
    Utils.safeRun('calendarAccess', function () { return CalendarService.testAccess(); }),
    Utils.safeRun('legacyCalendarAccess', function () { return CalendarService.legacyAccessReport(DatabaseService.listObjects('bookings')); }),
    Utils.safeRun('calendarMeetCreation', function () { return CalendarService.testMeetCreation(); }),
    Utils.safeRun('meetRecordingSync', function () { return MeetRecordingService.status(); }),
    Utils.safeRun('recordingsFolder', function () {
      var folder = MeetRecordingService.folderStatus();
      if (folder.configured && !folder.accessible) throw new Error(folder.error);
      return folder;
    }),
    Utils.safeRun('meetAutoEndStatus', function () { return MeetAutoEndService.status(); }),
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
