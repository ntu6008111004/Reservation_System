var MeetRecordingService = (function () {
  var TRIGGER_HANDLER = 'syncMeetRecordings';

  function ensureSyncTrigger() {
    var triggers = ScriptApp.getProjectTriggers();
    var exists = triggers.some(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    if (!exists) ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(15).create();
    return { installed: true, handler: TRIGGER_HANDLER, intervalMinutes: 15 };
  }

  function folder() {
    var folderId = SettingsService.get('meet_recordings_folder_id', '');
    if (folderId) return DriveApp.getFolderById(folderId);
    var created = DriveApp.createFolder('Reservation System - Google Meet Recordings');
    SettingsService.set('meet_recordings_folder_id', created.getId(), 'Drive folder ID used for renamed Google Meet recordings.');
    return created;
  }

  function recordingName(booking, originalName) {
    var date = Utilities.formatDate(new Date(booking.startTime), 'Asia/Bangkok', 'ddMMyyyy');
    var extension = String(originalName || '').match(/(\.[a-z0-9]{2,5})$/i);
    var cleanTitle = String(booking.title || 'Untitled meeting').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return 'Meet ' + date + ' - ' + cleanTitle + (extension ? extension[1] : '.mp4');
  }

  function listConferenceRecords(meetCode) {
    var filter = 'space.meeting_code = "' + meetCode + '"';
    var url = 'https://meet.googleapis.com/v2/conferenceRecords?filter=' + encodeURIComponent(filter) + '&pageSize=10';
    return MeetSpaceService.request(url, 'get').conferenceRecords || [];
  }

  function syncBooking(booking, targetFolder) {
    if (!booking.meetCode || booking.recordingFileId) return { skipped: true, bookingId: booking.id };
    var records = listConferenceRecords(booking.meetCode).filter(function (record) { return record.endTime; });
    if (!records.length) return { pending: true, bookingId: booking.id, reason: 'conference_not_finished' };
    var recordings = MeetSpaceService.request('https://meet.googleapis.com/v2/' + records[0].name + '/recordings', 'get').recordings || [];
    var generated = recordings.filter(function (recording) { return recording.state === 'FILE_GENERATED' && recording.driveDestination && recording.driveDestination.file; });
    if (!generated.length) return { pending: true, bookingId: booking.id, reason: 'recording_file_not_ready' };
    var recording = generated[0];
    var file = DriveApp.getFileById(recording.driveDestination.file);
    file.setName(recordingName(booking, file.getName()));
    targetFolder.addFile(file);
    booking.recordingFileId = file.getId();
    booking.recordingUrl = file.getUrl();
    booking.recordingSyncedAt = Utils.nowIso();
    booking.updatedAt = booking.recordingSyncedAt;
    DatabaseService.upsertByKey('bookings', 'id', booking.id, booking);
    AuditLogService.log('SYSTEM', 'MEET_RECORDING_ORGANIZED', 'booking', booking.id, {
      bookingTitle: booking.title,
      fileId: file.getId(),
      fileName: file.getName()
    });
    return { synced: true, bookingId: booking.id, fileId: file.getId(), fileName: file.getName() };
  }

  function syncPendingRecordings() {
    var pending = DatabaseService.listObjects('bookings').filter(function (booking) {
      return booking.status === 'CONFIRMED' && booking.meetingType === 'ONLINE' && booking.meetCode && !booking.recordingFileId;
    });
    if (!pending.length) return { checked: 0, results: [] };
    var targetFolder = folder();
    var results = pending.slice(0, 50).map(function (booking) {
      return Utils.safeRun('recording:' + booking.id, function () { return syncBooking(booking, targetFolder); });
    });
    return { checked: pending.length, processed: results.length, folderUrl: targetFolder.getUrl(), results: results };
  }

  function status() {
    var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === TRIGGER_HANDLER; });
    return { triggerInstalled: triggers.length > 0, intervalMinutes: 15, folderId: SettingsService.get('meet_recordings_folder_id', '') };
  }

  return { ensureSyncTrigger: ensureSyncTrigger, syncPendingRecordings: syncPendingRecordings, status: status };
})();

function syncMeetRecordings() {
  return MeetRecordingService.syncPendingRecordings();
}
