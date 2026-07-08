var AuditLogService = (function () {
  function log(actor, action, entityType, entityId, details) {
    try {
      DatabaseService.appendObject('audit_logs', {
        id: Utils.uuid(),
        timestamp: Utils.nowIso(),
        actor: actor || 'SYSTEM',
        action: action,
        entityType: entityType,
        entityId: entityId,
        details: JSON.stringify(details || {})
      });
    } catch (error) {
      console.error('Audit log failed: ' + error.message);
    }
  }

  return { log: log };
})();
