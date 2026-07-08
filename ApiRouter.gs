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
