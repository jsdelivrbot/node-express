var cool = require('cool-ascii-faces');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var exphbs = require('express-handlebars');
var EventEmitter = require('events').EventEmitter;
var sendemail = require('sendemail');
var graph = require('fbgraph');
var session = require('express-session');
var MemoryStore = require('memorystore')(session);
var passport = require('passport'),
    FacebookStrategy = require('passport-facebook').Strategy,
    GoogleStrategy = require('passport-google-oauth20').Strategy;
var fileUpload = require('express-fileupload');
var s3 = require('s3');
var uuidv1 = require('uuid/v1');
var fs = require('fs');
var moment = require('moment');
var marked = require('marked');
var pg = require('pg');
var features = require('./script_modules/features.js');
var async = require('async');
var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// redirect to https

if (process.env.NODE_ENV == "production") {
  app.get('*',function(req,res,next){
    if(req.headers['x-forwarded-proto']!='https')
      res.redirect('https://www.rockworthy.co.za'+req.url)
    else
      next() /* Continue to other routes if we're not redirecting */
  })
}

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(require('express-session')({
  store: new MemoryStore({
    checkPeriod: 86400000
  }),
   secret: 'keyboard cat',
   resave: true,
   saveUninitialized: true,
   cookie: { secure: true } 
  }));

// facebook graph
 graph.get("oauth/access_token?client_id=" + process.env.FACEBOOK_API_ID + "&client_secret=" + process.env.FACEBOOK_APP_SECRET  + "&grant_type=client_credentials", function(error, response) {
  graph.setAccessToken(response['access_token']);
});

// express fileupload
app.use(fileUpload());

// aws.amazon.com S3 Bucket
var client = s3.createClient({
  maxAsyncS3: 20,     // this is the default 
  s3RetryCount: 3,    // this is the default 
  s3RetryDelay: 1000, // this is the default 
  multipartUploadThreshold: 20971520, // this is the default (20 MB) 
  multipartUploadSize: 15728640, // this is the default (15 MB) 
  s3Options: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // any other options are passed to new AWS.S3() 
    // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property 
  },
});

// Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_API_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: "https://www.rockworthy.co.za/auth/facebook/callback"
},

function(accessToken, refreshToken, profile, cb) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM auth_users WHERE id = $1', [profile.id], function(err, result) {
      if (err) {
         console.error(err); 
         response.send("Error " + err); 
      } else if (result.rows[0]) { 
          return cb(null, profile);
      } else {
        var id = profile.id,
            name = profile.displayName,
            provider = profile.provider
        client.query('INSERT INTO auth_users(id, provider, name) VALUES($1, $2, $3) RETURNING *', [profile.id, profile.provider, profile.displayName], function(err, result) {
        })
        return cb(null, profile);
      }
      done();
    });
    pg.end()
    });
  }
));

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://www.rockworthy.co.za/auth/google/callback",
},

function(accessToken, refreshToken, profile, cb) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM auth_users WHERE id = $1', [profile.id], function(err, result) {
      if (err) {
         console.error(err); 
         response.send("Error " + err); 
      } else if (result.rows[0]) { 
          return cb(null, profile);
      } else {
        var id = profile.id,
            name = profile.displayName,
            provider = profile.provider
        client.query('INSERT INTO auth_users(id, provider, name) VALUES($1, $2, $3) RETURNING *', [profile.id, profile.provider, profile.displayName], function(err, result) {
        })
        return cb(null, profile);
      }
      done();
    });
    pg.end()
  });
    
  }
));

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});

app.use(passport.initialize());
app.use(passport.session());

function ensureLoggedIn() {
  return function(req, res, next) {
    // isAuthenticated is set by `deserializeUser()`
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      res.status(401).send({
        success: false,
        message: 'You need to be authenticated to access this page!'
      })
    } else {
      next()
    }
  }
}

// express handlebars
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

