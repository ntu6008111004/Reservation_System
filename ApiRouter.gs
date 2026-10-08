// Booking identity comes from the server session, never from the submitted form:
// a signed-in staff member books as themself, an admin may book on someone's behalf.
function bookingRequestFor_(data) {
  var input = {};
  Object.keys(data).forEach(function (key) {
    if (['memberToken', 'sessionToken', 'memberId', 'requesterPhone', 'createdBy'].indexOf(key) === -1) input[key] = data[key];
  });
  if (data.memberToken) {
    var member = MemberService.requireSession(data.memberToken);
    input.memberId = member.id;
    input.requesterName = member.nickName ? member.fullName + ' (' + member.nickName + ')' : member.fullName;
    input.requesterPhone = member.phone;
    input.requesterEmail = input.requesterEmail || member.email;
    // Not chosen → the department last booked for, else the one on file (asset system or registration).
    input.department = input.department || member.lastDepartment || member.department;
    input.createdBy = MemberService.actorLabel(member);
    return input;
  }
  if (data.sessionToken) {
    input.createdBy = 'admin:' + AdminAuthService.requireSession(data.sessionToken).username;
    return input;
  }
  throw new Error('กรุณาเข้าสู่ระบบด้วยเบอร์มือถือก่อนจองห้อง');
}

