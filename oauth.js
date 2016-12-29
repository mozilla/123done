'use strict';

var config = require('./config');
var crypto = require('crypto');
var request = require('request');
var querystring = require('querystring');
var KeyPair = require('fxa-crypto-utils').KeyPair;

var DIFFERENT_BROWSER_ERROR = 3005;

// oauth flows are stored in memory
var oauthFlows = { };

// construct a redirect URL
function toQueryString(obj) {
  return '?' + querystring.stringify(obj);
}

function getOAuthInfo(action, nonce, email) {
  var oauthParams = {
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    state: nonce,
    scope: config.scopes,
    oauth_uri: config.oauth_uri,
    content_uri: config.content_uri
  };

  if (action) {
    oauthParams.action = action;
  }

  if (email) {
    oauthParams.email = email;
  }

  return oauthParams;
}

function redirectUrl(oauthInfo) {
  return config.auth_uri + toQueryString(oauthInfo);
}

function generateAndSaveNonce(req) {
  var nonce = crypto.randomBytes(32).toString('hex');
  oauthFlows[nonce] = true;
  req.session.state = nonce;
  return nonce;
}

module.exports = function(app, db) {
  var keyPair = new KeyPair(config);
  var secretKeyId = 'dev-1';

  // begin a new oauth log in flow
  app.get('/api/login', function(req, res) {
    var nonce = generateAndSaveNonce(req);
    var oauthInfo = getOAuthInfo('signin', nonce);
    res.format({
      'application/json': function () {
        res.json(oauthInfo);
      }
    });
  });

  // begin a new oauth sign up flow
  app.get('/api/signup', function(req, res) {
    var nonce = generateAndSaveNonce(req);
    var oauthInfo = getOAuthInfo('signup', nonce);
    res.format({
      'application/json': function () {
        res.json(oauthInfo);
      }
    });
  });

  // let the content server choose the flow
  app.get('/api/best_choice', function(req, res) {
    var nonce = generateAndSaveNonce(req);
    var oauthInfo = getOAuthInfo(null, nonce);
    res.format({
      'application/json': function () {
        res.json(oauthInfo);
      }
    });
  });

  // begin a force auth flow
  app.get('/api/force_auth', function(req, res) {
    var nonce = generateAndSaveNonce(req);
    var oauthInfo = getOAuthInfo('force_auth', nonce, req.query.email);
    return res.redirect(redirectUrl(oauthInfo));
  });

  app.get('/.well-known/public-keys', function (req, res) {
    keyPair.toPublicKeyResponseObject(secretKeyId)
      .then(function (responseObject) {
        res.json({
          keys: [responseObject]
        });
      });
  });

  app.get('/api/oauth', function(req, res) {
    var state = req.query.state;
    var code = req.query.code;
    var error = parseInt(req.query.error, 10);

    // The user finished the flow in a different browser.
    // Prompt them to log in again
    if (error === DIFFERENT_BROWSER_ERROR) {
      return res.redirect('/?oauth_incomplete=true');
    }

    // state should exists in our set of active flows and the user should
    // have a cookie with that state
    if (code && state && state in oauthFlows && state === req.session.state) {
      delete oauthFlows[state];
      delete req.session.state;

      request.post({
        uri: config.oauth_uri + '/token',
        json: {
          code: code,
          client_id: config.client_id,
          client_secret: config.client_secret
        }
      }, function(err, r, body) {
        if (err) {
          return res.send(r.status, err);
        }

        console.log(err, body); //eslint-disable-line no-console
        req.session.scopes = body.scopes;
        req.session.token_type = body.token_type;
        var token = req.session.token = body.access_token;

        // store the bearer token
        //db.set(code, body.access_token);

        request.get({
          uri: config.profile_uri + '/profile',
          headers: {
            Authorization: 'Bearer ' + token
          }
        }, function (err, r, body) {
          console.log(err, body); //eslint-disable-line no-console
          if (err || r.status >= 400) {
            return res.send(r ? r.status : 400, err || body);
          }
          var data = JSON.parse(body);
          req.session.email = data.email;
          req.session.uid = data.uid;
          // ensure the redirect goes to the correct place for either
          // the redirect or iframe OAuth flows.
          var referrer = req.get('referrer') || '';
          var isIframe = referrer.indexOf('/iframe') > -1;
          if (isIframe) {
            res.redirect('/iframe');
          } else {
            res.redirect('/');
          }
        });
      });
    } else if (req.session.email) {
      // already logged in
      res.redirect('/');
    } else {

      var msg = 'Bad request ';
      if (!code) {
        msg += ' - missing code';
      }

      if (!state) {
        msg += ' - missing state';
      } else if (!oauthFlows[state]) {
        msg += ' - unknown state';
      } else if (state !== req.session.state) {
        msg += ' - state cookie doesn\'t match';
      }

      res.send(400, msg);
    }
  });

};
