var express       = require('express'),
    https         = require('https'),
    sessions      = require('client-sessions'),
    redis         = require('redis'),
    verify        = require('browserid-verify')(),
    fonts         = require('connect-fonts'),
    font_sugiyama = require('connect-fonts-drsugiyama');

// create a connection to the redis datastore
var db = redis.createClient();

db.on("error", function (err) {
  db = null;
  console.log("redis error!  the server won't actually store anything!  this is just fine for local dev");
});

var app = express.createServer(
  express.logger(),
  express.bodyParser()
);

app.use(require('./retarget.js'));

app.use(fonts.setup({
  allow_origin: "123done.org",
  fonts: [ font_sugiyama ]
}));

app.use(function (req, res, next) {
  if (/^\/api/.test(req.url)) {
    res.setHeader('Cache-Control', 'no-cache, max-age=0');

    return sessions({
      cookieName: '123done',
      secret: process.env['COOKIE_SECRET'] || 'define a real secret, please',
      requestKey: 'session',
      cookie: {
        path: '/api',
        httpOnly: true
      }
    })(req, res, next);
  } else {
    return next();
  }
});

// a function to verify that the current user is authenticated
function checkAuth(req, res, next) {
  if (!req.session.user) {
    res.send("authentication required\n", 401);
  } else {
    next();
  }
}

app.post('/api/verify', function(req, res, next) {
  var assertion = req.body.assertion;
  var audience = 'http://' + req.headers.host;

  verify(assertion, audience, function(err, email, response) {
    if (err) return next(err);

    // if we found a user, set up the session
    if (email) {
      req.session.user = email;
    }

    // send the entire response back to the caller (whether
    // it was successful or not)
    res.send(JSON.stringify(response));
  });
});

// auth status reports who the currently logged in user is on this
// session
app.get('/api/auth_status', function(req, res) {
  res.send(JSON.stringify({
    logged_in_email: req.session.user || null,
  }));
});

// logout clears the current authenticated user
app.post('/api/logout', checkAuth, function(req, res) {
  req.session.user = null;
  res.send(200);
});

// the 'todo/save' api saves a todo list
app.post('/api/todos/save', checkAuth, function(req, res) {
  if (db) db.set(req.session.user, JSON.stringify(req.body));
  res.send(200);
});

// the 'todo/get' api gets the current version of the todo list
// from the server
app.get('/api/todos/get', checkAuth, function(req, res) {
  if (db) {
    db.get(req.session.user, function(err, reply) {
      if (err) {
        res.send(err.toString(), { 'Content-Type': 'text/plain' }, 500);
      } else {
        res.send(reply ? reply : '[]', { 'Content-Type': 'application/json' }, 200);
      }
    });
  } else {
    res.send('[{"v": "Install redis locally for persistent storage, if I want to"}]',
             { 'Content-Type': 'application/json' }, 200);
  }
});


app.use(express.static(__dirname + "/static"));

app.listen(process.env['PORT'] || 8080, '0.0.0.0');
