// Once the system has moved to another web app (Script Property MOVED_TO_URL), this one only points people there.
function movedToUrl() {
  return String(PropertiesService.getScriptProperties().getProperty('MOVED_TO_URL') || '').trim();
}

function movedError(url) {
  return new Error('ระบบจองห้องประชุมย้ายไปลิงก์ใหม่แล้ว กรุณาใช้ ' + url);
}

function movedPage(url) {
  var safe = url.replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">' +
    '<h2>ระบบจองห้องประชุมย้ายไปลิงก์ใหม่แล้ว</h2>' +
    '<p>กรุณาใช้ลิงก์ใหม่ และบันทึกบุ๊กมาร์กใหม่แทนลิงก์นี้</p>' +
    '<p><a href="' + safe + '" target="_top" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none">ไปที่ระบบจองห้องประชุม</a></p>' +
    '<p style="word-break:break-all;color:#555;font-size:13px">' + safe + '</p></div>')
    .setTitle('ระบบจองห้องประชุมย้ายแล้ว')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet() {
  var moved = movedToUrl();
  if (moved) return movedPage(moved);
  setupScriptProperties();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Reservation System')
    // Apps Script ignores <meta> tags written in the HTML file; without this, phones show the desktop layout zoomed out.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var moved = movedToUrl();
    if (moved) throw movedError(moved);
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
  var moved = movedToUrl();
  if (moved) return ResponseService.error(movedError(moved));
  return routeApi(action, data || {});
}