// express validate forms
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(expressValidator()); // Add this after the bodyParser middlewares!

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

  var weekend_start,
      mid_weekend,
      weekend_stop

  var dateNow = moment().format("MM-DD-YYYY");
  var weekDay = moment().weekday();
  
  if (weekDay == 4 || weekDay == 1 || weekDay == 2 || weekDay == 3) {
     weekend_start = moment(moment().add(5-weekDay, 'days')).format("MM-DD-YYYY");;
     weekend_stop = moment(moment().add(6-weekDay, 'days')).format("MM-DD-YYYY");;
     mid_weekend = moment(moment().add(7-weekDay, 'days')).format("MM-DD-YYYY");;
  } else if (weekDay == 5) {
     weekend_start = moment().format("MM-DD-YYYY");
     weekend_stop = moment(moment().add(2, 'days')).format("MM-DD-YYYY");
     mid_weekend = moment(moment().add(1, 'days')).format("MM-DD-YYYY"); 
  } else if (weekDay == 6) {
     weekend_start = false;
     weekend_stop = moment(moment().add(1, 'days')).format("MM-DD-YYYY");
     mid_weekend = dateNow
  } else {
     weekend_start = dateNow
     weekend_stop = false;
     mid_weekend = false;
  }

var get_events = function(options, request, response) {

  var event_types = options.event_types,
      host_type = options.host_type,
      main_img = options.main_img,
      cover_text = options.cover_text
  var batchArray = []

  if (event_types.length == 1 && host_type == 'Venue') {
    var query_string = 'SELECT * FROM event_hosts WHERE event_type = ($1)';
  } else if (event_types.length == 4 && host_type == 'Special Event') {
    var query_string = 'SELECT * FROM event_hosts WHERE event_type = $1 AND host_type = $4 OR event_type = $2 AND host_type = $4 OR event_type = $3 AND host_type = $4';    
  } else if (event_types.length == 3) {
    var query_string = 'SELECT * FROM event_hosts WHERE event_type = $1 OR event_type = $2 OR event_type = $3';
  }

  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query(query_string, event_types, function(err, result) {
      if (err)
       { console.error(err); response.send("Error " + err); }
      else { 
         
         for (i=0; i < result.rows.length; i++) {
           batchArray.push(
             {
               method: "GET",
               relative_url: result.rows[i].host_id + "/?fields=events{cover,name,attending_count,ticket_uri,interested_count,start_time,end_time,place}"
             }
           )
         }
         graph.batch(
          batchArray,
           function(error, res) {
          var data = [];
          var events = [];
          if (error) {
            console.log(error);
            res.send('There seems to be an error on the server.' + error);
          } else {
            for (var i=0; i< res.length; i++) {
              data.push(JSON.parse(res[i]['body'])['events']['data']);
            }
            for(var i = 0; i < data.length; i++)
            {
                events = events.concat(data[i]);
            }
            events = events.sort(function(a, b) {
              if (a['attending_count'] > b['attending_count']) {
                return -1;
              } else if ( a['attending_count'] < b['attending_count']) {
                return +1;
              }
              return 0
            })

            response.render('pages/eventsmain', {
              userAuthenticated: !request.isAuthenticated(),
              user: request.user,
              events: events,
              moment: moment,
              main_img: main_img,
              cover_text: cover_text,
              dateNow: dateNow,
              weekDay: weekDay,
              weekend_start: weekend_start,
              mid_weekend: mid_weekend,
              weekend_stop: weekend_stop,
              imgFix: features.imgFix,
              lengthFix: features.lengthFix
            });
          }
      
        });
      }
      done();
    });
    pg.end()
  });
}


app.get('/', function(request, response) {
  get_events({
    event_types: ['Live Shows','Art Exhibition', 'Craft Market'],
    host_type: 'Venue',
    main_img: 'play-69992.jpg',
    cover_text: 'Welcome to Rock Worthy'
  }, request, response);
});

app.get('/live-music', function(request, response) {
  get_events({
    event_types: ['Live Shows'],
    host_type: 'Venue',
    main_img: 'musician-2708190_1920.jpg',
    cover_text: 'Live Music Events'
  }, request, response);
});

app.get('/art-exhibitions', function(request, response) {
  get_events({
    event_types: ['Art Exhibition'],
    host_type: 'Venue',
    main_img: 'statue-2648579_1920.jpg',
    cover_text: 'Art Exhibition Events'
  }, request, response);
});

app.get('/craft-markets', function(request, response) {
  get_events({
    event_types: ['Craft Market'],
    host_type: 'Venue',
    main_img: 'lisbon-2660748_1920.jpg',
    cover_text: 'Craft Market Events'
  }, request, response);
});

