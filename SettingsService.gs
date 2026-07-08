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

  function publicSettings() {
    return {
      ownerEmail: PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || 'tsmile.it.official@gmail.com',
      timezone: PropertiesService.getScriptProperties().getProperty('APP_TIMEZONE') || 'Asia/Bangkok',
      accessMode: 'Anyone with the link'
    };
  }

  return {
    get: get,
    setDefault: setDefault,
    publicSettings: publicSettings
  };
})();
