var config = require('./config.json'),
    crypto = require('crypto'),
    gryphon = require('gryphon'),
    request = require('request'),
    url = require('url')
    ;

// oauth flows are stored in memory
var oauthFlows = { };

// construct a redirect URL
function redirectUrl(nonce) {

  return config.signin_uri +
    "?client_id=" + config.client_id +
    "&redirect_uri=" + config.redirect_uri +
    "&state=" + nonce +
    "&scope=" + config.scopes;
}

module.exports = function(app, db) {

  // begin a new oauth flow
  app.get('/login', function(req, res) {
    var nonce = crypto.randomBytes(32).toString('hex');
    oauthFlows[nonce] = true;
    var url = redirectUrl(nonce);
    return res.redirect(url);
  });

  app.get('/api/oauth', function(req, res) {
    var state = req.query.state;
    var code = req.query.code;

    if (code && state && state in oauthFlows) {
      delete oauthFlows[state];
      var keys = gryphon.keys();

      request.post({
        uri: config.oauth_uri + '/pubkey',
        json: {
          code: code,
          pubkey: keys.pk.toString('hex'),
          client_id: config.client_id,
          client_secret: config.client_secret
        }
      }, function(err, r, body) {
        if (err || r.status >= 400) return res.send(r.status, err || body);

        console.log(err, res, body);
        req.session.scopes = body.scopes;
        req.session.token_type = body.token_type;

        // store the keys
        db.set(keys.pk, keys.sk);

        var opts = url.parse(config.profile_uri + '/email');
        opts.method = 'POST';
        opts.headers = {
          authorization: gryphon.header(opts, keys)
        };
        request(opts, function (err, r, body) {
          console.log(err, r, body);
          if (err || r.status >= 400) return res.send(r.status, err || body);
          req.session.email = body.email;
          res.redirect('/');
        });
      });
    } else {
      res.send(400);
    }
  });

};
