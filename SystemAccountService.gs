// The web app runs as the account that deployed it (executeAs USER_DEPLOYING). That account
// organizes every new Calendar event and owns every new Google Meet room, so Meet features
// such as co-hosts and recording follow its Google Workspace edition.
var SystemAccountService = (function () {
  var RUNNING_AS_KEY = 'RUNNING_AS_EMAIL';

  // The primary calendar ID of an account is its email address.
  function current() {
    return String(Calendar.Calendars.get('primary').id || '').trim().toLowerCase();
  }

  // Time triggers run as the account that installed them; remember who that is per account.
  function currentCached() {
    var userProperties = PropertiesService.getUserProperties();
    var email = userProperties.getProperty(RUNNING_AS_KEY);
    if (!email) {
      email = current();
      userProperties.setProperty(RUNNING_AS_KEY, email);
    }
    return email;
  }

  function configured() {
    return String(PropertiesService.getScriptProperties().getProperty('SYSTEM_ACCOUNT_EMAIL') || '').trim().toLowerCase();
  }

  function activate() {
    var email = current();
    if (!email) throw new Error('Cannot find the email of the account running the script.');
    PropertiesService.getScriptProperties().setProperty('SYSTEM_ACCOUNT_EMAIL', email);
    PropertiesService.getUserProperties().setProperty(RUNNING_AS_KEY, email);
    return email;
  }

  // After the system moves to another account, the old account's triggers would keep running
  // with the wrong identity; each one removes itself the next time it fires.
  function retireTriggerIfForeign(handler) {
    var expected = configured();
    if (!expected) return null;
    var runningAs = currentCached();
    if (runningAs === expected) return null;
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() !== handler) return;
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    });
    return { retired: true, handler: handler, runningAs: runningAs, systemAccount: expected, removedTriggers: removed };
  }

  // Meet rooms with co-hosts and recording need the Workspace account, so the new room flow is used
  // only once that account is activated and the web app really runs as it (deployed by it).
  // Until then — and as an instant fallback — Calendar creates the rooms as before.
  function isActiveHere() {
    var expected = configured();
    return !!expected && current() === expected;
  }

  // Bookings the system account can manage: made by this version (calendarId stored) and, once a
  // system account is activated, organized by that account rather than the previous one.
  function organizes(booking) {
    var expected = configured();
    return !!booking.calendarId && (!expected || String(booking.calendarId).toLowerCase() === expected);
  }

  function status() {
    var runningAs = current();
    var expected = configured();
    return {
      runningAs: runningAs,
      systemAccount: expected,
      activated: !!expected,
      matches: !expected || runningAs === expected
    };
  }

  return {
    current: current,
    currentCached: currentCached,
    configured: configured,
    activate: activate,
    retireTriggerIfForeign: retireTriggerIfForeign,
    isActiveHere: isActiveHere,
    organizes: organizes,
    status: status
  };
})();
