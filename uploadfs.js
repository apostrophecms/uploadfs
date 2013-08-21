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
var childProcess = require('child_process');

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Instantiates Uploadfs.
 * @class Represents an instance of Uploadfs. Usually you only want one.
 */

function Uploadfs() {
  var tempPath, backend, imageSizes, orientOriginals = true, scaledJpegQuality, self = this;
  /**
   * Initialize uploadfs. The init method passes options to the backend and invokes a callback when the backend is ready.
   * @param  {Object}   options: backend, imageSizes, orientOriginals, tempPath, copyOriginal, scaledJpegQuality, contentTypes. backend is the only mandatory option. See the README and individual methods for details.
   * @param  {Function} callback    Will receive the usual err argument
   */
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

  /**
   * The copyIn method takes a local filename and copies it to a path in uploadfs. Any intermediate folders that do not exist are automatically created if the backend requires such things. Just copy things where you want them to go.
   * @param  {[String]}   localPath   The local filename
   * @param  {[String]}   path    The path in uploadfs, begins with /
   * @param  {[Object]}   options    Options (passed to backend). May be skipped
   * @param  {Function} callback    Will receive the usual err argument
   */
  self.copyIn = function (localPath, path, options, callback) {
    if (typeof (options) === 'function') {
      callback = options;
      options = {};
    }
    return backend.copyIn(localPath, path, options, callback);
  };

  /**
   * Obtain the temporary folder used for intermediate files created by copyImageIn. Can also be useful when doing your own manipulations with copyOut.
   * @see Uploadfs#copyOut
   */
  self.getTempPath = function() {
    return tempPath;
  };

  /**
   * The copyOut method takes a path in uploadfs and a local filename and copies the file back from uploadfs to the local filesystem. This should be used only rarely. Heavy reliance on this method sets you up for poor performance in S3. However it may be necessary at times, for instance when you want to crop an image differently later. Use it only for occasional operations like cropping.
   * @param  {String}   path    Path in uploadfs (begins with /)
   * @param  {String}   localPath    Path in the local filesystem to copy to
   * @param  {Object}   options    Options (passed to backend). May be skipped
   * @param  {Function} callback    Receives the usual err argument
   */
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
   *
   * @param {String} localPath    Local filesystem path of existing image file
   * @param {String} path    Path in uploadfs to copy original to. Leave off the extension to autodetect the true type. Path begins with /
   * @param {Object} options Options: scaledJpegQuality, copyOriginal, crop (see above)
   * @param {Function} callback Receives the usual err argument
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
      return self.identifyLocalImage(path, function(err, info) {
        if (err) {
          return callback(err);
        }
        context.info = info;
        context.extension = info.extension;
        return callback(null);
      });
    }

    function addCropToPipeline(pipeline) {
      if (options.crop) {
        pipeline.crop(options.crop.width, options.crop.height, options.crop.left, options.crop.top);
      }
    }

    var originalDone = false;
    var copyOriginal = options.copyOriginal !== false;
    var originalPath;
    var adjustedOriginal = null;

    async.series({
      // Identify the file
      identify: function (callback) {
        return identify(localPath, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null);
        });
      },
      // make a temporary folder for our work
      temporary: function (callback) {
        // Name the destination folder
        context.tempName = generateId();
        // Create destination folder
        if (imageSizes.length) {
          context.tempFolder = tempPath + '/' + context.tempName;
          return fs.mkdir(context.tempFolder, callback);
        } else {
          return callback(null);
        }
      },
      // Determine base path in uploadfs, working path for temporary files,
      // and final uploadfs path of the original
      paths: function (callback) {
        context.basePath = path.replace(/\.\w+$/, '');
        context.workingPath = localPath;

        // Indulge their wild claims about the extension the original
        // should have if any, otherwise provide the truth from identify
        if (path.match(/\.\w+$/)) {
          originalPath = path;
        } else {
          originalPath = path + '.' + context.extension;
        }
        return callback(null);
      },
      copyOriginal: function(callback) {
        // If there are no transformations of the original, copy it
        // in directly
        if ((!copyOriginal) || (options.orientOriginals !== false) || (options.crop)) {
          return callback(null);
        }
        originalDone = true;
        return self.copyIn(localPath, originalPath, options, callback);
      },
      convert: function (callback) {
        // For performance we build our own imagemagick command which tackles all the
        // sizes in one run, avoiding redundant loads. TODO: scale at the beginning to the
        // largest width and base all subsequent scalings off that, which yields an even
        // bigger win.
        //
        // convert arielheadshot.jpg ( +clone -resize x1140 -write /tmp/ariel1140.jpg +delete ) ( +clone -resize x760 -write /tmp/ariel760.jpg +delete ) ( +clone -resize x520 -write /tmp/ariel520.jpg +delete ) ( +clone -resize x380 -write /tmp/ariel380.jpg +delete ) -resize x190 /tmp/ariel190.jpg
        var args = [];
        var crop = options.crop;
        args.push(context.workingPath);
        args.push('-auto-orient');
        if (crop) {
          args.push('-crop');
          args.push(crop.width + 'x' + crop.height + '+' + crop.left + '+' + crop.top);
        }
        if (context.extension === 'jpg') {
          // Always convert to a colorspace all browsers understand.
          // CMYK will flat out fail in IE8 for instance
          args.push('-colorspace');
          args.push('sRGB');
        }

        if (copyOriginal && (!originalDone)) {
          adjustedOriginal = context.tempFolder + '/original.' + context.extension;
          args.push('(');
          args.push('+clone');
          args.push('-write');
          args.push(adjustedOriginal);
          args.push('+delete');
          args.push(')');
        }

        // Make sure we strip metadata before we get to scaled versions as
        // some files have ridiculously huge metadata
        args.push('-strip');

        // After testing this with several sets of developer eyeballs, we've
        // decided it is kosher to resample to the largest size we're
        // interested in keeping, then sample down from there. Since we
        // do it all inside imagemagick without creating any intermediate
        // lossy files, there is no quality loss, and the speed benefit is
        // yet another 2x win! Hooray!
        var maxWidth = 0, maxHeight = 0;
        _.each(imageSizes, function(size) {
          if (size.width > maxWidth) {
            maxWidth = size.width;
          }
          if (size.height > maxHeight) {
            maxHeight = size.height;
          }
        });
        if (maxWidth && maxHeight) {
          args.push('-resize');
          args.push(maxWidth + 'x' + maxHeight + '>');
        }

        _.each(imageSizes, function(size) {
          args.push('(');
          args.push('+clone');
          args.push('-resize');
          args.push(size.width + 'x' + size.height + '>');
          if (context.scaledJpegQuality && (context.extension === 'jpg')) {
            args.push('-quality');
            args.push(context.scaledJpegQuality);
          }
          args.push('-write');
          var suffix = size.name + '.' + context.extension;
          var tempFile = context.tempFolder + '/' + suffix;
          args.push(tempFile);
          args.push('+delete');
          args.push(')');
        });

        // We don't care about the official output, which would be the
        // intermediate scaled version of the image. Use imagemagick's
        // official null format

        args.push('null:');

        var convert = childProcess.spawn('convert', args);
        return convert.on('close', function(code) {
          if (code !== 0) {
            return callback(code);
          } else {
            return callback(null);
          }
        });
      },

      reidentify: function(callback) {
        if (adjustedOriginal) {
          // Push and pop the original size properties as we determined
          // those on the first identify and don't want to return the values
          // for the cropped and/or reoriented version
          var originalWidth = context.info.originalWidth;
          var originalHeight = context.info.originalHeight;
          return identify(adjustedOriginal, function(err) {
            if (err) {
              return callback(err);
            }
            context.info.originalWidth = originalWidth;
            context.info.originalHeight = originalHeight;
            return callback(null);
          });
        }
      },

      copySizes: function(callback) {
        return async.each(imageSizes, function(size, callback) {
          var suffix = size.name + '.' + context.extension;
          var tempFile = context.tempFolder + '/' + suffix;
          var permFile = context.basePath + '.' + suffix;
          return self.copyIn(tempFile, permFile, options, callback);
        }, callback);
      },

      copyAdjustedOriginal: function(callback) {
        if (!adjustedOriginal) {
          return callback(null);
        }
        return self.copyIn(adjustedOriginal, originalPath, options, callback);
      }
    }, function (err) {
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

  self.getUrl = function (options, callback) {
    return backend.getUrl(options, callback);
  };

  self.remove = function (path, callback) {
    return backend.remove(path, callback);
  };

  /**
   * Use ImageMagick to identify a local image file. Normally you don't need to call
   * this yourself, it is mostly used by copyImageIn. But you may find it
   * useful in certain migration situations, so we have exported it.
   *
   * If the file is not an image or is too defective to be identified an error is
   * passed to the callback.
   *
   * Otherwise the second argument to the callback is guaranteed to have extension, width,
   * height, orientation, originalWidth and originalHeight properties. extension will be
   * gif, jpg or png and is detected from the file's true contents, not the original file
   * extension. width and height are automatically rotated to TopLeft orientation while
   * originalWidth and originalHeight are not.
   *
   * Any other properties returned are dependent on the version of ImageMagick used and
   * are not guaranteed.
   *
   * If the orientation property is not explicitly set in the file it will be set to
   * 'Undefined'.
   *
   * @param {String} path Local filesystem path to image file
   * @param {Function} callback Receives the usual err argument, followed by an object with extension, width, height, orientation, originalWidth and originalHeight properties. Any other properties depend on the version of ImageMagick in use and are not guaranteed
   *
   * @see Uploadfs#copyImageIn
   */

  self.identifyLocalImage = function(path, callback) {
    // Identify the file type, size, etc. Stuff them into context.info and
    // context.extension
    im(path).identify(function (err, info) {
      if (err) {
        return callback(err);
      }

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
      info.width = info.size.width;
      info.height = info.size.height;
      info.orientation = info.Orientation;

      info.originalWidth = info.width;
      info.originalHeight = info.height;
      var o = info.orientation, t;
      if ((o === 'LeftTop') || (o === 'RightTop') || (o === 'RightBottom') || (o === 'LeftBottom')) {
        t = info.width;
        info.width = info.height;
        info.height = t;
      }
      // File extension from format, which is GIF, JPEG, PNG
      info.extension = info.format.toLowerCase();
      if (info.extension === 'jpeg') {
        info.extension = 'jpg';
      }
      return callback(null, info);
    });
  };
}

module.exports = function () {
  return new Uploadfs();
};
