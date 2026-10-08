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

  // Bookings per department, busiest first (bookings made before departments existed are "unassigned").
  function byDepartment(bookings) {
    var counts = {};
    bookings.forEach(function (booking) {
      var name = DepartmentService.clean(booking.department);
      var entry = counts[name] = counts[name] || { department: name, label: DepartmentService.label(name), total: 0, online: 0 };
      entry.total += 1;
      if (booking.meetingType === 'ONLINE') entry.online += 1;
    });
    return Object.keys(counts).map(function (key) { return counts[key]; })
      .sort(function (a, b) { return b.total - a.total || a.label.localeCompare(b.label); });
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
      byDepartment: byDepartment(bookings),
      recentBookings: bookings.slice(-10).reverse()
    };
  }

  return {
    track: track,
    dashboard: dashboard
  };
})();
