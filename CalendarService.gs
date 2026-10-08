var CalendarService = (function () {
  function calendarId() {
    return PropertiesService.getScriptProperties().getProperty('CALENDAR_ID') || 'primary';
  }

  // Events made before the system moved to another Google account stay in the calendar of the
  // account that ran it then (LEGACY_CALENDAR_ID, recorded on activation); that calendar must be shared with the new account
  // ("make changes to events") for those bookings to be cancelled or edited.
  function legacyCalendarId() {
    var props = PropertiesService.getScriptProperties();
    var configured = props.getProperty('CALENDAR_ID');
    return props.getProperty('LEGACY_CALENDAR_ID') || (configured && configured !== 'primary' ? configured : SettingsService.ownerEmail());
  }

  function calendarIdFor(booking) {
    return booking && booking.calendarId ? String(booking.calendarId) : legacyCalendarId();
  }

  function insertEvent(resource) {
    return Calendar.Events.insert(resource, calendarId(), { conferenceDataVersion: 1, sendUpdates: 'all' });
  }

  function eventResource(input) {
    return {
      summary: input.title,
      description: 'Reservation booking ID: ' + input.id + '\n' + (input.notes || ''),
      start: { dateTime: input.startTime.toISOString(), timeZone: 'Asia/Bangkok' },
      end: { dateTime: input.endTime.toISOString(), timeZone: 'Asia/Bangkok' },
      attendees: AttendeeService.calendarAttendees(SettingsService.ownerEmail(), input.requesterEmail, input.attendeeEmails),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'email', minutes: 15 }
        ]
      }
    };
  }

  // The system creates the Meet room itself, because rooms that Calendar creates cannot have
  // co-hosts, and the event points at that room. If the Meet API refuses (for example on a
  // personal Gmail account), Calendar creates the room the old way so booking still works.
  function createOnlineMeeting(input) {
    var resource = eventResource(input);
    var space = SystemAccountService.isActiveHere()
      ? Utils.safeRun('createMeetSpace', function () { return MeetSpaceService.createSpace(); })
      : { ok: false, error: 'ยังไม่ได้เปิดใช้บัญชีระบบ (Workspace) หรือเว็บยังไม่ได้ deploy ด้วยบัญชีนั้น' };
    var fallbackReason = space.ok ? '' : space.error;
    var event = null;
    if (space.ok) {
      resource.conferenceData = MeetSpaceService.conferenceDataFor(space.result);
      var attached = Utils.safeRun('attachMeetSpace', function () { return insertEvent(resource); });
      if (attached.ok) event = attached.result;
      else fallbackReason = attached.error;
    }
    if (!event) {
      resource.conferenceData = { createRequest: { requestId: input.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
      event = insertEvent(resource);
    }
    var meetUrl = event.hangoutLink || extractMeetUrl(event);
    if (!meetUrl) throw new Error('Calendar event created but Google Meet URL was not returned. Check Calendar API and Meet permissions.');
    // Remember the real calendar: 'primary' would point at another calendar after the system moves accounts.
    var organizerCalendar = event.organizer && event.organizer.email || (calendarId() === 'primary' ? SystemAccountService.current() : calendarId());
    var result = {
      eventId: event.id,
      calendarId: String(organizerCalendar).toLowerCase(),
      meetUrl: meetUrl,
      meetCode: MeetSpaceService.meetingCodeFromUrl(meetUrl),
      invitedEmails: attendeeEmailsOf(event)
    };
    if (!fallbackReason) {
      var members = Utils.safeRun('addMeetMembers', function () {
        return MeetSpaceService.addMembers(space.result.name, [input.requesterEmail].concat(input.attendeeEmails || []));
      });
      result.meetSource = 'MEET_API';
      result.meetSpaceName = space.result.name;
      result.meetConfigStatus = members.ok ? MeetSpaceService.memberStatus(members.result) : 'CONFIGURED_PARTIAL: ' + members.error;
      result.meetDetails = { source: 'MEET_API', spaceName: space.result.name, members: members.ok ? members.result : { error: members.error } };
      return result;
    }
    var meetConfig = Utils.safeRun('configureMeetSpace', function () {
      return MeetSpaceService.configureForBooking(meetUrl);
    });
    result.meetSource = 'CALENDAR';
    result.meetSpaceName = meetConfig.ok && meetConfig.result.spaceName ? meetConfig.result.spaceName : '';
    result.meetConfigStatus = meetConfig.ok ? meetConfig.result.status : 'PENDING_SETUP: ' + meetConfig.error;
    result.meetDetails = { source: 'CALENDAR', fallbackReason: fallbackReason };
    return result;
  }

  function attendeeEmailsOf(event) {
    return (event && event.attendees || [])
      .map(function (attendee) { return String(attendee.email || '').toLowerCase(); })
      .filter(function (email) { return email; });
  }

  // Replaces the guest list; guests who stay keep their RSVP status, new guests get an invitation.
  function updateAttendees(eventId, attendees, targetCalendarId) {
    var target = targetCalendarId || calendarId();
    var current = Calendar.Events.get(target, eventId);
    var existing = {};
    (current.attendees || []).forEach(function (attendee) {
      existing[String(attendee.email || '').toLowerCase()] = attendee;
    });
    var merged = attendees.map(function (attendee) { return existing[attendee.email] || attendee; });
    var event = Calendar.Events.patch({ attendees: merged }, target, eventId, { sendUpdates: 'all' });
    return { eventId: event.id, invitedEmails: attendeeEmailsOf(event) };
  }

  function extractMeetUrl(event) {
    var points = event && event.conferenceData && event.conferenceData.entryPoints ? event.conferenceData.entryPoints : [];
    for (var index = 0; index < points.length; index++) {
      if (points[index].entryPointType === 'video') return points[index].uri;
    }
    return '';
  }

  function testAccess() {
    var calendar = CalendarApp.getCalendarById(calendarId());
    if (!calendar) throw new Error('Calendar is not accessible: ' + calendarId());
    return { calendarId: calendarId(), name: calendar.getName() };
  }

  // Upcoming online bookings made before the move can only be cancelled or edited when the
  // old calendar is shared with the account the system runs as now.
  function legacyAccessReport(bookings) {
    var now = new Date();
    var upcoming = (bookings || []).filter(function (booking) {
      return !booking.calendarId && booking.calendarEventId && booking.status === 'CONFIRMED' && new Date(booking.endTime) > now;
    });
    var report = { legacyCalendarId: legacyCalendarId(), upcomingLegacyBookings: upcoming.length };
    if (!upcoming.length) return report;
    try {
      Calendar.Events.get(report.legacyCalendarId, upcoming[0].calendarEventId);
    } catch (error) {
      throw new Error(upcoming.length + ' upcoming online booking(s) were made in ' + report.legacyCalendarId +
        ' before the move; share that calendar with the system account ("make changes to events") so they can be cancelled or edited. (' + error.message + ')');
    }
    report.accessible = true;
    return report;
  }

  function deleteEvent(eventId, targetCalendarId) {
    if (!eventId) return { skipped: true };
    Calendar.Events.remove(targetCalendarId || calendarId(), eventId, { sendUpdates: 'all' });
    return { deleted: true, eventId: eventId };
  }

  function testMeetCreation() {
    var start = new Date(Date.now() + 60 * 60 * 1000);
    var end = new Date(Date.now() + 75 * 60 * 1000);
    var result = createOnlineMeeting({
      id: 'diag-' + Utils.uuid(),
      title: 'Reservation System Diagnostic',
      requesterEmail: '',
      startTime: start,
      endTime: end,
      notes: 'Diagnostic event can be deleted.'
    });
    result.cleanup = Utils.safeRun('deleteDiagnosticEvent', function () {
      return deleteEvent(result.eventId);
    });
    return result;
  }

  return {
    createOnlineMeeting: createOnlineMeeting,
    updateAttendees: updateAttendees,
    deleteEvent: deleteEvent,
    legacyCalendarId: legacyCalendarId,
    calendarIdFor: calendarIdFor,
    legacyAccessReport: legacyAccessReport,
    testAccess: testAccess,
    testMeetCreation: testMeetCreation
  };
})();
