// Copy a file reliably, with error handling.
// path1 is the original file, path2 is the new file.
// "options" is used in internal recursive calls and
// may be omitted.
//
// Creates any necessary parent folders of path2 automatically.

var fs = require('fs');
var dirname = require('path').dirname;
var mkdirp = require('mkdirp');

var copy = module.exports = function(path1, path2, options, callback) {
  var failed = false;
  if (!callback) {
    callback = options;
    options = {};
  }
  // Other people's implementations of fs.copy() lack
  // error handling, let's be thorough and also implement
  // a retry that does mkdirp() for consistency with S3
  var sin = fs.createReadStream(path1);
  var sout = fs.createWriteStream(path2);

  sin.on('error', function(e) {
    if (failed) {
      return;
    }
    failed = true;
    errorCleanup();
    return callback(e);
  });

  sout.on('error', function(e) {
    if (failed) {
      return;
    }
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
      mkdirp(dirname(path2), function (e) {
        if (e) {
          return callback(e);
        }
        options.afterMkdirp = options.afterMkdirp ? (options.afterMkdirp + 1) : 1;
        return copy(path1, path2, options, callback);
      });
      return;
    }
    errorCleanup();
    failed = true;
    return callback(e);
  });

  sout.on('close', function() {
    if (failed) {
      // We already reported an error
      return;
    }
    // Report success
    return callback(null);
  });

  // Carry out the actual copying
  sin.pipe(sout);

  function errorCleanup() {
    // This will fail if we weren't able to write to
    // path2 in the first place; don't get excited
    fs.unlink(path2, function(e) { });
  }
};
