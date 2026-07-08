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
    var bookings = DatabaseService.listObjects('bookings');
    var online = bookings.filter(function (item) { return item.meetingType === 'ONLINE'; }).length;
    var hybrid = bookings.filter(function (item) { return item.meetingType === 'HYBRID'; }).length;
    return {
      totalBookings: bookings.length,
      onlineBookings: online,
      hybridBookings: hybrid,
      onsiteBookings: bookings.length - online - hybrid,
      activeRooms: DatabaseService.listObjects('rooms').filter(function (room) { return String(room.active) !== 'false'; }).length,
      recentBookings: bookings.slice(-10).reverse()
    };
  }

  return {
    track: track,
    dashboard: dashboard
  };
})();
