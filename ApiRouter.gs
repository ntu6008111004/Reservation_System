function routeApi(action, data) {
  try {
    data = data || {};
    switch (action) {
      case 'bootstrap':
        return ResponseService.success({
          settings: SettingsService.publicSettings(),
          rooms: DatabaseService.listObjects('rooms').filter(function (room) { return String(room.active) !== 'false'; })
        });
      case 'createBooking':
        return ResponseService.success(BookingService.createBooking(data));
      case 'listBookings':
        return ResponseService.success(BookingService.listBookings({ status: 'CONFIRMED' }));
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
      case 'adminFeatureSettings':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(SettingsService.adminFeatureSettings());
      case 'adminUpdateFeatureSettings':
        var featureSession = AdminAuthService.requireSession(data.sessionToken);
        SettingsService.set('email_notifications_enabled', data.emailNotificationsEnabled ? 'true' : 'false', 'Keep email notifications disabled until users are ready.');
        SettingsService.set('calendar_invite_requester_enabled', data.calendarInviteRequesterEnabled ? 'true' : 'false', 'Invite requester email to Calendar/Meet only when admins enable it.');
        SettingsService.set('meet_open_access_enabled', data.meetOpenAccessEnabled ? 'true' : 'false', 'Online meetings allow anyone with the Meet link to join without knocking.');
        SettingsService.set('meet_auto_recording_enabled', data.meetAutoRecordingEnabled ? 'true' : 'false', 'Automatically record an online meeting when Google Workspace permits recording.');
        AuditLogService.log(featureSession.username, 'FEATURE_SETTINGS_UPDATED', 'settings', 'admin_features', SettingsService.adminFeatureSettings());
        return ResponseService.success(SettingsService.adminFeatureSettings());
      case 'adminSyncMeetRecordings':
        var recordingSession = AdminAuthService.requireSession(data.sessionToken);
        var syncResult = MeetRecordingService.syncPendingRecordings();
        AuditLogService.log(recordingSession.username, 'MEET_RECORDINGS_SYNCED', 'recording', 'pending', syncResult);
        return ResponseService.success(syncResult);
      case 'adminClearBookingData':
        var clearSession = AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(clearBookingDataForTesting(clearSession.username));
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
