var BookingService = (function () {
  function createBooking(input) {
    ValidationService.requireFields(input, ['roomId', 'title', 'requesterName', 'requesterEmail', 'startTime', 'endTime', 'meetingType']);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var room = DatabaseService.findByKey('rooms', 'id', input.roomId);
      if (!room || String(room.active) === 'false') throw new Error('Selected room is not available');
      var start = new Date(input.startTime);
      var end = new Date(input.endTime);
      ValidationService.validateBookingWindow(start, end);
      if (BookingIndexService.hasConflict(input.roomId, start, end)) throw new Error('ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น');

      var now = Utils.nowIso();
      var id = Utils.uuid();
      var calendarResult = {};
      if (String(input.meetingType).toUpperCase() === 'ONLINE') {
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
        meetingType: String(input.meetingType).toUpperCase(),
        meetUrl: calendarResult.meetUrl || '',
        calendarEventId: calendarResult.eventId || '',
        notes: input.notes || '',
        createdBy: input.requesterEmail,
        approvedBy: '',
        cancelledAt: ''
      };
      DatabaseService.appendObject('bookings', booking);
      BookingIndexService.add(booking);
      UsageAnalyticsService.track('booking_created', input.requesterEmail, { roomId: input.roomId, meetingType: booking.meetingType });
      AuditLogService.log(input.requesterEmail, 'BOOKING_CREATED', 'booking', id, { roomId: input.roomId });
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

  return {
    createBooking: createBooking,
    listBookings: listBookings
  };
})();
