var SettingsService = (function () {
  function get(key, fallback) {
    var row = DatabaseService.findByKey('settings', 'key', key);
    return row ? row.value : fallback;
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
      emailNotificationsEnabled: get('email_notifications_enabled', 'false') === 'true',
      calendarInviteRequesterEnabled: get('calendar_invite_requester_enabled', 'false') === 'true'
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
    set: set,
    setDefault: setDefault,
    adminFeatureSettings: adminFeatureSettings,
    publicSettings: publicSettings
  };
})();
