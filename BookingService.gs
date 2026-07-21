var BookingService = (function () {
  function createBooking(input) {
    ValidationService.requireFields(input, ['roomId', 'title', 'requesterName', 'startTime', 'endTime', 'meetingType']);
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
      var start = new Date(input.startTime);
      var end = new Date(input.endTime);
      ValidationService.validateBookingWindow(start, end);
      if (BookingIndexService.hasConflict(input.roomId, start, end)) throw new Error('ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น');

      var now = Utils.nowIso();
      var id = Utils.uuid();
      var calendarResult = {};
      if (meetingType === 'ONLINE') {
        calendarResult = CalendarService.createOnlineMeeting({
          id: id,
          title: input.title,
          requesterEmail: input.requesterEmail,
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
        gpsUrl: input.gpsUrl || '',
        notes: input.notes || '',
        createdBy: input.requesterEmail || input.requesterName,
        approvedBy: '',
        cancelledAt: ''
      };
      DatabaseService.appendObject('bookings', booking);
      BookingIndexService.add(booking);
      UsageAnalyticsService.track('booking_created', input.requesterEmail || input.requesterName, { roomId: input.roomId, meetingType: booking.meetingType });
      var emailResult = Utils.safeRun('bookingCreatedEmail', function () {
        return EmailNotificationService.bookingCreated(booking);
      });
      AuditLogService.log(input.requesterEmail || input.requesterName, 'BOOKING_CREATED', 'booking', id, {
        roomId: input.roomId,
        emailNotification: emailResult
      });
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
        return CalendarService.deleteEvent(booking.calendarEventId);
      });
    }
    DatabaseService.upsertByKey('bookings', 'id', id, booking);
    BookingIndexService.updateStatus(id, 'CANCELLED');
    var emailResult = Utils.safeRun('bookingCancelledEmail', function () {
      return EmailNotificationService.bookingCancelled(booking);
    });
    AuditLogService.log(actor || 'ADMIN', 'BOOKING_CANCELLED', 'booking', id, {
      roomId: booking.roomId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      calendarDelete: calendarDeleteResult,
      emailNotification: emailResult
    });
    return booking;
  }

  function configureMeetAccess(id, actor) {
    var booking = DatabaseService.findByKey('bookings', 'id', id);
    if (!booking) throw new Error('Booking not found');
    if (booking.status === 'CANCELLED') throw new Error('Cancelled bookings cannot be reconfigured');
    if (booking.meetingType !== 'ONLINE' || !booking.meetUrl) throw new Error('This booking does not have a Google Meet room');
    var config = MeetSpaceService.configureForBooking(booking.meetUrl);
    booking.meetCode = MeetSpaceService.meetingCodeFromUrl(booking.meetUrl);
    booking.meetSpaceName = config.spaceName || booking.meetSpaceName || '';
    booking.meetConfigStatus = config.status || 'CONFIGURED';
    booking.updatedAt = Utils.nowIso();
    DatabaseService.upsertByKey('bookings', 'id', id, booking);
    AuditLogService.log(actor || 'ADMIN', 'MEET_ACCESS_CONFIGURED', 'booking', id, config);
    return { booking: booking, config: config };
  }

  return {
    createBooking: createBooking,
    listBookings: listBookings,
    cancelBooking: cancelBooking,
    configureMeetAccess: configureMeetAccess
  };
})();
