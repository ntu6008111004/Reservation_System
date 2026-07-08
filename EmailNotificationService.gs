var EmailNotificationService = (function () {
  function enabled() {
    return String(SettingsService.get('email_notifications_enabled', 'false')).toLowerCase() === 'true';
  }

  function shouldSend(booking) {
    return enabled() && booking && booking.requesterEmail;
  }

  function formatDateTime(value) {
    var date = new Date(value);
    return Utilities.formatDate(date, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
  }

  function bookingLines(booking) {
    return [
      'หัวข้อ: ' + booking.title,
      'ห้อง/ทรัพยากร: ' + booking.roomName,
      'เวลา: ' + formatDateTime(booking.startTime) + ' - ' + formatDateTime(booking.endTime),
      'รูปแบบประชุม: ' + booking.meetingType,
      booking.meetUrl ? 'Google Meet: ' + booking.meetUrl : '',
      booking.gpsUrl ? 'GPS: ' + booking.gpsUrl : '',
      booking.notes ? 'หมายเหตุ: ' + booking.notes : ''
    ].filter(function (line) { return line; });
  }

  function send(subject, booking, intro) {
    if (!shouldSend(booking)) {
      return { skipped: true, enabled: enabled(), hasEmail: !!(booking && booking.requesterEmail) };
    }
    MailApp.sendEmail({
      to: booking.requesterEmail,
      subject: subject,
      body: [intro].concat(bookingLines(booking)).join('\n')
    });
    return { sent: true, to: booking.requesterEmail };
  }

  function bookingCreated(booking) {
    return send('ยืนยันการจองห้องประชุม', booking, 'ระบบบันทึกรายการจองของคุณแล้ว');
  }

  function bookingCancelled(booking) {
    return send('แจ้งยกเลิกการจองห้องประชุม', booking, 'รายการจองนี้ถูกยกเลิกแล้ว');
  }

  return {
    enabled: enabled,
    bookingCreated: bookingCreated,
    bookingCancelled: bookingCancelled
  };
})();
