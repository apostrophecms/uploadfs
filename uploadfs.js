var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var fs = require('fs');
var rmRf = require('rimraf');
// Use Aaron Heckmann's graphicsmagick interface in its imagemagick-compatible
// configuration so our system requirements don't change and everything still
// works in Heroku. It's a good thing we can do this, since node-imagemagick
// has been abandoned.
var im = require('gm').subClass({ imageMagick: true });

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

function Uploadfs() {
  var tempPath, backend, imageSizes, orientOriginals = true, scaledJpegQuality, self = this;
  self.init = function (options, callback) {
    if (!options.backend) {
      return callback("backend must be specified");
    }
    // Load standard backends, by name
    if (typeof (options.backend) === 'string') {
      options.backend = require(__dirname + '/' + options.backend + '.js');
    }

    // Reasonable default JPEG quality setting for scaled copies. Imagemagick's default
    // quality is the quality of the original being converted, which is usually a terrible idea
    // when it's a super hi res original. And if that isn't apropos it defaults
    // to 92 which is still sky high and produces very large files

    scaledJpegQuality = options.scaledJpegQuality || 80;

    // Custom backends can be passed as objects
    backend = options.backend;
    imageSizes = options.imageSizes || [];
    if (typeof (options.orientOriginals) !== 'undefined') {
      orientOriginals = options.orientOriginals;
    }

    async.series([
      // create temp folder if needed
      function (callback) {
        if (!imageSizes.length) {
          return callback();
        }
        if (!options.tempPath) {
          return callback("options.tempPath not set");
        }
        tempPath = options.tempPath;
        fs.exists(options.tempPath, function (exists) {
          if (!exists) {
            return fs.mkdir(options.tempPath, callback);
          }
          return callback(null);
        });
      },

      // invoke backend init with options
      function (callback) {
        return backend.init(options, callback);
      }
    ], callback);
  };

  self.copyIn = function (localPath, path, options, callback) {
    if (typeof (options) === 'function') {
      callback = options;
      options = {};
    }
    return backend.copyIn(localPath, path, options, callback);
  };

  // Often useful in conjunction with copyOut
  self.getTempPath = function() {
    return tempPath;
  };

  self.copyOut = function (path, localPath, options, callback) {
    if (typeof (options) === 'function') {
      callback = options;
      options = {};
    }
    return backend.copyOut(path, localPath, options, callback);
  };

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
   * as detected by gm.
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
   * If options.crop is present, the image is cropped according to the
   * top, left, width and height properties of options.crop. All properties must be integers.
   * If cropping is done, it is performed first before scaling.
   *
   * IMPORTANT: if options.crop is present, the uncropped original is
   * NOT copied into uploadfs. The cropped version is what is copied
   * to "path." If you want the uncropped original too, make a separate call
   * to copyIn. A common pattern is to copy the original when an image
   * is first uploaded, and to perform crops and save them under other names
   * later, when a user decides they want cropped versions.
   *
   * Image scaling is performed with imagemagick, which must be installed
   * (note that Heroku provides it). In no case is an image ever scaled to
   * be larger than the original. Scaled versions of images with an orientation
   * hint, such as iPhone photographs, are automatically rotated by gm
   * so that they will display properly in web browsers.
   */

  self.copyImageIn = function (localPath, path, options, callback) {
    if (typeof (options) === 'function') {
      callback = options;
      options = {};
    }

    var context = {};

    context.scaledJpegQuality = options.scaledJpegQuality || scaledJpegQuality;

    // Identify the file type, size, etc. Stuff them into context.info and
    // context.extension
    function identify(path, callback) {
      im(path).identify(function (err, info) {
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

        // Copy certain properties to match the way
        // node-imagemagick returned them to minimize changes
        // to the rest of our code
        context.info.width = context.info.size.width;
        context.info.height = context.info.size.height;
        context.info.orientation = context.info.Orientation;

        context.info.originalWidth = context.info.width;
        context.info.originalHeight = context.info.height;
        var o = context.info.orientation, t;
        if ((o === 'LeftTop') || (o === 'RightTop') || (o === 'RightBottom') || (o === 'LeftBottom')) {
          t = context.info.width;
          context.info.width = context.info.height;
          context.info.height = t;
        }
        // File extension from format, which is GIF, JPEG, PNG
        context.extension = info.format.toLowerCase();
        if (context.extension === 'jpeg') {
          context.extension = 'jpg';
        }
        return callback(null);
      });
    }

    function addCropToPipeline(pipeline) {
      if (options.crop) {
        pipeline.crop(options.crop.width, options.crop.height, options.crop.left, options.crop.top);
      }
    }

    async.series([
      // Identify the file
      function (callback) {
        identify(localPath, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null);
        });
      },
      // make a temporary folder for our work
      function (callback) {
        // Name the destination folder
        context.tempName = generateId();
        // Create destination folder
        if (imageSizes.length) {
          context.tempFolder = tempPath + '/' + context.tempName;
          fs.mkdir(context.tempFolder, callback);
        } else {
          return callback(null);
        }
      },
      // Determine base path and working path
      function (callback) {
        context.basePath = path.replace(/\.\w+$/, '');
        context.workingPath = localPath;
        return callback(null);
      },
      function (callback) {
        if (options.copyOriginal !== false) {
          context.basePath = path.replace(/\.\w+$/, '');
          var originalPath, tempFile;
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

          var orientThis = (orientOriginals && context.info.orientation && (context.info.orientation !== 'TopLeft') && (context.info.orientation !== 'Undefined'));
          var cropThis = options.crop;
          if (orientThis || cropThis) {
            tempFile = context.tempFolder + '/oriented.' + context.extension;
            var pipeline = im(context.workingPath);
            // We let imagemagick preserve the original quality level for rotated "originals"
            // as much as possible, we only apply scaledJpegQuality to scaled versions
            if (orientThis) {
              pipeline.autoOrient();
            }
            if (cropThis) {
              addCropToPipeline(pipeline);
            }
            // Do the actual work in imagemagick
            pipeline.write(tempFile, function(err) {
              if (err) {
                return callback(err);
              }
              async.series([
                function(callback) {
                  if (!cropThis) {
                    return callback(null);
                  }
                  return identify(tempFile, callback);
                },
                function(callback) {
                  return self.copyIn(tempFile, originalPath, options, callback);
                }
              ], callback);
            });
          } else {
            // No imagemagick work to be done
            self.copyIn(context.workingPath, originalPath, options, callback);
          }
        } else {
          callback(null);
        }
      },
      // Scale and copy versions of various sizes
      function (callback) {
        // I use async.mapSeries rather than async.map because the impact
        // of three imagemagick processes running at once is nontrivial and
        // there could be many people uploading. In fact, I need to add a
        // throttling mechanism to delay the launching of extra pipelines
        // at some point

        async.mapSeries(imageSizes, function (size, callback) {
          var suffix = size.name + '.' + context.extension;
          var tempFile = context.tempFolder + '/' + suffix;

          var pipeline = im(context.workingPath);
          pipeline.autoOrient();
          addCropToPipeline(pipeline);
          // Apply the quality setting to scaled JPEGs
          if (context.scaledJpegQuality && (context.extension === 'jpg')) {
            pipeline.quality(context.scaledJpegQuality);
          }

          // Strip any comments and profiles in scaled versions. Sometimes
          // graphics programs or cameras embed HUGE profiles, dwarfing the
          // image itself. You don't need this slowing your downloads.

          // NOTE: this only works with imagemagick... which is fine because
          // we're using imagemagick... but if you are tempted to switch this
          // code to use graphicsmagick, you'll need to make this a no-op.
          pipeline.strip();

          // The '>' means "don't make things bigger
          // than the original, ever." Anyone who does that is bad at the Internet
          pipeline.geometry(size.width, size.height, '>').write(
            tempFile,
            function (err) {
              if (err) {
                return callback(err);
              }
              var permanentFile = context.basePath + '.' + suffix;
              return self.copyIn(tempFile, permanentFile, options, callback);
            }
          );
        }, callback);
      }
    ], function (err) {
      // Try to clean up the temp folder. This can fail if its creation
      // failed, in which case there is nothing we can or should do,
      // thus the empty callback
      if (context.tempFolder) {
        rmRf(context.tempFolder, function (e) { });
      }
      callback(err, err ? null : {
        basePath: context.basePath,
        extension: context.extension,
        width: context.info.width,
        height: context.info.height,
        originalWidth: context.info.originalWidth,
        originalHeight: context.info.originalHeight
      });
    });
  };

  // self.scale = function (pathIn, pathOut, x, y, width, height, options, callback) {
  //   if (typeof (options) === 'function') {
  //     callback = options;
  //     options = {};
  //   }

  //   var context = {};
  //   async.series([
  //   // Copy the file back to local space if it is not in temporary space


  //   ])
  // };

  self.getUrl = function (options, callback) {
    return backend.getUrl(options, callback);
  };

  self.remove = function (path, callback) {
    return backend.remove(path, callback);
  };
}

module.exports = function () {
  return new Uploadfs();
};