app.get('/special-events', function(request, response) {
  get_events({
    event_types: ['Live Shows', 'Art Exhibition', 'Craft Market', 'Special Event'],
    host_type: 'Special Event',
    main_img: 'stainless-2576185_1920.jpg',
    cover_text: 'Special Events'
  }, request, response);
});

app.get('/event/:event_id/detail', function(request, response) {

  graph.get(request.params.event_id + "/?fields=cover,name,ticket_uri,description,attending_count,interested_count,start_time,end_time,place", function(err, res) {
    if (err) {
      response.send("The page requested does not exist." + error);
    } else {
      response.render('pages/detail/event_detail', {event: res, imgFix: features.imgFix, marked: marked, lengthFix: features.lengthFix});
    }
  });

});

app.get('/venues', function(request, response) {
  var batchArray = []

  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM event_hosts WHERE host_type = $1', ['Venue'], function(err, result) {
      if (err)
       { console.error(err); response.send("Error " + err); }
      else { 
         
         for (i=0; i < result.rows.length; i++) {
           batchArray.push(
             {
               method: "GET",
               relative_url: result.rows[i].host_id + "/?fields=fan_count,picture,category,name"
             }
           )
         }
         graph.batch(
          batchArray,
           function(error, res) {
          var data = [];
          var venues = [];
          if (error) {
            console.log(error);
            res.send('There seems to be an error on the server.' + error);
          } else {
            for (var i=0; i< res.length; i++) {
              data.push(JSON.parse(res[i]['body']));
            }
            for(var i = 0; i < data.length; i++)
            {
                venues = venues.concat(data[i]);
            }
            venues = venues.sort(function(a, b) {
              if (a['fan_count'] > b['fan_count']) {
                return -1;
              } else if ( a['fan_count'] < b['fan_count']) {
                return +1;
              }
              return 0
            })
            response.render('pages/venues', {
              venues: venues,
              imgFix: features.imgFix,
              userAuthenticated: !request.isAuthenticated(),
              user: request.user
            });
          }
        });
      }
      done();
    });
    pg.end()
  });

});

app.get('/venue/:venue_id/page', function(request, response) {
  graph.get(request.params.venue_id + "/?fields=cover,events{cover,ticket_uri,name,place,attending_count,interested_count,start_time,end_time},fan_count,picture,category,name", function(err, res) {
    if (err) {
      response.send("The page requested does not exist." + err);
      console.log(err)
    } else {
      response.render('pages/detail/venue_detail', {
        venue: res,
        moment: moment,
        dateNow: dateNow,
        weekDay: weekDay,
        weekend_start: weekend_start,
        mid_weekend: mid_weekend,
        weekend_stop: weekend_stop,
        imgFix: features.imgFix,
        lengthFix: features.lengthFix,
        user: request.user,
        userAuthenticated: !request.isAuthenticated()
      });
    }
  });
});

app.get('/contact', function(request, response) {
  response.render('pages/contact', {formErrors: false, successMsg: false, userAuthenticated: !request.isAuthenticated(), user: request.user});
});

app.post('/contact', function(request, response) {
  request.checkBody('name', 'Invalid name').isAlpha();
  request.checkBody('email', 'Enter an email address').isEmail().withMessage('must be an email'); 
  request.checkBody('query', 'Enter a query').notEmpty(); 
  request.sanitizeBody('name').escape();
  var errors = request.validationErrors();

  var queryUser = { name: request.body.name, email: request.body.email, query: request.body.query};

  if (errors) {
      response.render('pages/contact', {formErrors: errors, successMsg: false, userAuthenticated: !request.isAuthenticated(), user: request.user});
      // Render the form using error information
  } else {

  // email
  var email = sendemail.email;

  var person = {
    name : queryUser.name,
    emailAddress : queryUser.email,
    email: 'info@rockworthy.co.za',
    query: queryUser.query,
    subject:"Query from rockworthy.co.za"
  };

  email('welcome', person, function(error, result){
    if (error) {
      response.send(error);
      // There are no errors so perform action with valid data (e.g. save record).
    } else {
      console.log(' - - - - - - - - - - - - - - - - - - - - -> email sent: ');
      console.log(result);
      console.log(' - - - - - - - - - - - - - - - - - - - - - - - - - - - -')

      response.render('pages/contact', {formErrors: false, successMsg: 'Your query has been sent. We will contact you as soon as possible.', queryUser: false, userAuthenticated: !request.isAuthenticated(), user: request.user});
      // There are no errors so perform action with valid data (e.g. save record).
    }

  });

  }

});

