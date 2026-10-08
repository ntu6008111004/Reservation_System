// Staff directory of the Tsmile Asset system, read live on every lookup so people
// added there can sign in here right away (one-way: asset system -> reservation system).
var AssetDirectory = (function () {
  var DEFAULT_SPREADSHEET_ID = '14jJNugDujh7W_Z4CZ03QscnAc4s6GH0oz9zyZ2Er9S4';

  function spreadsheetId() {
    return PropertiesService.getScriptProperties().getProperty('ASSET_SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  }

  // Columns are matched by header name so new columns in the asset system do not break the lookup.
  function readTable(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2 || !sheet.getLastColumn()) return [];
    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var headers = values[0].map(function (header) { return String(header).trim(); });
    return values.slice(1).map(function (row) {
      var object = {};
      headers.forEach(function (header, index) { if (header) object[header] = row[index]; });
      return object;
    }).filter(function (row) { return !SettingsService.toBoolean(row.IsDemo, false); });
  }

  function load() {
    var ss = SpreadsheetApp.openById(spreadsheetId());
    return { staff: readTable(ss, 'AssetStaff'), accounts: readTable(ss, 'AssetAccounts') };
  }

  function tryLoad() {
    try {
      return load();
    } catch (error) {
      console.warn('Asset directory unavailable: ' + error.message);
      return null;
    }
  }

  function text(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  function profile(row) {
    return {
      id: text(row.ID),
      fullName: text(row.FullName),
      nickName: text(row.NickName),
      department: text(row.Department),
      email: text(row.Email).toLowerCase()
    };
  }

  // Same sources as the asset system's own phone login: main phone, alternate phone,
  // and phones linked to the person's accounts (branch phones are not a person).
  function findByPhone(key) {
    if (!key) return null;
    var directory = tryLoad();
    if (!directory) return null;
    var staff = directory.staff.filter(function (row) { return text(row.ID) && text(row.FullName); });
    var match = staff.filter(function (row) {
      return MemberService.phoneKey(row.Phone) === key || MemberService.phoneKey(row.AltPhone) === key;
    })[0];
    if (!match) {
      var account = directory.accounts.filter(function (row) {
        return text(row.OwnerType) === 'Staff' && MemberService.phoneKey(row.LinkedPhone) === key;
      })[0];
      if (account) match = staff.filter(function (row) { return text(row.ID) === text(account.OwnerID); })[0];
    }
    return match ? profile(match) : null;
  }

  function departments() {
    var directory = tryLoad();
    if (!directory) return [];
    var seen = {};
    return directory.staff.map(function (row) { return text(row.Department); }).filter(function (department) {
      if (!department || seen[department]) return false;
      seen[department] = true;
      return true;
    });
  }

  function status() {
    try {
      return { ok: true, spreadsheetId: spreadsheetId(), staffCount: load().staff.length };
    } catch (error) {
      return { ok: false, spreadsheetId: spreadsheetId(), error: error.message };
    }
  }

  return {
    spreadsheetId: spreadsheetId,
    findByPhone: findByPhone,
    departments: departments,
    status: status
  };
})();
