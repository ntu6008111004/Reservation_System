var CalendarService = (function () {
  function calendarId() {
    return PropertiesService.getScriptProperties().getProperty('CALENDAR_ID') || 'primary';
  }

  function createOnlineMeeting(input) {
    var ownerEmail = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || 'tsmile.it.official@gmail.com';
    var attendees = [{ email: ownerEmail }];
    if (input.requesterEmail) attendees.push({ email: input.requesterEmail });
    var resource = {
      summary: input.title,
      description: 'Reservation booking ID: ' + input.id + '\n' + (input.notes || ''),
      start: { dateTime: input.startTime.toISOString(), timeZone: 'Asia/Bangkok' },
      end: { dateTime: input.endTime.toISOString(), timeZone: 'Asia/Bangkok' },
      attendees: attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'email', minutes: 15 }
        ]
      },
      conferenceData: {
        createRequest: {
          requestId: input.id,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };
    var event = Calendar.Events.insert(resource, calendarId(), { conferenceDataVersion: 1, sendUpdates: 'all' });
    var meetUrl = event.hangoutLink || extractMeetUrl(event);
    if (!meetUrl) throw new Error('Calendar event created but Google Meet URL was not returned. Check Calendar API and Meet permissions.');
    return { eventId: event.id, meetUrl: meetUrl };
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

  function testMeetCreation() {
    var start = new Date(Date.now() + 60 * 60 * 1000);
    var end = new Date(Date.now() + 75 * 60 * 1000);
    var result = createOnlineMeeting({
      id: 'diag-' + Utils.uuid(),
      title: 'Reservation System Diagnostic',
      requesterEmail: PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || 'tsmile.it.official@gmail.com',
      startTime: start,
      endTime: end,
      notes: 'Diagnostic event can be deleted.'
    });
    return result;
  }

  return {
    createOnlineMeeting: createOnlineMeeting,
    testAccess: testAccess,
    testMeetCreation: testMeetCreation
  };
})();
