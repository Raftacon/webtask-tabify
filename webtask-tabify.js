const Express = require('express');
const Webtask = require('webtask-tools');
const request = require('request');
const url = require('url');
const ugs = require('ultimate-guitar-scraper');
const server = Express();

server.get('/', function (req, res) {
  let clientId = req.webtaskContext.secrets.clientId;
  let clientSecret = req.webtaskContext.secrets.clientSecret;
  let redirectUri = req.webtaskContext.secrets.redirectUri;

  if (req.query.code) {
    // Reach out and exchange authentication code for
    // access token:
    var authCode = req.query.code;

    request({
      url: "https://accounts.spotify.com/api/token",
      method: "POST",
      json: true,
      form: {
        "grant_type": "authorization_code",
        "code": authCode,
        "redirect_uri": redirectUri,
        "client_id": clientId,
        "client_secret": clientSecret
      }
    }, function (e, r, b) {
      if (b.error) { res.redirect(redirectUri); } // Attempt to re-auth with a new code or give user a new chance to accept.
      else if (b.access_token) {
        // Retrieve the currently-playing song:
        request({
          url: "https://api.spotify.com/v1/me/player/currently-playing",
          method: "GET",
          json: true,
          headers: {
            "Authorization": "Bearer " + b.access_token
          }
        }, function (e2, r2, b2) {
          if (b2 === undefined) { res.send(JSON.stringify({ "error": "Couldn't find currently-playing song in Spotify." })); }
          else {
            // Use ultimate-guitar-scraper to search for the best-
            // matching tab and redirect user to that URL:
            ugs.search({
              query: b2.item.artists[0].name + " " + b2.item.name,
              page: 1,
              type: ['Tab']
            }, (error, tabs) => {
              var tabButtonHtml = error ? `` : `<a class="button button-primary" href="${tabs[0].url}">Go to Tab</a> `;

              const templateLiteral = `<html><head><title>Tabify :: ${b2.item.artists[0].name} - ${b2.item.name}</title>
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/skeleton/2.0.4/skeleton.min.css"></head>
              <body"><div class="container" style="text-align: center;"><div class="twelve columns"><br><br><br>
              <img src=${b2.item.album.images[1].url}><h5>${b2.item.artists[0].name} - ${b2.item.name}</h5></div><br>
              <div class="twelve columns">${tabButtonHtml}<a class="button button-primary" href="${redirectUri}">Refresh
              </a></div></body></html>`;

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(templateLiteral);
            });
          }
        });
      } else {
        res.writeHead(401);
        res.send(JSON.stringify({
          "error": "Authentication failed, please try again."
        }));
      }
    });
  } else {
    // Redirect the user to grant access to Tabify app (or
    // auto-retrieve code if user has already agreed to access
    // previously):
    res.redirect(url.format({
      pathname: "https://accounts.spotify.com/authorize",
      query: {
        "client_id": clientId,
        "response_type": "code",
        "scope": "user-read-currently-playing",
        "redirect_uri": redirectUri
      }
    }));
  }
});

module.exports = Webtask.fromExpress(server);