app.get('/about', function(request, response) {
  response.render('pages/about', {userAuthenticated: !request.isAuthenticated(), user: request.user});
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

app.get('/auth/facebook', passport.authenticate('facebook'));

app.get('/auth/google',
passport.authenticate('google', { scope: ['profile'],  }));

app.get('/auth/facebook/callback',
passport.authenticate('facebook', { successRedirect: 'back',
                                    failureRedirect: '/login' }));
app.get('/auth/google/callback',
passport.authenticate('google', { successRedirect: '/',
                                    failureRedirect: '/login' }));

app.get('/logout', function(request, response) {
  request.logout();
  response.redirect('back');
})

app.get('/event-blogs', function(request, response) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM event_blogs', function(err, result) {
      if(err) {
        console.log(err);
        response.send("Error " + error);
      } else {
        response.render('pages/event_blogs', {blogs: result.rows, userAuthenticated: !request.isAuthenticated(), user: request.user});
      }
      done();
    });
    pg.end();
  });
});

app.get('/event-blogs/:blog_id/detail', function(request, response) {

  if (request.isAuthenticated()) {
    pg.connect(process.env.DATABASE_URL, function(err, client, done) {
      client.query('SELECT * FROM user_votes WHERE blog_id=$1 AND user_id=$2', [request.params.blog_id, request.user.id], function(err, result) {
        if (err) {
          console.log(err);
        } else {
          if(result.rows[0]) {
            pg.connect(process.env.DATABASE_URL, function(err, client, done) {
              client.query('SELECT * FROM event_blogs WHERE id=$1', [request.params.blog_id], function(err, result) {
                if (err) {
                  console.log(err);
                } else {
                  response.render('pages/detail/event_blog_detail', {blog: result.rows[0], marked: marked, userAuthenticated: !request.isAuthenticated(), user: request.user, user_voted: true});
                }
                done()
              });
              pg.end();
            });
          } else {
            pg.connect(process.env.DATABASE_URL, function(err, client, done) {
              client.query('SELECT * FROM event_blogs WHERE id=$1', [request.params.blog_id], function(err, result) {
                if (err) {
                  console.log(err);
                } else {
                  response.render('pages/detail/event_blog_detail', {blog: result.rows[0], marked: marked, userAuthenticated: !request.isAuthenticated(), user: request.user, user_voted: false});
                }
                done()
              });
              pg.end();
            });
          }
        }
        done()
      });
      pg.end()
    });

  } else {
    pg.connect(process.env.DATABASE_URL, function(err, client, done) {
      client.query('SELECT * FROM event_blogs WHERE id=$1', [request.params.blog_id], function(err, result) {
        if (err) {
          console.log(err);
        } else {
          response.render('pages/detail/event_blog_detail', {blog: result.rows[0], marked: marked, userAuthenticated: !request.isAuthenticated(), user: request.user, user_voted: false});
        }
        done()
      });
      pg.end()
    });
  }

});

app.get('/api/:blog_id/comments', function(request, response) {

  if (request.isAuthenticated()) {
    var user_id = request.user.id;
    pg.connect(process.env.DATABASE_URL, function(err, client, done) {
      client.query('SELECT id, parent, modified , created, creator, fullname, content, upvote_count, user_has_upvoted, blog_id, created_by_current_user FROM comments WHERE blog_id = $1', [request.params.blog_id], function(err, result) {
        if(err) {
          console.log(err);
        } else {
          pg.connect(process.env.DATABASE_URL, function(err, client, done) {
            client.query('SELECT * FROM comment_votes WHERE user_id = $1', [user_id], function(error, results) {
              if(error) {
                console.log(error)
              } else {
                if (result.rows) {
                  result.rows.forEach(function(main_row) {
                    main_row.parent = parseInt(main_row.parent);
                    main_row.modified = parseInt(main_row.modified);
                    results.rows.forEach(function(row) {
                      if (row.comment_id == main_row.id) {
                        main_row.user_has_upvoted = true;
                      }
                      
                    })
                    
                  })
                  response.send(result.rows);
                } else {
                  response.send(result.rows);
                }
              }
              done()
            })
            pg.end()
          })
          result.rows.forEach(function(main_row) {
            if (main_row.creator == user_id) {
              main_row.created_by_current_user = true;
            }
          })
        }
        done()
      })
      pg.end()
    })

  } else {
    pg.connect(process.env.DATABASE_URL, function(err, client, done) {
      client.query('SELECT id, parent, modified, created, fullname, content, upvote_count, blog_id FROM comments WHERE blog_id = $1', [request.params.blog_id], function(err, result) {
        if(err) {
          console.log(err);
        } else {
          
          if (result.rows) {
            result.rows.forEach(function(row) {
              row.modified = parseInt(row.modified);
              row.parent = parseInt(row.parent);
            });
            response.send(result.rows);
          } else {
            response.send(result.rows);
          }
        }
        done()
      })
      pg.end()
    })
  }

});

