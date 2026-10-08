// Google Meet saves recordings in the organizer's Drive (the system account). Every 15 minutes
// the files of recent online meetings are renamed and moved into the booking's department folder
// inside the recordings folder chosen by the admin (a folder of tsmile.it.official shared with the
// system account), and the requester and co-hosts of the booking can edit and share them (or,
// when the admin-only setting is on, only the admins keep access).
var MeetRecordingService = (function () {
  var TRIGGER_HANDLER = 'syncMeetRecordings';
  var BASE_URL = 'https://meet.googleapis.com/v2/';
  var FOLDER_NAME = 'Reservation System - Google Meet Recordings';
  // Recordings appear after a meeting ends; meetings older than this are no longer checked.
  var LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

  // replace=true reinstalls this account's trigger so a changed interval takes effect.
  function ensureSyncTrigger(replace) {
    var mine = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    if (replace) mine.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
    if (replace || !mine.length) ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(15).create();
    return { installed: true, handler: TRIGGER_HANDLER, intervalMinutes: 15 };
  }

  function folderIdFromInput(value) {
    var text = String(value || '').trim();
    var match = text.match(/\/folders\/([A-Za-z0-9_-]+)/) || text.match(/[?&]id=([A-Za-z0-9_-]+)/) || text.match(/^([A-Za-z0-9_-]{10,})$/);
    return match ? match[1] : '';
  }

  function describeFolder(folder) {
    var owner = Utils.safeRun('folderOwner', function () { return folder.getOwner().getEmail(); });
    return { id: folder.getId(), name: folder.getName(), url: folder.getUrl(), ownerEmail: owner.ok ? owner.result : '' };
  }

  function openFolder(folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      throw new Error('เปิดโฟลเดอร์เก็บไฟล์บันทึกไม่ได้ (' + folderId + ') — กรุณาแชร์โฟลเดอร์ให้บัญชีระบบเป็น "ผู้แก้ไข" (' + error.message + ')');
    }
  }

  function folder() {
    var folderId = SettingsService.get('meet_recordings_folder_id', '');
    if (folderId) return openFolder(folderId);
    var created = DriveApp.createFolder(FOLDER_NAME);
    SettingsService.set('meet_recordings_folder_id', created.getId());
    return created;
  }

  // Admin page: point the recordings at a folder by pasting its Google Drive link.
  function setFolder(input) {
    var folderId = folderIdFromInput(input);
    if (!folderId) throw new Error('ลิงก์โฟลเดอร์ Google Drive ไม่ถูกต้อง');
    var described = describeFolder(openFolder(folderId));
    SettingsService.set('meet_recordings_folder_id', folderId);
    return described;
  }

  // On activation: keep a configured folder this account can open; otherwise use a folder named
  // FOLDER_NAME shared with it (for example by tsmile.it.official, its owner), so recordings land
  // there without an admin first pasting the link.
  function adoptSharedFolder() {
    var current = folderStatus();
    if (current.accessible) return Object.assign({ adopted: false }, current);
    var found = DriveApp.searchFolders('title = "' + FOLDER_NAME + '" and trashed = false');
    if (found.hasNext()) {
      var candidate = found.next();
      SettingsService.set('meet_recordings_folder_id', candidate.getId());
      return Object.assign({ adopted: true, configured: true, accessible: true }, describeFolder(candidate));
    }
    return Object.assign({ adopted: false, lookedFor: FOLDER_NAME }, current);
  }

  function folderStatus() {
    var folderId = SettingsService.get('meet_recordings_folder_id', '');
    if (!folderId) return { configured: false, accessible: false };
    var opened = Utils.safeRun('recordingsFolder', function () { return describeFolder(openFolder(folderId)); });
    return opened.ok
      ? Object.assign({ configured: true, accessible: true }, opened.result)
      : { configured: true, accessible: false, id: folderId, error: opened.error };
  }

  function baseName(booking) {
    var date = Utilities.formatDate(new Date(booking.startTime), 'Asia/Bangkok', 'ddMMyyyy');
    var cleanTitle = String(booking.title || 'Untitled meeting').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return 'Meet ' + date + ' - ' + cleanTitle;
  }

  function recordingName(booking, originalName, sequence) {
    var extension = String(originalName || '').match(/(\.[a-z0-9]{2,5})$/i);
    return baseName(booking) + (sequence > 1 ? ' (' + sequence + ')' : '') + (extension ? extension[1] : '.mp4');
  }

  // "<title> - 2026/10/07 17:35 GMT+07:00 - โน้ตโดย Gemini" → "Meet 07102026 - <title> - โน้ตโดย Gemini"
  function companionName(booking, originalName) {
    return baseName(booking) + ' - ' + String(originalName).split(' - ').pop().replace(/[\\/:*?"<>|]+/g, ' ').trim();
  }

  // Google puts each meeting's files (video, Gemini notes, transcript, chat) in one folder named
  // "<title> - <date time>"; the other files in that folder belong to the same meeting. Files in a
  // shared folder such as "Meet Recordings" are left alone.
  function companionFiles(file, skipIds) {
    var originalName = file.getName();
    var companions = [];
    var parents = file.getParents();
    while (parents.hasNext()) {
      var parent = parents.next();
      if (originalName.indexOf(parent.getName() + ' - ') !== 0) continue;
      var files = parent.getFiles();
      while (files.hasNext()) {
        var sibling = files.next();
        if (sibling.getId() !== file.getId() && skipIds.indexOf(sibling.getId()) === -1) companions.push(sibling);
      }
    }
    return companions;
  }

  function fileAway(file, name, targetFolder, admins, coHosts) {
    file.setName(name);
    file.moveTo(targetFolder);
    if (SettingsService.getBoolean('meet_recordings_admin_only', true)) return { removedAccess: restrictToAdmins(file, admins), sharedWith: [], shareFailed: [] };
    return Object.assign({ removedAccess: [] }, shareWithCoHosts(file, coHosts));
  }

  // The requester and the co-hosts named in the booking (often personal Gmail accounts) become
  // editors, so they can open, download and share the files themselves. Sharing outside the
  // Workspace domain must be allowed in the Admin console (Drive and Docs → Sharing settings).
  function shareWithCoHosts(file, coHosts) {
    var report = { sharedWith: [], shareFailed: [] };
    coHosts.forEach(function (email) {
      var done = Utils.safeRun('shareRecording', function () { return file.addEditor(email); });
      if (done.ok) report.sharedWith.push(email);
      else report.shareFailed.push(email + ' (' + done.error + ')');
    });
    return report;
  }

  function bookingCoHosts(booking) {
    var seen = {};
    return [booking.requesterEmail].concat(AttendeeService.fromBooking(booking))
      .map(function (email) { return String(email || '').trim().toLowerCase(); })
      .filter(function (email) {
        if (!ValidationService.isEmail(email) || seen[email]) return false;
        seen[email] = true;
        return true;
      });
  }

  function adminEmails(targetFolder) {
    var emails = {};
    [SystemAccountService.configured(), SettingsService.ownerEmail()].forEach(function (email) {
      if (email) emails[String(email).toLowerCase()] = true;
    });
    var owner = Utils.safeRun('folderOwner', function () { return targetFolder.getOwner().getEmail(); });
    if (owner.ok && owner.result) emails[String(owner.result).toLowerCase()] = true;
    return emails;
  }

  // Meet shares recordings with co-hosts and with whoever started them; the office decided that
  // only the admins may open recordings, so everyone else is removed from the file.
  function restrictToAdmins(file, admins) {
    var removed = [];
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    [['getEditors', 'removeEditor'], ['getViewers', 'removeViewer']].forEach(function (pair) {
      file[pair[0]]().forEach(function (user) {
        var email = String(user.getEmail() || '').toLowerCase();
        if (!email || admins[email]) return;
        var done = Utils.safeRun('removeAccess', function () { return file[pair[1]](email); });
        if (done.ok) removed.push(email);
      });
    });
    return removed;
  }

  function conferenceRecords(booking) {
    var filter = booking.meetSpaceName ? 'space.name = "' + booking.meetSpaceName + '"' : 'space.meeting_code = "' + booking.meetCode + '"';
    return MeetSpaceService.request(BASE_URL + 'conferenceRecords?filter=' + encodeURIComponent(filter) + '&pageSize=25', 'get').conferenceRecords || [];
  }

  // One sub-folder per department inside the recordings folder ("ฝ่ายบัญชี", "ไม่ระบุฝ่าย", …), created on first use.
  function departmentFolder(root, department, known) {
    var name = DepartmentService.label(department);
    if (!known[name]) {
      var existing = root.getFoldersByName(name);
      known[name] = existing.hasNext() ? existing.next() : root.createFolder(name);
    }
    return known[name];
  }

  function syncBooking(booking, rootFolder, admins, knownFolders) {
    var done = String(booking.recordingFileId || '').split(',').map(function (id) { return id.trim(); }).filter(function (id) { return id; });
    var ready = [];
    conferenceRecords(booking).forEach(function (record) {
      (MeetSpaceService.request(BASE_URL + record.name + '/recordings', 'get').recordings || []).forEach(function (recording) {
        var fileId = recording.state === 'FILE_GENERATED' && recording.driveDestination && recording.driveDestination.file;
        if (fileId && done.indexOf(fileId) === -1 && ready.indexOf(fileId) === -1) ready.push(fileId);
      });
    });
    if (!ready.length) return { pending: true, bookingId: booking.id, reason: done.length ? 'no_new_recording' : 'recording_file_not_ready' };

    var targetFolder = departmentFolder(rootFolder, booking.department, knownFolders);
    var coHosts = bookingCoHosts(booking);
    var organized = ready.map(function (fileId) {
      var file = DriveApp.getFileById(fileId);
      var companions = companionFiles(file, ready.concat(done));
      var access = fileAway(file, recordingName(booking, file.getName(), done.length + 1), targetFolder, admins, coHosts);
      var companionNames = companions.map(function (companion) {
        fileAway(companion, companionName(booking, companion.getName()), targetFolder, admins, coHosts);
        return companion.getName();
      });
      done.push(fileId);
      AuditLogService.log('SYSTEM', 'MEET_RECORDING_ORGANIZED', 'booking', booking.id, {
        bookingTitle: booking.title,
        fileId: fileId,
        fileName: file.getName(),
        folderName: targetFolder.getName(),
        companionFiles: companionNames,
        removedAccess: access.removedAccess,
        sharedWith: access.sharedWith,
        shareFailed: access.shareFailed
      });
      return { fileId: fileId, fileName: file.getName(), folderName: targetFolder.getName(), url: file.getUrl(), companionFiles: companionNames, removedAccess: access.removedAccess, sharedWith: access.sharedWith, shareFailed: access.shareFailed };
    });
    booking.recordingFileId = done.join(',');
    booking.recordingUrl = booking.recordingUrl || organized[0].url;
    booking.recordingSyncedAt = Utils.nowIso();
    booking.updatedAt = booking.recordingSyncedAt;
    DatabaseService.upsertByKey('bookings', 'id', booking.id, booking);
    return { synced: true, bookingId: booking.id, files: organized };
  }

  // Meetings of the system account that have started and ended no more than 3 days ago
  // (or are still running); older ones were handled or never recorded.
  function recentMeetings(now) {
    return DatabaseService.listObjects('bookings').filter(function (booking) {
      return booking.status === 'CONFIRMED' && booking.meetingType === 'ONLINE' && SystemAccountService.organizes(booking) &&
        (booking.meetSpaceName || booking.meetCode) &&
        new Date(booking.startTime).getTime() <= now.getTime() &&
        new Date(booking.endTime).getTime() + LOOKBACK_MS >= now.getTime();
    });
  }

  function syncPendingRecordings() {
    var pending = recentMeetings(new Date());
    if (!pending.length) return { checked: 0, results: [] };
    // The 15-minute trigger and the admin button run as the same system account; one run at a
    // time keeps a department folder from being created twice. (Not the script lock bookings use.)
    var lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) return { locked: true, reason: 'another_recording_sync_is_running' };
    try {
      var rootFolder = folder();
      var admins = adminEmails(rootFolder);
      var knownFolders = {};
      var results = pending.map(function (booking) {
        return Utils.safeRun('recording:' + booking.id, function () { return syncBooking(booking, rootFolder, admins, knownFolders); });
      });
      return { checked: pending.length, processed: results.length, folderUrl: rootFolder.getUrl(), results: results };
    } finally {
      lock.releaseLock();
    }
  }

  function status() {
    var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    return {
      triggerInstalled: triggers.length > 0,
      intervalMinutes: 15,
      folderId: SettingsService.get('meet_recordings_folder_id', ''),
      adminOnly: SettingsService.getBoolean('meet_recordings_admin_only', true)
    };
  }

  return {
    ensureSyncTrigger: ensureSyncTrigger,
    folderIdFromInput: folderIdFromInput,
    setFolder: setFolder,
    adoptSharedFolder: adoptSharedFolder,
    folderStatus: folderStatus,
    recordingName: recordingName,
    syncPendingRecordings: syncPendingRecordings,
    status: status
  };
})();

function syncMeetRecordings() {
  return SystemAccountService.retireTriggerIfForeign('syncMeetRecordings') || MeetRecordingService.syncPendingRecordings();
}
