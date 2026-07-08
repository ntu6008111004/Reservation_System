var BookingIndexService = (function () {
  function add(booking) {
    return DatabaseService.appendObject('booking_index', {
      key: [booking.roomId, booking.startTime, booking.endTime].join('|'),
      bookingId: booking.id,
      roomId: booking.roomId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status
    });
  }

  function hasConflict(roomId, start, end) {
    return DatabaseService.listObjects('booking_index').some(function (item) {
      if (item.roomId !== roomId || item.status === 'CANCELLED') return false;
      var existingStart = new Date(item.startTime);
      var existingEnd = new Date(item.endTime);
      return start < existingEnd && end > existingStart;
    });
  }

  return {
    add: add,
    hasConflict: hasConflict
  };
})();
