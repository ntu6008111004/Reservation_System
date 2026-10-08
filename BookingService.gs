var BookingService = (function () {
  function createBooking(input) {
    ValidationService.requireFields(input, ['roomId', 'title', 'requesterName', 'startTime', 'endTime', 'meetingType']);
    input.requesterEmail = String(input.requesterEmail || '').trim();
    if (input.requesterEmail && !ValidationService.isEmail(input.requesterEmail)) throw new Error('อีเมลผู้จองไม่ถูกต้อง');
    // Every booking belongs to a department; its meeting recordings are filed in that department's folder.
    input.department = DepartmentService.requireKnown(input.department);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var room = DatabaseService.findByKey('rooms', 'id', input.roomId);
      if (!room || String(room.active) === 'false') throw new Error('Selected room is not available');
      var meetingType = String(input.meetingType).toUpperCase();
      var roomType = String(room.type || '').toUpperCase();
      if (meetingType === 'ONLINE' && roomType !== 'ONLINE') throw new Error('Online meeting must use an online resource');
      if (meetingType === 'ONSITE' && roomType !== 'ONSITE') throw new Error('Onsite meeting must use a physical room');
      if (meetingType === 'OFFSITE' && roomType !== 'OFFSITE') throw new Error('Offsite meeting must use an offsite resource');
      var gpsUrl = meetingType === 'OFFSITE' ? String(input.gpsUrl || '').trim() : '';
      if (gpsUrl && !/^https?:\/\/[^\s"'<>]+$/i.test(gpsUrl)) throw new Error('ลิงก์ GPS ต้องขึ้นต้นด้วย http:// หรือ https:// และห้ามมีช่องว่างหรือเครื่องหมายคำพูด');
      var start = new Date(input.startTime);
      var end = new Date(input.endTime);
      ValidationService.validateBookingWindow(start, end);
      // Online meetings get their own Meet link and offsite meetings happen at different places,
      // so only physical (and any other) rooms are exclusive per time slot.
      var sharedResource = roomType === 'ONLINE' || roomType === 'OFFSITE';
      if (!sharedResource && BookingIndexService.hasConflict(input.roomId, start, end)) throw new Error('ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น');
      var attendeeEmails = meetingType === 'ONLINE' ? AttendeeService.forBooking(AttendeeService.requireOne(input.attendeeEmails), input.requesterEmail) : [];

      var now = Utils.nowIso();
      var id = Utils.uuid();
      var calendarResult = {};
      if (meetingType === 'ONLINE') {
        calendarResult = CalendarService.createOnlineMeeting({
          id: id,
          title: input.title,
          requesterEmail: input.requesterEmail,
          attendeeEmails: attendeeEmails,
          startTime: start,
          endTime: end,
          notes: input.notes || ''
        });
      }

      var booking = {
        id: id,
        createdAt: now,
        updatedAt: now,
        status: 'CONFIRMED',
        roomId: input.roomId,
        roomName: room.name,
        title: input.title,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        meetingType: meetingType,
        meetUrl: calendarResult.meetUrl || '',
        calendarEventId: calendarResult.eventId || '',
        meetCode: calendarResult.meetCode || '',
        meetSpaceName: calendarResult.meetSpaceName || '',
        meetConfigStatus: calendarResult.meetConfigStatus || '',
        recordingFileId: '',
        recordingUrl: '',
        recordingSyncedAt: '',
        gpsUrl: gpsUrl,
        notes: input.notes || '',
        createdBy: input.createdBy || input.requesterEmail || input.requesterName,
        approvedBy: '',
        cancelledAt: '',
        attendeeEmails: AttendeeService.serialize(attendeeEmails),
        memberId: input.memberId || '',
        requesterPhone: input.requesterPhone || '',
        calendarId: calendarResult.calendarId || '',
        meetSource: calendarResult.meetSource || '',
        department: input.department
      };
      DatabaseService.appendObject('bookings', booking);
      BookingIndexService.add(booking);
      if (booking.memberId) Utils.safeRun('rememberDepartment', function () { return MemberService.rememberDepartment(booking.memberId, booking.department); });
      if (meetingType === 'ONLINE') MeetAutoEndService.invalidatePlan();
      UsageAnalyticsService.track('booking_created', input.requesterEmail || input.requesterName, { roomId: input.roomId, meetingType: booking.meetingType });
      var emailResult = Utils.safeRun('bookingCreatedEmail', function () {
        return EmailNotificationService.bookingCreated(booking);
      });
      AuditLogService.log(input.requesterEmail || input.requesterName, 'BOOKING_CREATED', 'booking', id, {
        roomId: input.roomId,
        roomName: room.name,
        title: booking.title,
        requesterName: booking.requesterName,
        department: booking.department,
        meetingType: booking.meetingType,
        startTime: booking.startTime,
        endTime: booking.endTime,
        attendeeCount: attendeeEmails.length,
        attendeeEmails: attendeeEmails,
        meet: calendarResult.meetDetails || null,
        emailNotification: emailResult
      });
      booking.invitedEmails = calendarResult.invitedEmails || [];
      return booking;
    } finally {
      lock.releaseLock();
    }
  }

  function listBookings(filter) {
    var items = DatabaseService.listObjects('bookings');
    if (filter && filter.roomId) items = items.filter(function (item) { return item.roomId === filter.roomId; });
    if (filter && filter.status) items = items.filter(function (item) { return item.status === filter.status; });
    return items.sort(function (a, b) { return new Date(b.startTime) - new Date(a.startTime); }).slice(0, 200);
  }

  function cancelBooking(id, actor) {
    if (!id) throw new Error('booking id is required');
    var booking = DatabaseService.findByKey('bookings', 'id', id);
    if (!booking) throw new Error('Booking not found');
    if (booking.status === 'CANCELLED') return booking;

    booking.status = 'CANCELLED';
    booking.updatedAt = Utils.nowIso();
    booking.cancelledAt = booking.updatedAt;
    booking.approvedBy = actor || booking.approvedBy || '';
    var calendarDeleteResult = {};
    if (booking.calendarEventId) {
      calendarDeleteResult = Utils.safeRun('calendarDelete', function () {
        return CalendarService.deleteEvent(booking.calendarEventId, CalendarService.calendarIdFor(booking));
      });
    }
    DatabaseService.upsertByKey('bookings', 'id', id, booking);
    BookingIndexService.updateStatus(id, 'CANCELLED');
    if (booking.meetingType === 'ONLINE') MeetAutoEndService.invalidatePlan();
    var emailResult = Utils.safeRun('bookingCancelledEmail', function () {
      return EmailNotificationService.bookingCancelled(booking);
    });
    AuditLogService.log(actor || 'ADMIN', 'BOOKING_CANCELLED', 'booking', id, {
      roomId: booking.roomId,
      roomName: booking.roomName,
      title: booking.title,
      requesterName: booking.requesterName,
      meetingType: booking.meetingType,
      startTime: booking.startTime,
      endTime: booking.endTime,
      calendarDelete: calendarDeleteResult,
      emailNotification: emailResult
    });
    return booking;
  }

  function updateAttendees(id, attendeeEmails, actor) {
    if (!id) throw new Error('booking id is required');
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var booking = DatabaseService.findByKey('bookings', 'id', id);
      if (!booking) throw new Error('Booking not found');
      if (booking.status === 'CANCELLED') throw new Error('แก้ไขผู้เข้าร่วมของรายการที่ยกเลิกแล้วไม่ได้');
      if (booking.meetingType !== 'ONLINE') throw new Error('เพิ่มผู้เข้าร่วมได้เฉพาะการประชุมออนไลน์');
      if (!booking.calendarEventId) throw new Error('ไม่พบกิจกรรม Google Calendar ของรายการนี้');
      if (new Date(booking.endTime) < new Date()) throw new Error('การประชุมนี้จบไปแล้ว แก้ไขผู้เข้าร่วมไม่ได้');

      var next = AttendeeService.forBooking(attendeeEmails, booking.requesterEmail);
      // The requester is a co-host too, so only a booking without one needs an email in the list.
      if (!next.length && !booking.requesterEmail) throw new Error(AttendeeService.MIN_COHOST_MESSAGE);
      var previous = AttendeeService.fromBooking(booking);
      var added = next.filter(function (email) { return previous.indexOf(email) === -1; });
      var removed = previous.filter(function (email) { return next.indexOf(email) === -1; });
      // The calendar holding the event is its organizer's (the system account, or the admins' account for bookings made before the move).
      var attendees = AttendeeService.calendarAttendees(CalendarService.calendarIdFor(booking), booking.requesterEmail, next);
      var invitedEmails = attendees.map(function (attendee) { return attendee.email; });
      if (!added.length && !removed.length) return { booking: booking, added: added, removed: removed, invitedEmails: invitedEmails };

      try {
        invitedEmails = CalendarService.updateAttendees(booking.calendarEventId, attendees, CalendarService.calendarIdFor(booking)).invitedEmails;
      } catch (error) {
        if (booking.calendarId || !/Not Found|Forbidden/i.test(error.message)) throw error;
        throw new Error('แก้ผู้เข้าร่วมไม่ได้: รายการนี้จองไว้ในปฏิทิน ' + CalendarService.legacyCalendarId() + ' ก่อนย้ายระบบไปบัญชีใหม่ ' +
          'กรุณาให้บัญชีนั้นแชร์ปฏิทินให้บัญชีระบบ (สิทธิ์ "เปลี่ยนแปลงกิจกรรม") แล้วลองอีกครั้ง');
      }
      // Only rooms the system created through the Meet API have members (co-hosts) to keep in step.
      var meetMembers = booking.meetSource === 'MEET_API' && booking.meetSpaceName ? Utils.safeRun('syncMeetMembers', function () {
        return MeetSpaceService.syncMembers(booking.meetSpaceName, added, removed);
      }) : null;
      booking.attendeeEmails = AttendeeService.serialize(next);
      booking.updatedAt = Utils.nowIso();
      DatabaseService.upsertByKey('bookings', 'id', id, booking);
      AuditLogService.log(actor || 'ADMIN', 'BOOKING_ATTENDEES_UPDATED', 'booking', id, {
        title: booking.title,
        added: added,
        removed: removed,
        attendeeCount: next.length,
        meetMembers: meetMembers
      });
      return { booking: booking, added: added, removed: removed, invitedEmails: invitedEmails, meetMembers: meetMembers };
    } finally {
      lock.releaseLock();
    }
  }

  // recordingsShared: recordings are shared with the requester and co-hosts (admin-only setting off),
  // so the requester's list links to them too.
  function forMember(booking, now, recordingsShared) {
    var confirmed = booking.status === 'CONFIRMED';
    return {
      id: booking.id,
      status: booking.status,
      title: booking.title,
      roomId: booking.roomId,
      roomName: booking.roomName,
      department: booking.department,
      meetingType: booking.meetingType,
      startTime: booking.startTime,
      endTime: booking.endTime,
      meetUrl: booking.meetUrl,
      gpsUrl: booking.gpsUrl,
      notes: booking.notes,
      requesterEmail: booking.requesterEmail,
      attendeeEmails: booking.attendeeEmails,
      createdAt: booking.createdAt,
      cancelledAt: booking.cancelledAt,
      recordingFileId: recordingsShared ? booking.recordingFileId || '' : '',
      canCancel: confirmed && new Date(booking.startTime) > now,
      canEditAttendees: confirmed && booking.meetingType === 'ONLINE' && !!booking.calendarEventId && new Date(booking.endTime) > now
    };
  }

  function listForMember(member) {
    var now = new Date();
    var recordingsShared = !SettingsService.getBoolean('meet_recordings_admin_only', true);
    var mine = DatabaseService.listObjects('bookings')
      .filter(function (booking) { return String(booking.memberId) === String(member.id); })
      .map(function (booking) { return forMember(booking, now, recordingsShared); });
    return {
      member: MemberService.publicProfile(member),
      upcoming: mine
        .filter(function (booking) { return booking.status === 'CONFIRMED' && new Date(booking.endTime) > now; })
        .sort(function (a, b) { return new Date(a.startTime) - new Date(b.startTime); }),
      history: mine
        .filter(function (booking) { return !(booking.status === 'CONFIRMED' && new Date(booking.endTime) > now); })
        .sort(function (a, b) { return new Date(b.startTime) - new Date(a.startTime); })
    };
  }

  // Someone else's booking is reported as "not found" so its existence is not revealed.
  function ownBooking(id, member) {
    if (!id) throw new Error('booking id is required');
    var booking = DatabaseService.findByKey('bookings', 'id', id);
    if (!booking || String(booking.memberId) !== String(member.id)) throw new Error('ไม่พบรายการจองของคุณ');
    return booking;
  }

  function cancelForMember(id, member) {
    var booking = ownBooking(id, member);
    if (booking.status !== 'CANCELLED' && new Date(booking.startTime) <= new Date()) {
      throw new Error('ยกเลิกได้เฉพาะรายการที่ยังไม่ถึงเวลาเริ่มประชุม');
    }
    return forMember(cancelBooking(id, MemberService.actorLabel(member)), new Date());
  }

  function updateAttendeesForMember(id, attendeeEmails, member) {
    ownBooking(id, member);
    var result = updateAttendees(id, attendeeEmails, MemberService.actorLabel(member));
    result.booking = forMember(result.booking, new Date());
    return result;
  }

  function configureMeetAccess(id, actor) {
    var booking = DatabaseService.findByKey('bookings', 'id', id);
    if (!booking) throw new Error('Booking not found');
    if (booking.status === 'CANCELLED') throw new Error('Cancelled bookings cannot be reconfigured');
    if (booking.meetingType !== 'ONLINE' || !booking.meetUrl) throw new Error('This booking does not have a Google Meet room');
    var config = booking.meetSource === 'MEET_API' && booking.meetSpaceName
      ? MeetSpaceService.reconfigureSpace(booking.meetSpaceName, [booking.requesterEmail].concat(AttendeeService.fromBooking(booking)))
      : MeetSpaceService.configureForBooking(booking.meetUrl);
    booking.meetCode = MeetSpaceService.meetingCodeFromUrl(booking.meetUrl);
    booking.meetSpaceName = config.spaceName || booking.meetSpaceName || '';
    booking.meetConfigStatus = config.status || 'CONFIGURED';
    booking.updatedAt = Utils.nowIso();
    DatabaseService.upsertByKey('bookings', 'id', id, booking);
    config.bookingTitle = booking.title;
    AuditLogService.log(actor || 'ADMIN', 'MEET_ACCESS_CONFIGURED', 'booking', id, config);
    return { booking: booking, config: config };
  }

  return {
    createBooking: createBooking,
    listBookings: listBookings,
    cancelBooking: cancelBooking,
    updateAttendees: updateAttendees,
    listForMember: listForMember,
    cancelForMember: cancelForMember,
    updateAttendeesForMember: updateAttendeesForMember,
    configureMeetAccess: configureMeetAccess
  };
})();
