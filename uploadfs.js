var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var fs = require('fs');
var rmRf = require('rimraf');
var imagemagick = require('node-imagemagick');

module.exports = function() {
  return new uploadfs();
}

function uploadfs() {
  var tempPath;
  var backend;
  var imageSizes;
  var orientOriginals = true;
  var self = this;
  self.init = function(options, callback) {
    if (!options.backend) {
      return callback("backend must be specified");
    }
    // Load standard backends, by name
    if (typeof(options.backend) === 'string') {
      options.backend = require(__dirname + '/' + options.backend + '.js'); 
    }
    // Custom backends can be passed as objects 
    backend = options.backend;
    imageSizes = options.imageSizes ? options.imageSizes : [];
    if (typeof(options.orientOriginals) !== 'undefined') {
      orientOriginals = options.orientOriginals;
    }

    async.series([ createTempFolderIfNeeded, backendInit ], callback);

    function createTempFolderIfNeeded(callback) {
      if (!imageSizes.length) {
        return callback(); 
      }
      if (!options.tempPath) {
        return callback("options.tempPath not set");
      }
      tempPath = options.tempPath;
      fs.exists(options.tempPath, function(exists) {
        if (!exists) {
          return fs.mkdir(options.tempPath, callback);
        } else {
          return callback(null);
        }
      });
    }

    function backendInit(callback) {
      return backend.init(options, callback);
    }
  },

  self.copyIn = function(localPath, path, options, callback) {
    if (typeof(options) === 'function') {
      callback = options;
      options = {};
    }
    return backend.copyIn(localPath, path, options, callback);
  },

  /**
   * Copy an image into uploadfs. Scaled versions as defined by the imageSizes option
   * at init() time are copied into uploadfs as follows:
   *
   * If 'path' is '/me' and sizes with names 'small', 'medium' and 'large'
   * were defined at init() time, the scaled versions will be:
   *
   * '/me.small.jpg', '/me.medium.jpg', '/me.large.jpg'
   *
   * And the original file will be copied to:
   *
   * '/me.jpg'
   * 
   * Note that a file extension is added automatically. If you provide a
   * file extension in 'path' it will be honored when copying the original only.
   * The scaled versions will get appropriate extensions for their format
   * as detected by Imagemagick.
   *
   * If there is no error the second argument passed to the callback will
   * be an object with a 'basePath' property containing your original path
   * with the file extension removed and an 'extension' property containing
   * the automatically added file extension, as a convenience for locating the
   * original and scaled versions just by adding .jpg, .small.jpg, .medium.jpg, 
   * etc.
   *
   * Scaled versions have the same file format as the original and are no wider
   * or taller than specified by the width and height properties of the
   * corresponding size, with the aspect ratio always being preserved. 
   * If options.copyOriginal is explicitly false, the original image is
   * not copied into uploadfs at all. 
   * 
   * Image scaling is performed with imagemagick, which must be installed
   * (note that Heroku provides it). In no case is an image ever scaled to 
   * be larger than the original. Scaled versions of images with an orientation 
   * hint, such as iPhone photographs, are automatically rotated by imagemagick 
   * so that they will display properly in web browsers. 
   */

  self.copyImageIn = function(localPath, path, options, callback) {
    if (typeof(options) === 'function') {
      callback = options;
      options = {};
    }

    async.series([ identify, makeTempFolder, copyOriginal, scaleAndCopy ], cleanup);

    var context = {};

    function identify(callback) {
      imagemagick.identify(localPath, function(err, info) {
        if (err) {
          return callback(err);
        }
        context.info = info;

        // Imagemagick gives us the raw width and height, but we're
        // going to orient the scaled images and, in most cases, the
        // original image so that they actually display properly in
        // web browsers. So return the oriented width and height
        // to the developer. Also return the original width and
        // height just to be thorough, but use the obvious names
        // for the obvious thing

        context.info.originalWidth = context.info.width;
        context.info.originalHeight = context.info.height;
        var o = context.info.orientation;
        if ((o === 'LeftTop') || (o === 'RightTop') || (o === 'RightBottom') || (o === 'LeftBottom')) {
          var t = context.info.width;
          context.info.width = context.info.height;
          context.info.height = t;
        }

        context.tempName = generateId();
        // File extension from format, which is GIF, JPEG, PNG
        context.extension = info.format.toLowerCase();
        if (context.extension === 'jpeg') {
          context.extension = 'jpg';
        }
        callback(null);
      });
    }

    function makeTempFolder(callback) {
      // Create destination folder
      if (imageSizes.length) {
        context.tempFolder = tempPath + '/' + context.tempName;
        fs.mkdir(context.tempFolder, callback);
      } else {
        return callback(null);
      }
    }

    function copyOriginal(callback) {
      if (options.copyOriginal !== false) {
        context.basePath = path.replace(/\.\w+$/, '');
        var originalPath;
        if (context.basePath !== path) {
          // If there was already an extension, respect it for the original
          originalPath = path;
        } else {
          // Caller did not supply an extension, so add one for the original
          originalPath = context.basePath + '.' + context.extension;
        }

        // By default, if the original would appear "flipped" on the web,
        // we ask imagemagick to reorient it. This is pretty much necessary
        // to make the image useful on a website, but since it's a lossy 
        // operation, we provide an option to disable it

        if (orientOriginals && context.info.orientation && (context.info.orientation !== 'TopLeft'))
        {
          var tempFile = context.tempFolder + '/oriented.' + context.extension;
          imagemagick.convert(
            [ localPath, '-auto-orient', tempFile ],
            function(err) {
              if (err) {
                return callback(err);
              } else {
                return self.copyIn(tempFile, originalPath, options, callback);
              }
            }
          );
        } else {
          self.copyIn(localPath, originalPath, options, callback);
        }
      } else {
        callback(null);
      }
    }

    function scaleAndCopy(callback) {
      // Render scaled versions.
      //
      // I use async.mapSeries rather than async.map because the impact
      // of three imagemagick processes running at once is nontrivial and
      // there could be many people uploading. In fact, I need to add a
      // throttling mechanism to delay the launching of extra pipelines
      // at some point

      async.mapSeries(imageSizes, function(size, callback) {
        var suffix = size.name + '.' + context.extension;
        var tempFile = context.tempFolder + '/' + suffix;

        // Can't use imagemagick.resize convenience method because it doesn't
        // offer -auto-orient, which rotates iPhone photos to the correct
        // orientation before scaling them. The '>' means "don't make things bigger
        // than the original, ever." Anyone who does that is bad at the Internet

        var cmd = [ localPath, '-auto-orient', '-resize', size.width + 'x' + size.height + '>', tempFile ];
        imagemagick.convert(
          cmd,
          function(err) {
            if (err) {
              return callback(err);
            }
            var permanentFile = context.basePath + '.' + suffix;
            return self.copyIn(tempFile, permanentFile, options, callback); 
        });
      }, callback);
    }

    function cleanup(err) {
      // Try to clean up the temp folder. This can fail if its creation
      // failed, in which case there is nothing we can or should do,
      // thus the empty callback
      if (context.tempFolder) {
        rmRf(context.tempFolder, function(e) { });
      }
      callback(err, {
        basePath: context.basePath, 
        extension: context.extension,
        width: context.info.width,
        height: context.info.height,
        originalWidth: context.info.originalWidth,
        originalHeight: context.info.originalHeight
      });
    }
  },

  self.getUrl = function(options, callback) {
    return backend.getUrl(options, callback);
  },

  self.remove = function(path, callback) {
    return backend.remove(path, callback);
  }
};

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

