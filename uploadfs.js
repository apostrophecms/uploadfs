var backend;

var self = module.exports = {
  init: function(options, callback) {
    if (!options.backend) {
      return callback("backend must be specified");
    }
    // Load standard backends, by name
    if (typeof(options.backend) === 'string') {
      options.backend = require(__dirname + '/' + options.backend + '.js'); 
    }
    // Custom backends can be passed as objects 
    backend = options.backend;
    return backend.init(options, callback);
  },

  copyIn: function(localPath, path, options, callback) {
    if (typeof(options) === 'function') {
      callback = options;
      options = {};
    }
    return backend.copyIn(localPath, path, options, callback);
  },

  getUrl: function(options, callback) {
    return backend.getUrl(options, callback);
  },

  remove: function(path, callback) {
    return backend.remove(path, callback);
  }
};

