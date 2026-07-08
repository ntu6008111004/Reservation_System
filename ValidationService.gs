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

  return {
    requireFields: requireFields,
    validateBookingWindow: validateBookingWindow
  };
})();
