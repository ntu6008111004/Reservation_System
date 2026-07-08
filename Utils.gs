var Utils = (function () {
  function uuid() {
    return Utilities.getUuid();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sha256(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    return bytes.map(function (byte) {
      var v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  }

  function safeRun(label, fn) {
    try {
      return { name: label, ok: true, result: fn() };
    } catch (error) {
      return { name: label, ok: false, error: error.message };
    }
  }

  return {
    uuid: uuid,
    nowIso: nowIso,
    sha256: sha256,
    safeRun: safeRun
  };
})();
