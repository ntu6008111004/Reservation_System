function doGet() {
  setupScriptProperties();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Reservation System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    return ResponseService.json(routeApi(payload.action, payload.data || {}));
  } catch (error) {
    return ResponseService.json(ResponseService.error(error));
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function api(action, data) {
  return routeApi(action, data || {});
}
