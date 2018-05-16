var crypto = require('crypto');
/**
 * Helper functions
 **/
module.exports = {
  // Use an unguessable filename suffix to disable files.
  // This is secure at the web level if the webserver is not
  // configured to serve indexes of files, and it does not impede the
  // use of rsync etc. Used when options.disabledFileKey is set.
  // Use of an HMAC to do this for each filename ensures that even if
  // one such filename is exposed, the others remain secure

  getDisabledPath: function(path, disabledFileKey) {
    var hmac = crypto.createHmac('sha256', disabledFileKey);
    hmac.update(path);
    var disabledPath = path + '-disabled-' + hmac.digest('hex');
    return disabledPath;
  },

  getPathFromDisabledPath: function(path) {
    return path.replace(/-disabled-.*/g, '');
  }
};
