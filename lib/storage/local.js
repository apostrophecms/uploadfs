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
var async = require('async');

module.exports = function() {
  var uploadsPath;
  var uploadsUrl;
  var removeCandidates = [];

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
        var list = removeCandidates;
        // Longest paths first, so we don't try to remove parents before children
        // and wind up never getting rid of the parent
        list.sort(function(a, b) {
          if (a.length > b.length) {
            return -1;
          } else if (a.length < b.length) {
            return 1;
          } else {
            return 0;
          }
        });
        // Building new list for next pass
        removeCandidates = [];
        // Parallelism here just removes things too soon preventing a parent from being removed
        // after a child
        return async.eachSeries(list, function(path, callback) {
          var uploadPath = uploadsPath + path;
          fs.rmdir(uploadPath, function(e) {
            // We're not fussy about the outcome, if it still has files in it we're
            // actually depending on this to fail
            if (!e) {
              // It worked, so try to remove the parent (which will fail if not empty, etc.)
              add(dirname(path));
            }
            return callback(null);
          });
        }, function() {
          // Try again in 1 second, typically removing another layer of parents if empty, etc.
          setTimeout(cleanup, 1000);
        });
        
        function add(path) {
          // Don't remove uploadfs itself
          if (path.length > 1) {
            removeCandidates.push(path);
          }
        }
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
      if (dirname(path).length > 1) {
        removeCandidates.push(dirname(path));
      }
    },

    enable: function(path, callback) {
      // World readable, owner writable. Reasonable since
      // web accessible files are world readable in that
      // sense regardless
      return fs.chmod(uploadsPath + path, options.enablePermissions || parseInt("644", 8), callback);
    },

    disable: function(path, callback) {
      // No access. Note this means you must explicitly
      // enable to get read access back, even with copyFileOut
      return fs.chmod(uploadsPath + path, options.disablePermissions || parseInt("0000", 8), callback);
    },

    getUrl: function() {
      return uploadsUrl;
    }
  };

  return self;
};

