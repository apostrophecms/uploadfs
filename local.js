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
    return callback(null);
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
      // of cases where they already exist. Try this up to
      // 5 times to guard against rare race conditions with
      // the rmdir mechanism (see remove()).
      if ((e.code === 'ENOENT') && ((!options.afterMkdirp) || (options.afterMkdirp <= 5))) {
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
    // After a random interval to prevent a slamming scenario,
    // attempt to remove the folder. If it is not empty this will 
    // succeed. In that case, try again with the parent folder until 
    // we run out of parents. This will eventually purge all subdirectories 
    // if all files have been removed
    removeDirectoryLaterIfEmpty(dirname(path));
    function removeDirectoryLaterIfEmpty(path) {
      // Don't remove the main upload dir
      if (path.length <= 1) {
        return;
      }
      setTimeout(function() {
        fs.rmdir(uploadsPath + path, function(e) {
          if (!e) {
            removeDirectoryLaterIfEmpty(dirname(path));
          }
        });
      }, Math.random() * 1000 + 1000);
    }
  },

  getUrl: function() {
    return uploadsUrl;
  },

};

