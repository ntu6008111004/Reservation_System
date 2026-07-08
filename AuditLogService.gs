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

  function listLatest(limit) {
    return DatabaseService.listObjects('audit_logs')
      .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })
      .slice(0, Math.min(Number(limit) || 100, 300));
  }

  return {
    log: log,
    listLatest: listLatest
  };
})();
