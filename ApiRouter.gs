function routeApi(action, data) {
  try {
    switch (action) {
      case 'bootstrap':
        return ResponseService.success({
          settings: SettingsService.publicSettings(),
          rooms: DatabaseService.listObjects('rooms').filter(function (room) { return String(room.active) !== 'false'; })
        });
      case 'createBooking':
        return ResponseService.success(BookingService.createBooking(data));
      case 'listBookings':
        return ResponseService.success(BookingService.listBookings(data));
      case 'adminLogin':
        return ResponseService.success(AdminAuthService.login(data.username, data.password));
      case 'adminDashboard':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(UsageAnalyticsService.dashboard());
      case 'adminBookings':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(BookingService.listBookings(data.filter || {}));
      case 'adminCancelBooking':
        var cancelSession = AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(BookingService.cancelBooking(data.bookingId, cancelSession.username));
      case 'adminRooms':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(DatabaseService.listObjects('rooms'));
      case 'adminToggleRoom':
        var roomSession = AdminAuthService.requireSession(data.sessionToken);
        var room = DatabaseService.findByKey('rooms', 'id', data.roomId);
        if (!room) throw new Error('Room not found');
        room.active = String(data.active) === 'true' || data.active === true ? 'true' : 'false';
        DatabaseService.upsertByKey('rooms', 'id', room.id, room);
        AuditLogService.log(roomSession.username, 'ROOM_STATUS_CHANGED', 'room', room.id, { active: room.active });
        return ResponseService.success(room);
      case 'adminAuditLogs':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(AuditLogService.listLatest(data.limit || 100));
      case 'diagnostics':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(runSystemDiagnostics());
      default:
        throw new Error('Unknown API action: ' + action);
    }
  } catch (error) {
    AuditLogService.log('SYSTEM', 'API_ERROR', 'api', action || 'unknown', { message: error.message });
    return ResponseService.error(error);
  }
}