app.post('/api/comments/', function(request, response) {
  var user_comment = request.body;
  console.log(request.body);
  if (request.isAuthenticated()) {
    var user_id = request.user.id;
    var user_name = request.user.displayName;
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('INSERT INTO comments(parent, creator, created, content, fullname, blog_id) VALUES($1, $2, $3, $4, $5, $6) RETURNING * ',
         [user_comment.parent,
          user_id,
          user_comment.created,
          user_comment.content,
          user_name,
          user_comment.blog_id],
          function(err, result) {
            if (err) {
              console.log(err);
            } else {
              console.log(result);
              response.redirect('back');
            }
            done();
          })
          pg.end();
      });

  } else {
    response.send('User Not Authenticated.')
  }
  
});

app.post('/api/comments/delete', function(request, response) {
console.log(request.body);
user_comment = request.body;

if (request.isAuthenticated()) {
  var user_id = request.user.id;
  if(user_comment.created_by_current_user == 'true') {

    pg.connect(process.env.DATABASE_URL, function(err, client, done) {
      client.query('SELECT * FROM comments WHERE created = $1 OR parent = $2', [user_comment.created, user_comment.id], function(err, main_result) {
        if (err) {
          console.log(err);
          response.status(500).send('Server Error. Could not delete comment')
        } else {
          pg.connect(process.env.DATABASE_URL, function(err, client, done) {
            client.query('DELETE FROM comments WHERE id = $1 OR parent = $2', [main_result.rows[0].id, parseInt(main_result.rows[0].id)], function(err, results) {
              if (err) {
                console.log(err);
                response.status(500).send('Server Error. Could not delete comment');
              } else {
                pg.connect(process.env.DATABASE_URL, function(err, client, done) {
                  console.log(results)
                  client.query('DELETE FROM comment_votes WHERE comment_id = $1 OR parent = $2', [main_result.rows[0].id, parseInt(main_result.rows[0].id)], function(err, result) {
                    if (err) {
                      console.log(err);
                      response.status(500).send('Server Error. Could not delete comment')
                    } else {
                      console.log(result)
                      response.send('Deleted comment successfully');
                    }
                    done();
                  });
                  pg.end()
                });
              }
              done();
            })
            pg.end();
          })
        }
        done();
      });
      pg.end();
    })

  }
}
});

app.post('/api/comments/edit/', function(request, response) {
  var user_edit = request.body;
  console.log(request.body);

  if (request.isAuthenticated()) {
    var user_id = request.user.id;

    if (user_edit.created_by_current_user == 'true') {
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('SELECT * FROM comments WHERE created = $1', [user_edit.created], function(err, main_result) {
          if (err) {
            console.log(err)
            response.status(500).send('There is a server error.')
          } else {
            console.log(main_result)
            pg.connect(process.env.DATABASE_URL, function(err, client, done) {
              client.query('UPDATE comments SET content = $1, modified = $2 WHERE creator = $3 AND id = $4', [user_edit.content, user_edit.modified, user_id, main_result.rows[0].id], function(err, results) {
                if (err) {
                  console.log(err)
                  response.status(500).send('There is a server error')
                } else {
                  console.log(results)
                  response.send('Comment has been modified.')
                }
                done()
              });
              pg.end()
            });
          }
          done()
        });
        pg.end()
      });
    }
  }
});

