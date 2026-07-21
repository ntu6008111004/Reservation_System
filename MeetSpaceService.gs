var MeetSpaceService = (function () {
  var BASE_URL = 'https://meet.googleapis.com/v2/';

  function meetingCodeFromUrl(meetUrl) {
    var match = String(meetUrl || '').match(/meet\.google\.com\/([a-z0-9-]+)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function request(url, method, payload) {
    var response = UrlFetchApp.fetch(url, {
      method: method || 'get',
      contentType: 'application/json',
      payload: payload ? JSON.stringify(payload) : undefined,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var body = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('Google Meet API ' + code + ': ' + body);
    return body ? JSON.parse(body) : {};
  }

  function configureForBooking(meetUrl) {
    var enableOpenAccess = SettingsService.get('meet_open_access_enabled', 'true') === 'true';
    var enableAutoRecording = SettingsService.get('meet_auto_recording_enabled', 'true') === 'true';
    if (!enableOpenAccess && !enableAutoRecording) return { status: 'DISABLED' };
    var meetingCode = meetingCodeFromUrl(meetUrl);
    if (!meetingCode) throw new Error('Cannot find the Google Meet code from the meeting URL.');

    var space = request(BASE_URL + 'spaces/' + encodeURIComponent(meetingCode), 'get');
    var config = {};
    var updateMask = [];
    if (enableOpenAccess) {
      config.accessType = 'OPEN';
      updateMask.push('config.accessType');
    }
    if (enableAutoRecording) {
      config.artifactConfig = { recordingConfig: { autoRecordingGeneration: 'ON' } };
      updateMask.push('config.artifactConfig.recordingConfig.autoRecordingGeneration');
    }
    var updated = request(
      BASE_URL + space.name + '?updateMask=' + encodeURIComponent(updateMask.join(',')),
      'patch',
      { name: space.name, config: config }
    );
    return {
      status: 'CONFIGURED',
      spaceName: updated.name,
      accessType: updated.config && updated.config.accessType,
      autoRecording: updated.config && updated.config.artifactConfig && updated.config.artifactConfig.recordingConfig && updated.config.artifactConfig.recordingConfig.autoRecordingGeneration
    };
  }

  return {
    meetingCodeFromUrl: meetingCodeFromUrl,
    request: request,
    configureForBooking: configureForBooking
  };
})();
