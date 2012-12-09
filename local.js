// Local filesystem-based backend for uploadfs. See also
// s3.js. The main difference between this backend and just using
// the local filesystem directly is that it creates parent
// folders automatically when they are discovered to be missing,
// and it encourages you to write code that will still work
// when you switch to the s3 backend 

var mkdirp = require('mkdirp');
var dirname = require('path').dirname;
var fs = require('fs');

var uploadsPath;
var uploadsUrl;
var removeCandidates = {};

var self = module.exports = {
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
    // Other people's implementations of fs.copy() lack
    // error handling, let's be thorough and also implement
    // a retry that does mkdirp() for consistency with S3
    var sin = fs.createReadStream(localPath);
    var sout = fs.createWriteStream(uploadPath);

    sin.on('error', function(e) {
      errorCleanup();
      return callback(e);
    });

    sout.on('error', function(e) {
      // If the destination folder doesn't exist yet,
      // retry the whole thing after recursively creating
      // the folder and its parents as needed, avoiding the
      // overhead of checking for folders in the majority
      // of cases where they already exist. 
      //
      // Try this up to 100 times to guard against race conditions 
      // with the empty directory cleanup mechanism: as long as 
      // there are fewer than 100 node processes running this backend
      // at once, it should not be possible for a sudden burst
      // of rmdir()s to defeat the mkdir() mechanism. 
      //
      // Note that there will only be one node process unless you're using 
      // cluster, multiple Heroku dynos, or something similar. 
      //
      // If you have more than 100 CPU cores bashing on this folder,
      // I respectfully suggest it may be time for the 
      // S3 backend anyway.

      if ((e.code === 'ENOENT') && ((!options.afterMkdirp) || (options.afterMkdirp <= 100))) {
        mkdirp(dirname(uploadPath), function (e) {
          if (e) {
            return callback(e);
          }
          options.afterMkdirp = options.afterMkdirp ? (options.afterMkdirp + 1) : 1;
          return self.copyIn(localPath, path, options, callback);
        });
        return;
      }
      errorCleanup();
      return callback(e);
    });

    sout.on('close', function() {
      return callback();
    });

    // Carry out the actual copying
    sin.pipe(sout);

    function errorCleanup() {
      // These are async methods, provide callbacks although
      // we don't really have any practical steps to take if
      // we somehow can't clean up after an error has 
      // already been caught
      sin.destroy(function(e) { });
      sout.destroy(function(e) { });
      // This will fail if we weren't able to write to 
      // uploadPath in the first place; don't get excited
      fs.unlink(uploadPath, function(e) { });
    }
  },

  remove: function(path, callback) {
    var uploadPath = uploadsPath + path;
    fs.unlink(uploadPath, callback);
    removeCandidates[dirname(path)] = true;
  },

  getUrl: function() {
    return uploadsUrl;
  },

};