function routeApi(action, data) {
  try {
    data = data || {};
    switch (action) {
      case 'bootstrap':
        return ResponseService.success({
          settings: SettingsService.publicSettings(),
          rooms: DatabaseService.listObjects('rooms').filter(function (room) { return String(room.active) !== 'false'; })
        });
      case 'health':
        // Which Google account the deployment runs as — the organizer named in every invitation.
        return ResponseService.success({
          runningAs: SystemAccountService.current(),
          systemAccount: SystemAccountService.configured()
        });
      case 'createBooking':
        return ResponseService.success(BookingService.createBooking(bookingRequestFor_(data)));
      case 'memberLogin':
        return ResponseService.success(MemberService.login(data.phone, data.remember));
      case 'memberRegister':
        return ResponseService.success(MemberService.register(data, data.remember));
      case 'memberVerify':
        return ResponseService.success(MemberService.publicProfile(MemberService.requireSession(data.memberToken)));
      case 'memberLogout':
        return ResponseService.success(MemberService.logout(data.memberToken));
      case 'memberBookings':
        return ResponseService.success(BookingService.listForMember(MemberService.requireSession(data.memberToken)));
      case 'memberCancelBooking':
        return ResponseService.success(BookingService.cancelForMember(data.bookingId, MemberService.requireSession(data.memberToken)));
      case 'memberUpdateAttendees':
        return ResponseService.success(BookingService.updateAttendeesForMember(data.bookingId, data.attendeeEmails, MemberService.requireSession(data.memberToken)));
      case 'listBookings':
        // The public page only books; booking details (Meet links, emails) are for admins.
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(BookingService.listBookings({ status: 'CONFIRMED' }));
      case 'adminLogin':
        return ResponseService.success(AdminAuthService.login(data.username, data.password));
      case 'adminVerifySession':
        var validSession = AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success({ active: true, username: validSession.username });
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
        AuditLogService.log(roomSession.username, 'ROOM_STATUS_CHANGED', 'room', room.id, {
          roomName: room.name,
          roomType: room.type,
          active: room.active
        });
        return ResponseService.success(room);
      case 'adminAuditLogs':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(AuditLogService.listLatest(data.limit || 100));
      case 'adminFeatureSettings':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(SettingsService.adminFeatureSettings());
      case 'adminUpdateFeatureSettings':
        var featureSession = AdminAuthService.requireSession(data.sessionToken);
        SettingsService.set('email_notifications_enabled', data.emailNotificationsEnabled ? 'true' : 'false');
        SettingsService.set('meet_open_access_enabled', data.meetOpenAccessEnabled ? 'true' : 'false');
        SettingsService.set('meet_auto_recording_enabled', data.meetAutoRecordingEnabled ? 'true' : 'false');
        if (data.meetCoHostsEnabled !== undefined) SettingsService.set('meet_cohosts_enabled', data.meetCoHostsEnabled ? 'true' : 'false');
        if (data.meetRecordingsAdminOnly !== undefined) SettingsService.set('meet_recordings_admin_only', data.meetRecordingsAdminOnly ? 'true' : 'false');
        SettingsService.set('meet_auto_end_enabled', data.meetAutoEndEnabled ? 'true' : 'false');
        var minutes = Number(data.meetAutoEndMinutes);
        if (isNaN(minutes) || minutes < 1) minutes = 10;
        SettingsService.set('meet_auto_end_minutes', String(minutes));
        if (data.maxMeetingAttendees !== undefined) {
          SettingsService.set('max_meeting_attendees', String(SettingsService.normalizeMaxMeetingAttendees(data.maxMeetingAttendees)));
        }
        MeetAutoEndService.invalidatePlan();
        AuditLogService.log(featureSession.username, 'FEATURE_SETTINGS_UPDATED', 'settings', 'admin_features', SettingsService.adminFeatureSettings());
        return ResponseService.success(SettingsService.adminFeatureSettings());
      case 'adminDepartments':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(DepartmentService.summary());
      case 'adminAddDepartment':
        var addSession = AdminAuthService.requireSession(data.sessionToken);
        var added = DepartmentService.add(data.name);
        AuditLogService.log(addSession.username, 'DEPARTMENT_ADDED', 'settings', 'extra_departments', { name: DepartmentService.clean(data.name), extras: added.extras });
        return ResponseService.success(added);
      case 'adminRemoveDepartment':
        var removeSession = AdminAuthService.requireSession(data.sessionToken);
        var removed = DepartmentService.remove(data.name);
        AuditLogService.log(removeSession.username, 'DEPARTMENT_REMOVED', 'settings', 'extra_departments', { name: DepartmentService.clean(data.name), extras: removed.extras });
        return ResponseService.success(removed);
      case 'adminRecordingsFolder':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(MeetRecordingService.folderStatus());
      case 'adminSetRecordingsFolder':
        var folderSession = AdminAuthService.requireSession(data.sessionToken);
        var folder = MeetRecordingService.setFolder(data.folder);
        AuditLogService.log(folderSession.username, 'RECORDINGS_FOLDER_CHANGED', 'settings', 'meet_recordings_folder_id', folder);
        return ResponseService.success(Object.assign({ configured: true, accessible: true }, folder));
      case 'adminSyncMeetRecordings':
        var recordingSession = AdminAuthService.requireSession(data.sessionToken);
        var syncResult = MeetRecordingService.syncPendingRecordings();
        AuditLogService.log(recordingSession.username, 'MEET_RECORDINGS_SYNCED', 'recording', 'pending', syncResult);
        return ResponseService.success(syncResult);
      case 'adminMeetAutoEndStatus':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(MeetAutoEndService.status());
      case 'adminRunAutoEndCheck':
        var autoEndSession = AdminAuthService.requireSession(data.sessionToken);
        var autoEndResult = MeetAutoEndService.monitorActiveConferences();
        AuditLogService.log(autoEndSession.username, 'MEET_AUTO_END_CHECK_RUN', 'meet_auto_end', 'manual_check', autoEndResult);
        return ResponseService.success({
          result: autoEndResult,
          status: MeetAutoEndService.status()
        });
      case 'adminUpdateAttendees':
        var attendeeSession = AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(BookingService.updateAttendees(data.bookingId, data.attendeeEmails, attendeeSession.username));
      case 'adminConfigureMeetAccess':
        var meetSession = AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(BookingService.configureMeetAccess(data.bookingId, meetSession.username));
      case 'adminMeetAuthorizationDiagnostics':
        AdminAuthService.requireSession(data.sessionToken);
        return ResponseService.success(MeetSpaceService.authorizationDiagnostics());
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
