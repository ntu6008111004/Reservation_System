// Staff sign-in with a mobile number only (same as the Tsmile Asset staff portal, by the owner's choice):
// known numbers sign in at once, unknown numbers register once.
var MemberService = (function () {
  var REMEMBER_DAYS = 30;
  var SESSION_HOURS = 12;
  var LOGIN_REQUIRED = 'กรุณาเข้าสู่ระบบด้วยเบอร์มือถืออีกครั้ง';

  function phoneKey(value) {
    var digits = String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
    if (digits.length > 9) digits = digits.replace(/^66/, '');
    return digits.replace(/^0+/, '');
  }

  // Stored with dashes so Google Sheets keeps it as text (a plain 0812345678 loses its leading zero).
  function formatPhone(key) {
    var digits = '0' + key;
    if (key.length === 9) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    if (key.length === 8) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
    return String(key);
  }

  function requirePhone(phone) {
    var key = phoneKey(phone);
    if (key.length < 8) throw new Error('กรุณากรอกเบอร์มือถือให้ถูกต้อง');
    return key;
  }

  function clean(value, maxLength) {
    return String(value === undefined || value === null ? '' : value).trim().slice(0, maxLength);
  }

  function publicProfile(member) {
    return {
      id: member.id,
      fullName: member.fullName,
      nickName: member.nickName || '',
      department: member.department || '',
      lastDepartment: member.lastDepartment || '',
      email: member.email || '',
      phone: member.phone,
      source: member.source
    };
  }

  // The department a staff member last booked for becomes the default of their next booking.
  function rememberDepartment(memberId, department) {
    var member = memberId && DatabaseService.findByKey('members', 'id', memberId);
    if (!member || !department || member.lastDepartment === department) return false;
    DatabaseService.upsertByKey('members', 'id', member.id, { id: member.id, lastDepartment: department, updatedAt: Utils.nowIso() });
    return true;
  }

  function actorLabel(member) {
    return member.fullName + ' (' + member.phone + ')';
  }

  function findMember(key, asset) {
    var members = DatabaseService.listObjects('members');
    var byAsset = asset ? members.filter(function (item) { return String(item.assetStaffId) === asset.id; })[0] : null;
    return byAsset || members.filter(function (item) { return String(item.phoneKey) === key; })[0] || null;
  }

  function saveMember(existing, fields) {
    var now = Utils.nowIso();
    var member = {};
    [existing || {}, fields].forEach(function (source) {
      Object.keys(source).forEach(function (key) { member[key] = source[key]; });
    });
    member.id = existing ? existing.id : 'MBR-' + Utils.uuid();
    member.active = existing ? existing.active : 'true';
    member.createdAt = existing ? existing.createdAt : now;
    member.updatedAt = now;
    member.lastLoginAt = now;
    DatabaseService.upsertByKey('members', 'id', member.id, member);
    return member;
  }

  function startSession(member, remember, auditAction) {
    var token = Utils.uuid().replace(/-/g, '') + Utils.uuid().replace(/-/g, '');
    var now = new Date();
    var lifetime = remember === false ? SESSION_HOURS * 3600000 : REMEMBER_DAYS * 86400000;
    var expires = new Date(now.getTime() + lifetime);
    DatabaseService.appendObject('member_sessions', {
      sessionId: Utils.uuid(),
      memberId: member.id,
      tokenHash: Utils.sha256(token),
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      active: 'true'
    });
    AuditLogService.log(actorLabel(member), auditAction, 'member', member.id, { source: member.source });
    return { status: 'ok', token: token, expiresAt: expires.toISOString(), member: publicProfile(member) };
  }

  function withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  // Signs in a known number; the asset system is re-read every time so its latest data wins.
  function signInKnown(key, remember) {
    var asset = AssetDirectory.findByPhone(key);
    var member = findMember(key, asset);
    if (member && String(member.active) === 'false') throw new Error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    if (asset) {
      member = saveMember(member, {
        phone: formatPhone(key),
        phoneKey: key,
        fullName: asset.fullName,
        nickName: asset.nickName,
        department: asset.department,
        email: asset.email,
        source: 'asset',
        assetStaffId: asset.id
      });
    } else if (member) {
      member = saveMember(member, {});
    }
    return member ? startSession(member, remember, 'MEMBER_LOGIN') : null;
  }

  function login(phone, remember) {
    var key = requirePhone(phone);
    return withLock(function () {
      return signInKnown(key, remember) || {
        status: 'register',
        phone: formatPhone(key),
        departments: DepartmentService.list().map(function (item) { return item.name; })
      };
    });
  }

  function register(input, remember) {
    input = input || {};
    var key = requirePhone(input.phone);
    var fullName = clean(input.fullName, 150);
    if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');
    var email = clean(input.email, 150).toLowerCase();
    if (email && !ValidationService.isEmail(email)) throw new Error('อีเมลไม่ถูกต้อง');
    return withLock(function () {
      var known = signInKnown(key, remember);
      if (known) return known;
      var member = saveMember(null, {
        phone: formatPhone(key),
        phoneKey: key,
        fullName: fullName,
        nickName: clean(input.nickName, 80),
        department: clean(input.department, 120),
        email: email,
        source: 'self-register',
        assetStaffId: ''
      });
      return startSession(member, remember, 'MEMBER_REGISTERED');
    });
  }

  function findSession(token) {
    if (!token) return null;
    var tokenHash = Utils.sha256(token);
    return DatabaseService.listObjects('member_sessions').filter(function (item) {
      return item.tokenHash === tokenHash && String(item.active) === 'true' && new Date(item.expiresAt) > new Date();
    })[0] || null;
  }

  function requireSession(token) {
    var session = findSession(token);
    var member = session ? DatabaseService.findByKey('members', 'id', session.memberId) : null;
    if (!member || String(member.active) === 'false') throw new Error(LOGIN_REQUIRED);
    return member;
  }

  function logout(token) {
    var session = findSession(token);
    if (!session) return { loggedOut: false };
    session.active = 'false';
    DatabaseService.upsertByKey('member_sessions', 'tokenHash', session.tokenHash, session);
    return { loggedOut: true };
  }

  return {
    phoneKey: phoneKey,
    formatPhone: formatPhone,
    publicProfile: publicProfile,
    rememberDepartment: rememberDepartment,
    actorLabel: actorLabel,
    login: login,
    register: register,
    requireSession: requireSession,
    logout: logout
  };
})();
