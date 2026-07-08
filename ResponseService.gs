var ResponseService = (function () {
  function success(data) {
    return { ok: true, data: data };
  }

  function error(errorObject) {
    return { ok: false, error: { message: errorObject.message || String(errorObject) } };
  }

  function json(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  }

  return {
    success: success,
    error: error,
    json: json
  };
})();
