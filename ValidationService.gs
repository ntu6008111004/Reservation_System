var ValidationService = (function () {
  function requireFields(object, fields) {
    fields.forEach(function (field) {
      if (object[field] === undefined || object[field] === null || object[field] === '') {
        throw new Error('Missing required field: ' + field);
      }
    });
  }

  function validateBookingWindow(start, end) {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid booking date/time');
    if (end <= start) throw new Error('End time must be after start time');
  }

  function isEmail(value) {
    var email = String(value === undefined || value === null ? '' : value).trim();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  return {
    requireFields: requireFields,
    validateBookingWindow: validateBookingWindow,
    isEmail: isEmail
  };
})();
