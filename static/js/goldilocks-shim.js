(function () {
  var _watch = navigator.id.watch;

  navigator.id.watch = function(args) {
    if ('onlogout' in args || 'onready' in args || 'loggedInUser' in args) {
      throw "Unknown paramter for id.watch(). Goldilocks only supports onlogin";
    }

    var _onlogin = args.onlogin;
    var loggingIn = false;
    var assertion;

    // Ignore calls to onlogout, unless during login.
    args.onlogout = function () {
      if (loggingIn) {
        loggingIn = false;
        _onlogin(assertion);
      }
    };

    // Kill Persona state (logout) before invoking the login callback.
    args.onlogin = function (a) {
      loggingIn = true;
      assertion = a;
      navigator.id.logout();
    };

    _watch.apply(navigator.id, [args, ]);
  };
})();