app.post('/api/comments/upvotes/', function(request, response) {
  var user_vote = request.body;
  console.log(request.body);
  if (request.isAuthenticated()) {
    var user_id = request.user.id;

    if(user_vote.user_has_upvoted == 'true') {
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('SELECT * FROM comments WHERE created = $1', [user_vote.created], function(err, main_result) {
          if (err) {
            console.log(err)
          } else {
            console.log(main_result)
            pg.connect(process.env.DATABASE_URL, function(err, client, fone) {
              client.query('INSERT INTO comment_votes(user_id, comment_id, has_voted, parent) VALUES($1, $2, $3, $4) RETURNING *', [user_id, main_result.rows[0].id, true, user_vote.parent], function(err, results) {
                if (err) {
                  console.log(err);
                } else {
                  console.log(results);
                  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
                    client.query('UPDATE comments SET upvote_count = upvote_count + 1 WHERE id = $1', [main_result.rows[0].id], function(error, result) {
                      if(error) {
                        console.log(error);
                        response.status(500).send('Upvoted Unsuccessfully: server ERROR')
                      } else {
                        console.log(result);
                        response.send('Upvoted Successfully')
                      }
                      done()
                    });
                    pg.end()
                  });
                  
                }
                done()
              })
              pg.end()
            })
          }
          done()
        })
        pg.end()
      })
    } else {
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('SELECT * FROM comments WHERE created = $1', [user_vote.created], function(err, main_result) {
          if (err) {
            console.log(err);
          } else {
            console.log(main_result)
            pg.connect(process.env.DATABASE_URL, function(err, client, done) {
              client.query('DELETE FROM comment_votes WHERE comment_id = $1 AND user_id = $2', [main_result.rows[0].id, user_id], function(err, results) {
                if(err) {
                  console.log(err);
                } else {
                  console.log(results);
                  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
                    client.query('UPDATE comments SET upvote_count = upvote_count - 1 WHERE id = $1', [main_result.rows[0].id], function(error, result) {
                      if(error) {
                        console.log(error);
                        response.status(500).send('Downvoted Unsuccessfully: server ERROR')
                      } else {
                        console.log(result);
                        response.send('Downvoted Successfully')
                      }
                      done()
                    });
                    pg.end()
                  });
                  
                }
                done()
              })
              pg.end()
            })
          }
        })
      })
    }
  } else {
    console.log('User not authenticated.');
    response.send('User not authenticated.')
  }

});

app.post('/event-blogs/vote', function(request, response) {

  if (request.isAuthenticated()) {

    var upvoteData = {
      id: request.body.id,
      upvoted: request.body.up,
      user_id: request.user.id,
    }
  
    if (upvoteData.upvoted == 'true') {
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('UPDATE event_blogs SET upvotes = upvotes + 1 WHERE id = $1', [upvoteData.id], function(err, result) {
          if (err) {
            console.log(err);
          }
          done();
        });
        pg.end()
      });
  
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('INSERT INTO user_votes(blog_id, user_id, upvoted) VALUES($1, $2, $3) RETURNING * ', [upvoteData.id, upvoteData.user_id, true], function(err, result) {
          if(err) {
            console.log(err);
          }
          done()
        })
      });
      response.send('Upvoted Successfully')
    } else {
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('UPDATE event_blogs SET upvotes = upvotes - 1 WHERE id = $1', [upvoteData.id], function(err, result) {
          if (err) {
            console.log(err);
          }
          done();
        });
        pg.end()
      });
  
      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query('DELETE FROM user_votes WHERE blog_id = $1 AND user_id = $2', [upvoteData.id, upvoteData.user_id], function(err, result) {
          if(err) {
            console.log(err);
          }
          done()
        })
      });
      response.send('Downvoted Successfully')
    }

    console.log(request.body);
  
  } else {
    response.send('User not authenticated.')
  }

});

app.get('/cool', function(request, response) {
  response.send(cool());
});

app.get('/db', function (request, response) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM user_votes', function(err, result) {
      if (err)
       { console.error(err); response.send("Error " + err); }
      else
       { response.render('pages/db', {results: result.rows} ); }

       done();
    });
    pg.end()
  });
});

// Administraion pages

app.get('/admin/upload-blog', function(request, response) {
  response.render('pages/admin/upload_blog', {formErrors: false, successMsg: false});
});

