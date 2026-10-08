var AttendeeService = (function () {
  var MIN_COHOST_MESSAGE = 'กรุณาใส่อีเมลอย่างน้อย 1 คน (ใส่อีเมลตัวเองก็ได้) เพื่อให้มีคนเปิดห้องและอัดวิดีโอการประชุมได้';

  function parse(value) {
    var items = Array.isArray(value) ? value : [value];
    var emails = [];
    items.forEach(function (item) {
      String(item === undefined || item === null ? '' : item).split(/[\s,;]+/).forEach(function (part) {
        var email = part.trim().toLowerCase();
        if (email) emails.push(email);
      });
    });
    return emails;
  }

  function normalize(value) {
    var seen = {};
    var emails = [];
    var invalid = [];
    parse(value).forEach(function (email) {
      if (seen[email]) return;
      seen[email] = true;
      if (ValidationService.isEmail(email)) emails.push(email);
      else invalid.push(email);
    });
    if (invalid.length) throw new Error('อีเมลผู้ร่วมจัดไม่ถูกต้อง: ' + invalid.join(', '));
    return emails;
  }

  function maxAttendees() {
    return SettingsService.maxMeetingAttendees();
  }

  // The owner and the requester are always invited, so they never count toward the limit.
  function forBooking(value, requesterEmail) {
    var alreadyInvited = {};
    alreadyInvited[SettingsService.ownerEmail().toLowerCase()] = true;
    if (requesterEmail) alreadyInvited[String(requesterEmail).trim().toLowerCase()] = true;
    var emails = normalize(value).filter(function (email) { return !alreadyInvited[email]; });
    var max = maxAttendees();
    if (emails.length > max) throw new Error('เพิ่มผู้ร่วมจัดได้สูงสุด ' + max + ' อีเมลต่อการจอง (ส่งมา ' + emails.length + ' อีเมล)');
    return emails;
  }

  // An online meeting needs at least one co-host email: Meet records only once someone allowed to
  // record (a co-host) joins, and the system account itself never joins.
  function requireOne(value) {
    if (!normalize(value).length) throw new Error(MIN_COHOST_MESSAGE);
    return value;
  }

  function calendarAttendees(ownerEmail, requesterEmail, attendeeEmails) {
    var seen = {};
    var attendees = [];
    [ownerEmail, requesterEmail].concat(attendeeEmails || []).forEach(function (email) {
      var normalized = String(email || '').trim().toLowerCase();
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      attendees.push({ email: normalized });
    });
    return attendees;
  }

  function serialize(emails) {
    return (emails || []).join(', ');
  }

  function fromBooking(booking) {
    return parse(booking && booking.attendeeEmails);
  }

  return {
    MIN_COHOST_MESSAGE: MIN_COHOST_MESSAGE,
    requireOne: requireOne,
    parse: parse,
    normalize: normalize,
    maxAttendees: maxAttendees,
    forBooking: forBooking,
    calendarAttendees: calendarAttendees,
    serialize: serialize,
    fromBooking: fromBooking
  };
})();
