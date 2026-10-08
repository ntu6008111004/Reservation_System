// Ends an online meeting once one person has been alone in it for the configured minutes
// (10 by default). Ending the meeting also stops its recording.
var MeetAutoEndService = (function () {
  var TRIGGER_HANDLER = 'monitorAutoEndMeetings';
  var INTERVAL_MINUTES = 1;
  var BASE_URL = 'https://meet.googleapis.com/v2/';
  // People may join before the booked start or stay after the booked end.
  var BEFORE_START_MS = 30 * 60 * 1000;
  var AFTER_END_MS = 4 * 60 * 60 * 1000;
  // The trigger runs every minute; the settings and the list of online bookings are cached so
  // a quiet minute does not read the spreadsheet. Booking and setting changes clear the cache.
  var PLAN_CACHE_KEY = 'autoend:plan';
  var PLAN_CACHE_SECONDS = 600;

  // replace=true reinstalls this account's trigger so a changed interval takes effect.
  function ensureTrigger(replace) {
    var mine = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    if (replace) mine.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
    if (replace || !mine.length) ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(INTERVAL_MINUTES).create();
    return { installed: true, handler: TRIGGER_HANDLER, intervalMinutes: INTERVAL_MINUTES };
  }

  function meetCodeOf(booking) {
    return booking.meetCode || MeetSpaceService.meetingCodeFromUrl(booking.meetUrl);
  }

  // Only rooms organized by the system account can be ended by it; older bookings belong to the
  // account that ran the system when they were made.
  function isMonitorable(booking) {
    return booking.status === 'CONFIRMED' && booking.meetingType === 'ONLINE' && SystemAccountService.organizes(booking) &&
      !!(booking.meetSpaceName || meetCodeOf(booking));
  }

  function isDue(startMs, endMs, nowMs) {
    return startMs - BEFORE_START_MS <= nowMs && nowMs <= endMs + AFTER_END_MS;
  }

  function invalidatePlan() {
    CacheLayer.remove(PLAN_CACHE_KEY);
  }

  function plan(nowMs) {
    var cached = CacheLayer.get(PLAN_CACHE_KEY);
    if (cached) return cached;
    var enabled = SettingsService.getBoolean('meet_auto_end_enabled', true);
    var built = {
      enabled: enabled,
      minutesThreshold: SettingsService.autoEndMinutes(),
      items: !enabled ? [] : DatabaseService.listObjects('bookings')
        .filter(function (booking) { return isMonitorable(booking) && new Date(booking.endTime).getTime() + AFTER_END_MS >= nowMs; })
        .map(function (booking) {
          return { id: booking.id, start: new Date(booking.startTime).getTime(), end: new Date(booking.endTime).getTime() };
        })
    };
    CacheLayer.put(PLAN_CACHE_KEY, built, PLAN_CACHE_SECONDS);
    return built;
  }

  function endActiveConference(spaceNameOrCode) {
    var spacePath = String(spaceNameOrCode || '').indexOf('spaces/') === 0 ? spaceNameOrCode : ('spaces/' + spaceNameOrCode);
    return MeetSpaceService.request(BASE_URL + spacePath + ':endActiveConference', 'post', {});
  }

  function activeConference(booking) {
    var filter = booking.meetSpaceName ? 'space.name = "' + booking.meetSpaceName + '"' : 'space.meeting_code = "' + meetCodeOf(booking) + '"';
    var response = MeetSpaceService.request(BASE_URL + 'conferenceRecords?filter=' + encodeURIComponent(filter) + '&pageSize=10', 'get');
    return (response.conferenceRecords || []).filter(function (record) { return !record.endTime; })[0] || null;
  }

  // People in the meeting right now; a second page means far more than one.
  function activeParticipantCount(conferenceRecordName) {
    var url = BASE_URL + conferenceRecordName + '/participants?filter=' + encodeURIComponent('latest_end_time IS NULL') + '&pageSize=250';
    var page = MeetSpaceService.request(url, 'get');
    var count = (page.participants || []).length;
    return page.nextPageToken ? count + 1 : count;
  }

  function save(booking, fields) {
    Object.keys(fields).forEach(function (key) { booking[key] = fields[key]; });
    booking.updatedAt = Utils.nowIso();
    DatabaseService.upsertByKey('bookings', 'id', booking.id, booking);
  }

  function clearTimer(booking) {
    if (booking.singletonSince) save(booking, { singletonSince: '' });
  }

  function checkBooking(booking, minutesThreshold, now) {
    var record = activeConference(booking);
    if (!record) {
      clearTimer(booking);
      return { activeConference: false, bookingId: booking.id, reason: 'no_active_conference' };
    }
    booking.conferenceRecordName = record.name;
    if (record.space) booking.meetingSpaceId = record.space;

    var activeCount = activeParticipantCount(record.name);
    if (activeCount !== 1) {
      clearTimer(booking);
      return { bookingId: booking.id, activeCount: activeCount, action: activeCount === 0 ? 'skip_empty' : 'reset_timer' };
    }

    if (!booking.singletonSince) {
      save(booking, { singletonSince: now.toISOString() });
      return { bookingId: booking.id, activeCount: 1, action: 'timer_started', since: booking.singletonSince };
    }

    var elapsedMinutes = (now.getTime() - new Date(booking.singletonSince).getTime()) / 60000;
    if (elapsedMinutes < minutesThreshold) {
      return {
        bookingId: booking.id,
        activeCount: 1,
        action: 'timer_running',
        elapsedMinutes: Math.floor(elapsedMinutes),
        minutesThreshold: minutesThreshold,
        since: booking.singletonSince
      };
    }

    endActiveConference(booking.meetSpaceName || record.space || meetCodeOf(booking));
    var endedAt = Utils.nowIso();
    save(booking, {
      autoEndedAt: endedAt,
      autoEndReason: 'ระบบจบห้อง Google Meet อัตโนมัติ (หยุดบันทึกด้วย) เนื่องจากเหลือผู้เข้าร่วม 1 คนต่อเนื่อง ' + Math.floor(minutesThreshold) + ' นาที',
      autoEndStatus: 'ENDED'
    });
    AuditLogService.log('SYSTEM', 'MEET_AUTO_ENDED', 'booking', booking.id, {
      bookingTitle: booking.title,
      meetCode: meetCodeOf(booking),
      minutesThreshold: minutesThreshold,
      singletonSince: booking.singletonSince,
      autoEndedAt: endedAt,
      reason: booking.autoEndReason
    });
    return { bookingId: booking.id, activeCount: 1, action: 'conference_ended', autoEndedAt: endedAt, reason: booking.autoEndReason };
  }

  function monitorActiveConferences() {
    var now = new Date();
    var current = plan(now.getTime());
    if (!current.enabled) return { enabled: false, checked: 0, processed: 0, reason: 'feature_disabled' };
    var due = current.items.filter(function (item) { return isDue(item.start, item.end, now.getTime()); });
    if (!due.length) return { enabled: true, checked: 0, processed: 0, results: [] };

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { locked: true, reason: 'lock_acquired_by_another_process' };
    try {
      var minutesThreshold = current.minutesThreshold;
      var dueIds = {};
      due.forEach(function (item) { dueIds[item.id] = true; });
      var bookings = DatabaseService.listObjects('bookings').filter(function (booking) { return dueIds[booking.id] && isMonitorable(booking); });
      var results = bookings.map(function (booking) {
        return Utils.safeRun('autoEnd:' + booking.id, function () { return checkBooking(booking, minutesThreshold, now); });
      });
      return { enabled: true, minutesThreshold: minutesThreshold, checked: bookings.length, processed: results.length, results: results };
    } finally {
      lock.releaseLock();
    }
  }

  function status() {
    var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    var minutesThreshold = SettingsService.autoEndMinutes();
    var now = new Date();
    var monitored = DatabaseService.listObjects('bookings').filter(function (booking) {
      return isMonitorable(booking) && isDue(new Date(booking.startTime).getTime(), new Date(booking.endTime).getTime(), now.getTime());
    });
    return {
      triggerInstalled: triggers.length > 0,
      intervalMinutes: INTERVAL_MINUTES,
      enabled: SettingsService.getBoolean('meet_auto_end_enabled', true),
      minutesThreshold: minutesThreshold,
      monitoredCount: monitored.length,
      singletons: monitored
        .filter(function (booking) { return !!booking.singletonSince; })
        .map(function (booking) {
          return {
            bookingId: booking.id,
            title: booking.title,
            roomName: booking.roomName,
            meetCode: meetCodeOf(booking),
            singletonSince: booking.singletonSince,
            elapsedMinutes: Math.max(0, Math.floor((now.getTime() - new Date(booking.singletonSince).getTime()) / 60000)),
            minutesThreshold: minutesThreshold
          };
        })
    };
  }

  return {
    ensureTrigger: ensureTrigger,
    endActiveConference: endActiveConference,
    invalidatePlan: invalidatePlan,
    monitorActiveConferences: monitorActiveConferences,
    status: status
  };
})();

function monitorAutoEndMeetings() {
  return SystemAccountService.retireTriggerIfForeign('monitorAutoEndMeetings') || MeetAutoEndService.monitorActiveConferences();
}
