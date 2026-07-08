var DeviceParser = (function () {
  function parse(userAgent) {
    var ua = String(userAgent || '').toLowerCase();
    return {
      isMobile: /iphone|android|mobile/.test(ua),
      browser: ua.indexOf('chrome') >= 0 ? 'Chrome' : ua.indexOf('safari') >= 0 ? 'Safari' : 'Other'
    };
  }

  return { parse: parse };
})();
