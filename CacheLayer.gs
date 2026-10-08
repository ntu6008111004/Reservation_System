var CacheLayer = (function () {
  function get(key) {
    var value = CacheService.getScriptCache().get(key);
    return value ? JSON.parse(value) : null;
  }

  function put(key, value, seconds) {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || 300);
  }

  function remove(key) {
    CacheService.getScriptCache().remove(key);
  }

  function test() {
    var key = 'diagnostic-cache';
    put(key, { ok: true }, 60);
    return get(key).ok === true;
  }

  return {
    get: get,
    put: put,
    remove: remove,
    test: test
  };
})();
