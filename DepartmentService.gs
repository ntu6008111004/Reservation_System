// Departments a booking belongs to: the staff departments of the asset system (read live and
// cached for 10 minutes, so new departments appear by themselves) followed by the ones admins add
// for groups the asset system does not have, such as the executives. Meeting recordings are filed
// into one folder per department.
var DepartmentService = (function () {
  var CACHE_KEY = 'departments:list';
  var CACHE_SECONDS = 600;
  var EXTRA_KEY = 'extra_departments';
  var DEFAULT_EXTRAS = '["ผู้บริหาร"]';
  var UNASSIGNED_FOLDER = 'ไม่ระบุฝ่าย';
  var MAX_LENGTH = 60;

  function clean(name) {
    return String(name === undefined || name === null ? '' : name).replace(/\s+/g, ' ').trim();
  }

  function unique(names) {
    var seen = {};
    return names.filter(function (name) {
      var key = name.toLowerCase();
      if (!name || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function extras() {
    try {
      var list = JSON.parse(SettingsService.get(EXTRA_KEY, DEFAULT_EXTRAS));
      return Array.isArray(list) ? unique(list.map(clean)) : [];
    } catch (error) {
      return [];
    }
  }

  function assetDepartments() {
    return unique(AssetDirectory.departments().map(clean));
  }

  function names() {
    var cached = CacheLayer.get(CACHE_KEY);
    if (cached) return cached;
    var fromAsset = assetDepartments();
    var merged = unique(fromAsset.concat(extras()));
    // An unreadable asset sheet must not hide its departments for the next 10 minutes.
    if (fromAsset.length) CacheLayer.put(CACHE_KEY, merged, CACHE_SECONDS);
    return merged;
  }

  // "บัญชี" → "ฝ่ายบัญชี", "Sales" → "ฝ่าย Sales"; also the name of the department's recordings folder.
  function label(name) {
    var text = clean(name);
    if (!text) return UNASSIGNED_FOLDER;
    if (text.indexOf('ฝ่าย') === 0) return text;
    return 'ฝ่าย' + (/^[A-Za-z0-9]/.test(text) ? ' ' : '') + text;
  }

  function list() {
    return names().map(function (name) { return { name: name, label: label(name) }; });
  }

  function find(name) {
    var key = clean(name).toLowerCase();
    if (!key) return '';
    return names().filter(function (known) { return known.toLowerCase() === key; })[0] || '';
  }

  function requireKnown(name) {
    var found = find(name);
    if (!found) throw new Error('กรุณาเลือกฝ่ายจากรายการ');
    return found;
  }

  function invalidate() {
    CacheLayer.remove(CACHE_KEY);
  }

  function saveExtras(list) {
    SettingsService.set(EXTRA_KEY, JSON.stringify(list));
    invalidate();
  }

  function summary() {
    return { departments: list(), assetDepartments: assetDepartments(), extras: extras() };
  }

  function add(name) {
    var text = clean(name);
    if (!text) throw new Error('กรุณากรอกชื่อฝ่าย');
    if (text.length > MAX_LENGTH) throw new Error('ชื่อฝ่ายยาวเกิน ' + MAX_LENGTH + ' ตัวอักษร');
    if (/[\\/:*?"<>|]/.test(text)) throw new Error('ชื่อฝ่ายห้ามมีเครื่องหมาย \\ / : * ? " < > |');
    invalidate();
    if (find(text)) throw new Error('มีฝ่ายนี้อยู่แล้ว');
    saveExtras(extras().concat([text]));
    return summary();
  }

  // Asset departments come from the asset system and cannot be removed here; bookings that already
  // use a removed department keep its name (and its recordings folder).
  function remove(name) {
    var key = clean(name).toLowerCase();
    var current = extras();
    var kept = current.filter(function (extra) { return extra.toLowerCase() !== key; });
    if (kept.length === current.length) throw new Error('ลบได้เฉพาะฝ่ายที่ผู้ดูแลเพิ่มเอง');
    saveExtras(kept);
    return summary();
  }

  return {
    UNASSIGNED_FOLDER: UNASSIGNED_FOLDER,
    clean: clean,
    label: label,
    list: list,
    find: find,
    requireKnown: requireKnown,
    extras: extras,
    summary: summary,
    add: add,
    remove: remove,
    invalidate: invalidate
  };
})();
