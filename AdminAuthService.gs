var AdminAuthService = (function () {
  function login(username, password) {
    ValidationService.requireFields({ username: username, password: password }, ['username', 'password']);
    var admin = DatabaseService.findByKey('admins', 'username', username) || DatabaseService.findByKey('admins', 'email', username);
    if (!admin || String(admin.active) !== 'true') throw new Error('Invalid admin login');
    if (hashPassword(password, admin.salt) !== admin.passwordHash) throw new Error('Invalid admin login');
    var token = Utils.uuid() + Utils.uuid();
    var now = new Date();
    var expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    DatabaseService.appendObject('admin_sessions', {
      sessionId: Utils.uuid(),
      username: admin.username,
      tokenHash: Utils.sha256(token),
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      active: 'true'
    });
    AuditLogService.log(admin.username, 'ADMIN_LOGIN', 'admin', admin.username, {});
    return { sessionToken: token, username: admin.username, role: admin.role, expiresAt: expires.toISOString() };
  }

  function requireSession(token) {
    if (!token) throw new Error('Admin session token is required');
    var tokenHash = Utils.sha256(token);
    var session = DatabaseService.listObjects('admin_sessions').filter(function (item) {
      return item.tokenHash === tokenHash && String(item.active) === 'true' && new Date(item.expiresAt) > new Date();
    })[0];
    if (!session) throw new Error('Admin session expired or invalid');
    return session;
  }

  function hashPassword(password, salt) {
    return Utils.sha256(String(password) + ':' + String(salt));
  }

  function createAdmin(username, temporaryPassword) {
    if (!temporaryPassword) throw new Error('Temporary password is required and must not be committed to source code');
    var now = Utils.nowIso();
    var salt = Utilities.getUuid();
    var admin = {
      username: username,
      email: username,
      passwordHash: hashPassword(temporaryPassword, salt),
      salt: salt,
      role: 'SUPER_ADMIN',
      active: 'true',
      mustChangePassword: 'true',
      createdAt: now,
      updatedAt: now
    };
    DatabaseService.upsertByKey('admins', 'username', username, admin);
    AuditLogService.log('SYSTEM', 'ADMIN_CREATED', 'admin', username, { role: 'SUPER_ADMIN' });
    return { username: username, role: 'SUPER_ADMIN', mustChangePassword: true };
  }

  return {
    login: login,
    requireSession: requireSession,
    hashPassword: hashPassword,
    createAdmin: createAdmin
  };
})();
