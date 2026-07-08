var UsageAnalyticsService = (function () {
  function track(eventName, actor, metadata) {
    DatabaseService.appendObject('usage_events', {
      id: Utils.uuid(),
      timestamp: Utils.nowIso(),
      eventName: eventName,
      actor: actor || '',
      metadata: JSON.stringify(metadata || {})
    });
  }

  function dashboard() {
    var allBookings = DatabaseService.listObjects('bookings');
    var bookings = allBookings.filter(function (item) { return item.status !== 'CANCELLED'; });
    var online = bookings.filter(function (item) { return item.meetingType === 'ONLINE'; }).length;
    var offsite = bookings.filter(function (item) { return item.meetingType === 'OFFSITE'; }).length;
    return {
      totalBookings: bookings.length,
      cancelledBookings: allBookings.length - bookings.length,
      onlineBookings: online,
      offsiteBookings: offsite,
      onsiteBookings: bookings.length - online - offsite,
      activeRooms: DatabaseService.listObjects('rooms').filter(function (room) { return String(room.active) !== 'false'; }).length,
      recentBookings: bookings.slice(-10).reverse()
    };
  }

  return {
    track: track,
    dashboard: dashboard
  };
})();
