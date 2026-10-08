var MeetSpaceService = (function () {
  var BASE_URL = 'https://meet.googleapis.com/v2/';
  // Google Meet allows up to 25 co-hosts in one meeting.
  var COHOST_LIMIT = 25;

  function meetingCodeFromUrl(meetUrl) {
    var match = String(meetUrl || '').match(/meet\.google\.com\/([a-z0-9-]+)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function requestParams(method, payload) {
    return {
      method: method || 'get',
      contentType: 'application/json',
      payload: payload ? JSON.stringify(payload) : undefined,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    };
  }

  function parse(response) {
    var code = response.getResponseCode();
    var body = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('Google Meet API ' + code + ': ' + body);
    return body ? JSON.parse(body) : {};
  }

  function request(url, method, payload) {
    return parse(UrlFetchApp.fetch(url, requestParams(method, payload)));
  }

  // Sends the calls in parallel; an item fails on its own without stopping the others.
  function requestAll(calls) {
    if (!calls.length) return [];
    var responses = UrlFetchApp.fetchAll(calls.map(function (call) {
      var params = requestParams(call.method, call.payload);
      params.url = call.url;
      return params;
    }));
    return responses.map(function (response) {
      try {
        return { ok: true, result: parse(response) };
      } catch (error) {
        return { ok: false, code: response.getResponseCode(), error: error.message };
      }
    });
  }

  function uniqueEmails(emails) {
    var seen = {};
    return (emails || []).map(function (email) { return String(email || '').trim().toLowerCase(); })
      .filter(function (email) {
        if (!email || seen[email]) return false;
        seen[email] = true;
        return true;
      });
  }

  // Host management on, but nothing locked: everyone can share their screen, chat and react
  // without asking, while only the organizer and co-hosts can record or manage the meeting.
  function bookingSpaceConfig() {
    return {
      accessType: SettingsService.getBoolean('meet_open_access_enabled', true) ? 'OPEN' : 'TRUSTED',
      entryPointAccess: 'ALL',
      moderation: 'ON',
      moderationRestrictions: {
        chatRestriction: 'NO_RESTRICTION',
        reactionRestriction: 'NO_RESTRICTION',
        presentRestriction: 'NO_RESTRICTION',
        defaultJoinAsViewerType: 'OFF'
      },
      artifactConfig: {
        recordingConfig: {
          autoRecordingGeneration: SettingsService.getBoolean('meet_auto_recording_enabled', true) ? 'ON' : 'OFF'
        }
      }
    };
  }

  // A room created through the Meet API (not by Calendar) is the only kind that accepts co-hosts.
  function createSpace() {
    var space = request(BASE_URL + 'spaces', 'post', { config: bookingSpaceConfig() });
    if (!space.name || !space.meetingUri) throw new Error('Google Meet API did not return the new meeting room.');
    space.meetingCode = space.meetingCode || meetingCodeFromUrl(space.meetingUri);
    return space;
  }

  // Calendar shows an existing Meet room when the event names it instead of asking for a new one.
  function conferenceDataFor(space) {
    return {
      conferenceId: space.meetingCode,
      conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
      entryPoints: [{
        entryPointType: 'video',
        uri: space.meetingUri,
        label: String(space.meetingUri).replace(/^https?:\/\//, '')
      }]
    };
  }

  function listMembers(spaceName) {
    var members = [];
    var pageToken = '';
    do {
      var page = request(BASE_URL + spaceName + '/members?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), 'get');
      members = members.concat(page.members || []);
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    return members;
  }

  // Members join without knocking; co-hosts may also record and manage the meeting. When the
  // co-host limit is reached the rest still join directly, just without co-host rights.
  function addMembers(spaceName, emails, existingCoHosts) {
    var coHostsEnabled = SettingsService.getBoolean('meet_cohosts_enabled', true);
    var coHostSlots = COHOST_LIMIT - (existingCoHosts || 0);
    var targets = uniqueEmails(emails);
    var results = requestAll(targets.map(function (email, index) {
      var member = { email: email };
      if (coHostsEnabled && index < coHostSlots) member.role = 'COHOST';
      return { url: BASE_URL + spaceName + '/members', method: 'post', payload: member };
    }));
    var report = { coHosts: [], members: [], failed: [] };
    results.forEach(function (result, index) {
      var email = targets[index];
      // 409: already a member (for example when an admin re-applies the settings).
      if (!result.ok && result.code !== 409) {
        report.failed.push(email + ' (' + result.error + ')');
      } else if (coHostsEnabled && index < coHostSlots) {
        report.coHosts.push(email);
      } else {
        report.members.push(email);
      }
    });
    return report;
  }

  function removeMembers(spaceName, emails) {
    var wanted = {};
    uniqueEmails(emails).forEach(function (email) { wanted[email] = true; });
    var targets = listMembers(spaceName).filter(function (member) { return wanted[String(member.email || '').toLowerCase()]; });
    var results = requestAll(targets.map(function (member) {
      return { url: BASE_URL + member.name, method: 'delete' };
    }));
    var report = { removed: [], failed: [] };
    results.forEach(function (result, index) {
      var email = String(targets[index].email).toLowerCase();
      if (result.ok) report.removed.push(email);
      else report.failed.push(email + ' (' + result.error + ')');
    });
    return report;
  }

  function countCoHosts(spaceName) {
    return listMembers(spaceName).filter(function (member) { return member.role === 'COHOST'; }).length;
  }

  function memberStatus(report) {
    return report.failed.length ? 'CONFIGURED_PARTIAL: ตั้งผู้ร่วมจัดไม่สำเร็จ ' + report.failed.join(', ') : 'CONFIGURED';
  }

  // Keeps the room's members in step with the booking's participant list (removals first so
  // their co-host places can be reused).
  function syncMembers(spaceName, added, removed) {
    var removedReport = removed && removed.length ? removeMembers(spaceName, removed) : { removed: [], failed: [] };
    var addedReport = added && added.length ? addMembers(spaceName, added, countCoHosts(spaceName)) : { coHosts: [], members: [], failed: [] };
    return {
      status: memberStatus({ failed: addedReport.failed.concat(removedReport.failed) }),
      added: addedReport,
      removed: removedReport
    };
  }

  // Re-applies the meeting policy to a room the system created (admin "configure Meet" button).
  function reconfigureSpace(spaceName, emails) {
    var config = bookingSpaceConfig();
    var mask = ['config.accessType', 'config.entryPointAccess', 'config.moderation', 'config.moderationRestrictions',
      'config.artifactConfig.recordingConfig.autoRecordingGeneration'];
    var updated = request(BASE_URL + spaceName + '?updateMask=' + encodeURIComponent(mask.join(',')), 'patch', { name: spaceName, config: config });
    var existing = listMembers(spaceName);
    var known = {};
    existing.forEach(function (member) { known[String(member.email || '').toLowerCase()] = true; });
    var missing = uniqueEmails(emails).filter(function (email) { return !known[email]; });
    var coHosts = existing.filter(function (member) { return member.role === 'COHOST'; }).length;
    var members = addMembers(spaceName, missing, coHosts);
    return {
      status: memberStatus(members),
      spaceName: updated.name || spaceName,
      accessType: updated.config && updated.config.accessType || config.accessType,
      autoRecording: config.artifactConfig.recordingConfig.autoRecordingGeneration,
      members: members
    };
  }

  // Up to 6 tries: Calendar can return the Meet URL before the Meet API exposes its space.
  function getSpaceWhenReady(meetingCode) {
    for (var attempt = 0; ; attempt++) {
      try {
        return request(BASE_URL + 'spaces/' + encodeURIComponent(meetingCode), 'get');
      } catch (error) {
        if (!/Google Meet API (404|409|429|500|503)/.test(error.message) || attempt === 5) throw error;
        Utilities.sleep(700 * (attempt + 1));
      }
    }
  }

  function configSnapshot(space) {
    var config = space && space.config || {};
    var recordingConfig = config.artifactConfig && config.artifactConfig.recordingConfig || {};
    return {
      spaceName: space && space.name || '',
      accessType: config.accessType || '',
      autoRecording: recordingConfig.autoRecordingGeneration || '',
      returnedFields: Object.keys(space || {}),
      configFields: Object.keys(config)
    };
  }

  function authorizationDiagnostics() {
    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(ScriptApp.getOAuthToken()), {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Cannot inspect Google OAuth scope: ' + response.getContentText());
    }
    var info = JSON.parse(response.getContentText());
    var scopes = String(info.scope || '').split(/\s+/);
    return {
      meetSettingsGranted: scopes.indexOf('https://www.googleapis.com/auth/meetings.space.settings') !== -1,
      meetReadonlyGranted: scopes.indexOf('https://www.googleapis.com/auth/meetings.space.readonly') !== -1,
      meetCreatedGranted: scopes.indexOf('https://www.googleapis.com/auth/meetings.space.created') !== -1,
      scopeCount: scopes.filter(function (scope) { return scope; }).length
    };
  }

  function configureForBooking(meetUrl) {
    var enableOpenAccess = SettingsService.getBoolean('meet_open_access_enabled', true);
    var enableAutoRecording = SettingsService.getBoolean('meet_auto_recording_enabled', true);
    if (!enableOpenAccess && !enableAutoRecording) return { status: 'DISABLED' };
    var meetingCode = meetingCodeFromUrl(meetUrl);
    if (!meetingCode) throw new Error('Cannot find the Google Meet code from the meeting URL.');

    var space = getSpaceWhenReady(meetingCode);
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
    var verified = getSpaceWhenReady(meetingCode);
    var patchState = configSnapshot(updated);
    var verifiedState = configSnapshot(verified);
    // PATCH is authoritative when a Calendar-created space does not expose config on a follow-up GET.
    var accessType = verifiedState.accessType || patchState.accessType;
    var autoRecording = verifiedState.autoRecording || patchState.autoRecording;
    return {
      status: (enableOpenAccess && accessType !== 'OPEN') || (enableAutoRecording && autoRecording !== 'ON') ? 'CONFIGURED_PARTIAL' : 'CONFIGURED',
      spaceName: verifiedState.spaceName || patchState.spaceName || space.name,
      accessType: accessType,
      autoRecording: autoRecording,
      openAccessRequested: enableOpenAccess,
      autoRecordingRequested: enableAutoRecording,
      diagnostics: {
        patch: patchState,
        verified: verifiedState
      }
    };
  }

  return {
    COHOST_LIMIT: COHOST_LIMIT,
    meetingCodeFromUrl: meetingCodeFromUrl,
    request: request,
    requestAll: requestAll,
    getSpaceWhenReady: getSpaceWhenReady,
    configSnapshot: configSnapshot,
    authorizationDiagnostics: authorizationDiagnostics,
    configureForBooking: configureForBooking,
    bookingSpaceConfig: bookingSpaceConfig,
    createSpace: createSpace,
    conferenceDataFor: conferenceDataFor,
    listMembers: listMembers,
    addMembers: addMembers,
    removeMembers: removeMembers,
    countCoHosts: countCoHosts,
    memberStatus: memberStatus,
    syncMembers: syncMembers,
    reconfigureSpace: reconfigureSpace
  };
})();
