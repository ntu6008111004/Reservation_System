var SettingsService = (function () {
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
        value: value,
        description: description || '',
        updatedAt: Utils.nowIso()
      });
    }
  }

  function set(key, value, description) {
    DatabaseService.upsertByKey('settings', 'key', key, {
      key: key,
      value: String(value),
      description: description || '',
      updatedAt: Utils.nowIso()
    });
    return get(key, '');
  }

  function adminFeatureSettings() {
    return {
      emailNotificationsEnabled: getBoolean('email_notifications_enabled', false),
      calendarInviteRequesterEnabled: getBoolean('calendar_invite_requester_enabled', false),
      meetOpenAccessEnabled: getBoolean('meet_open_access_enabled', true),
      meetAutoRecordingEnabled: getBoolean('meet_auto_recording_enabled', true)
    };
  }

  function publicSettings() {
    return {
      ownerEmail: PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || 'tsmile.it.official@gmail.com',
      timezone: PropertiesService.getScriptProperties().getProperty('APP_TIMEZONE') || 'Asia/Bangkok',
      accessMode: 'Anyone with the link'
    };
  }

  return {
    get: get,
    getBoolean: getBoolean,
    toBoolean: toBoolean,
    set: set,
    setDefault: setDefault,
    adminFeatureSettings: adminFeatureSettings,
    publicSettings: publicSettings
  };
})();
