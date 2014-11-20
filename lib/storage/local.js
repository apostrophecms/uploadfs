/* jshint node:true */

// Local filesystem-based backend for uploadfs. See also
// s3.js. The main difference between this backend and just using
// the local filesystem directly is that it creates parent
// folders automatically when they are discovered to be missing,
// and it encourages you to write code that will still work
// when you switch to the s3 backend

var dirname = require('path').dirname;
var fs = require('fs');
var copyFile = require('../copyFile.js');

module.exports = function() {
  var uploadsPath;
  var uploadsUrl;
  var removeCandidates = {};

  var self = {
    init: function(options, callback) {
      uploadsPath = options.uploadsPath;
      if (!uploadsPath) {
        return callback('uploadsPath not set');
      }
      uploadsUrl = options.uploadsUrl;
      if (!uploadsUrl) {
        return callback('uploadsUrl not set');
      }
      // We use a timeout that we reinstall each time rather than
      // an interval to avoid pileups 
      setTimeout(cleanup, 1000);
      return callback(null);

      function cleanup() {
        var list = [];
        // Take a snapshot of the candidates before we do any async stuff
        for (var candidate in removeCandidates) {
          list.push(candidate);
        }
        // Start accumulating new candidates
        removeCandidates = {};
        // Try removing this batch of candidates. An error just means
        // the directory isn't actually empty, which is fine. If we don't
        // get an error, try removing the parent directory on the next pass
        for (var i = 0; (i < list.length); i++) {
          var path = list[i];
          if (path.length <= 1) {
            // Never remove uploadsPath itself
            continue;
          }
          fs.rmdir(uploadsPath + path, function(e) {
            if (!e) {
              removeCandidates[dirname(path)] = true;
            }
          });
        }
        // Try again in 1 second
        setTimeout(cleanup, 1000);
      }
    },

    copyIn: function(localPath, path, options, callback) {
      var uploadPath = uploadsPath + path;
      return copyFile(localPath, uploadPath, callback);
    },

    copyOut: function(path, localPath, options, callback) {
      var downloadPath = uploadsPath + path;
      return copyFile(downloadPath, localPath, callback);
    },

    remove: function(path, callback) {
      var uploadPath = uploadsPath + path;
      fs.unlink(uploadPath, callback);
      removeCandidates[dirname(path)] = true;
    },

    enable: function(path, callback) {
      // World readable, owner writable. Reasonable since
      // web accessible files are world readable in that
      // sense regardless
      return fs.chmod(uploadsPath + path, 0644, callback);
    },

    disable: function(path, callback) {
      // No access. Note this means you must explicitly
      // enable to get read access back, even with copyFileOut
      return fs.chmod(uploadsPath + path, 0, callback);
    },

    getUrl: function() {
      return uploadsUrl;
    }
  };

  return self;
};