app.post('/admin/upload-blog', function(request, response) {
  request.checkBody('blog_title', 'Enter blog title').notEmpty();
  request.checkBody('author', 'Enter author name').notEmpty(); 
  request.checkBody('description', 'Enter a description').notEmpty(); 
  request.checkBody('content', 'Enter content for blog').notEmpty(); 
  request.sanitizeBody('blog_title').escape();
  var errors = request.validationErrors();

  var blog_data = {
                     blog_title: request.body.blog_title,
                     author: request.body.author,
                     description: request.body.description,
                     content: request.body.content
                  };

  var img_srcs = [];
  var s3link = "https://s3.amazonaws.com/rockworthy/blog_images/";
  
  if (errors) {
    response.render('pages/admin/upload_blog', {formErrors: errors, successMsg: false});
  } else {
    if (!request.files) {
      console.log("No files were uploaded.");
    } else {

        for (key in request.files) {
          if (request.files.hasOwnProperty(key)) {
            if (request.files[key].name) {
              var uuid_image_name  =  uuidv1() + "-" + request.files[key].name;
              request.files[key].mv('tmp/' + uuid_image_name, function(error) {
                if (error) {
                  console.log("MV Error: " + error);
                } 
              });
            } else {
              var uuid_image_name  =  null;
            }
            img_srcs.push(uuid_image_name);
          }
        }

        for (i=0; i<img_srcs.length; i++) {
          if (img_srcs[i] !== null) {
            var params = {
              localFile: "tmp/" + img_srcs[i],
            
              s3Params: {
                Bucket: "rockworthy",
                Key: "blog_images/" + img_srcs[i],
              },
            };
            var uploader = client.uploadFile(params);
            uploader.on('error', function(err) {
              console.error("unable to upload:", err.stack);
            });
            uploader.on('progress', function() {
              console.log("progress", uploader.progressMd5Amount,
                        uploader.progressAmount, uploader.progressTotal);
            });
            uploader.on('end', function() {
              console.log("done uploading");
            });
          }

        }

        for (i=0; i<img_srcs.length; i++) {
          if (img_srcs[i] !== null) { 
            fs.unlink('tmp/' + img_srcs[i], function(err) {
              if (err) {
                console.log(err)
              } else {
                console.log('removed image from server.');
              }
            })
            img_srcs[i] = s3link + img_srcs[i];
          }
        }
        img_srcs.sort()
      }

      pg.connect(process.env.DATABASE_URL, function(err, client, done) {
        client.query(
          'INSERT INTO event_blogs(blog_title, author_name, description, content, img_src, img_src2, img_src3, img_src4) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [blog_data.blog_title,
            blog_data.author,
            blog_data.description,
            blog_data.content,
            img_srcs[0],
            img_srcs[1],
            img_srcs[2],
            img_srcs[3]], function(err, result) {
            console.log(result);
            if (err) {
              console.log(err);
            } else {
              console.log('Event Blog uploaded.')
              response.render('pages/admin/upload_blog', {formErrors: false, successMsg: true});
            }
          done();
        });
        pg.end();
      });
    }
});

app.get('/admin/event-blogs', function(request, response) {
  
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM event_blogs', function(err, result) {
      if (err) {
         console.error(err); response.send("Error " + err); 
      } else {
          response.render('pages/admin/event_blogs', {results: result.rows, successMsg: false} ); 
      }
       done();
    });
    pg.end()
  });
  
});

app.post('/admin/event-blogs', function(request, response) {

  var itemsToDelete = request.body;
  var itemsArray = []
  for (item in itemsToDelete) {
    itemsArray.push(item);
  }

  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('DELETE FROM event_blogs WHERE id = ANY($1)', [itemsArray], function(err, result) {
      if (err) {
         console.error(err); response.send("Error " + err); 
      } else {
        pg.connect(process.env.DATABASE_URL, function(err, client, done) {
          client.query('SELECT * FROM event_blogs', function(err, result) {
            if (err) {
               console.error(err); response.send("Error " + err); 
            } else {
                response.render('pages/admin/event_blogs', {results: result.rows, successMsg: "Selected items have been deleted!"}); 
            }
             done();
          });
          pg.end()
        });
      }
       done();
    });
    pg.end()
  });


});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
