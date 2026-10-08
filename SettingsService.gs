var SettingsService = (function () {
  // The emails typed in a booking are its co-hosts; everyone else joins with the Meet link. Google
  // allows 25 co-hosts per meeting and the requester is one of them, so up to 24 emails.
  var DEFAULT_MAX_MEETING_ATTENDEES = 24;
  var MAX_MEETING_ATTENDEES_LIMIT = 24;
  var DEFAULT_AUTO_END_MINUTES = 10;
  var MEETING_POLICY_VERSION = '4';
  var DESCRIPTIONS = {
    email_notifications_enabled: 'Keep email notifications disabled until users are ready.',
    max_meeting_attendees: 'Maximum co-host emails per online booking, 1-24 (the requester is always a co-host in addition; other participants join with the Meet link).',
    meet_open_access_enabled: 'Online meetings allow anyone with the Meet link to join without knocking.',
    meet_auto_recording_enabled: 'Automatically record an online meeting when Google Workspace permits recording.',
    meet_cohosts_enabled: 'The requester and the co-host emails of the booking become Google Meet co-hosts (they can record and manage the meeting).',
    meet_recordings_folder_id: 'Drive folder ID used for renamed Google Meet recordings.',
    meet_recordings_admin_only: 'Only the admins keep access to Google Meet recordings; when off, the requester and co-hosts of the booking can edit and share them.',
    extra_departments: 'Departments admins added (JSON list) on top of the staff departments of the asset system.',
    meet_auto_end_enabled: 'Automatically end online meeting when 1 participant remains for the specified duration.',
    meet_auto_end_minutes: 'Minutes to wait before auto ending an online meeting when 1 participant remains.'
  };

  function get(key, fallback) {
    var row = DatabaseService.findByKey('settings', 'key', key);
    return row ? row.value : fallback;
  }

  function toBoolean(value, fallback) {
    if (value === true || value === false) return value;
    var normalized = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    return !!fallback;
  }

  function getBoolean(key, fallback) {
    return toBoolean(get(key, fallback), fallback);
  }

  function setDefault(key, value, description) {
    if (!DatabaseService.findByKey('settings', 'key', key)) {
      DatabaseService.appendObject('settings', {
        key: key,
        value: String(value),
        description: description || DESCRIPTIONS[key] || '',
        updatedAt: Utils.nowIso()
      });
    }
  }

  function set(key, value, description) {
    DatabaseService.upsertByKey('settings', 'key', key, {
      key: key,
      value: String(value),
      description: description || DESCRIPTIONS[key] || '',
      updatedAt: Utils.nowIso()
    });
    return get(key, '');
  }

  function autoEndMinutes() {
    var minutes = Number(get('meet_auto_end_minutes', DEFAULT_AUTO_END_MINUTES));
    return isNaN(minutes) || minutes < 1 ? DEFAULT_AUTO_END_MINUTES : minutes;
  }

  // Office policy for meetings owned by the Google Workspace account (revised 2026-10-08): the
  // requester and at least 1 (up to 24) co-host emails co-host, everyone else joins with the link, every online
  // meeting is recorded, a meeting left with one person for 10 minutes is ended (which also stops
  // the recording) and the co-hosts can edit and share the recordings. Applied once, so later
  // changes made in the admin page are kept.
  function applyMeetingPolicy() {
    var applied = DatabaseService.findByKey('system_meta', 'key', 'meeting_policy_version');
    if (applied && String(applied.value) === MEETING_POLICY_VERSION) {
      return { applied: false, version: MEETING_POLICY_VERSION, settings: adminFeatureSettings() };
    }
    set('meet_open_access_enabled', 'true');
    set('meet_auto_recording_enabled', 'true');
    set('meet_cohosts_enabled', 'true');
    set('meet_auto_end_enabled', 'true');
    set('meet_auto_end_minutes', String(DEFAULT_AUTO_END_MINUTES));
    set('meet_recordings_admin_only', 'false');
    set('max_meeting_attendees', String(DEFAULT_MAX_MEETING_ATTENDEES));
    DatabaseService.upsertByKey('system_meta', 'key', 'meeting_policy_version', {
      key: 'meeting_policy_version',
      value: MEETING_POLICY_VERSION,
      updatedAt: Utils.nowIso()
    });
    return { applied: true, version: MEETING_POLICY_VERSION, settings: adminFeatureSettings() };
  }

  function normalizeMaxMeetingAttendees(value) {
    var number = Math.floor(Number(value));
    if (!(number >= 1)) return DEFAULT_MAX_MEETING_ATTENDEES;
    return Math.min(number, MAX_MEETING_ATTENDEES_LIMIT);
  }

  function maxMeetingAttendees() {
    return normalizeMaxMeetingAttendees(get('max_meeting_attendees', DEFAULT_MAX_MEETING_ATTENDEES));
  }

  // The account that owns the system and organizes the meetings: the activated system account
  // (info@dentcos.com), or OWNER_EMAIL while none is activated.
  function ownerEmail() {
    return SystemAccountService.configured() || PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || 'info@dentcos.com';
  }

  function adminFeatureSettings() {
    return {
      emailNotificationsEnabled: getBoolean('email_notifications_enabled', false),
      meetOpenAccessEnabled: getBoolean('meet_open_access_enabled', true),
      meetAutoRecordingEnabled: getBoolean('meet_auto_recording_enabled', true),
      meetCoHostsEnabled: getBoolean('meet_cohosts_enabled', true),
      meetAutoEndEnabled: getBoolean('meet_auto_end_enabled', true),
      meetAutoEndMinutes: autoEndMinutes(),
      meetRecordingsAdminOnly: getBoolean('meet_recordings_admin_only', true),
      maxMeetingAttendees: maxMeetingAttendees()
    };
  }

  function publicSettings() {
    return {
      ownerEmail: ownerEmail(),
      timezone: PropertiesService.getScriptProperties().getProperty('APP_TIMEZONE') || 'Asia/Bangkok',
      accessMode: 'Anyone with the link',
      maxMeetingAttendees: maxMeetingAttendees(),
      departments: DepartmentService.list()
    };
  }

  return {
    DESCRIPTIONS: DESCRIPTIONS,
    get: get,
    getBoolean: getBoolean,
    toBoolean: toBoolean,
    set: set,
    setDefault: setDefault,
    normalizeMaxMeetingAttendees: normalizeMaxMeetingAttendees,
    maxMeetingAttendees: maxMeetingAttendees,
    autoEndMinutes: autoEndMinutes,
    applyMeetingPolicy: applyMeetingPolicy,
    ownerEmail: ownerEmail,
    adminFeatureSettings: adminFeatureSettings,
    publicSettings: publicSettings
  };
})();
