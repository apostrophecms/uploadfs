// Use Aaron Heckmann's graphicsmagick interface in its imagemagick-compatible
// configuration so our system requirements don't change and everything still
// works in Heroku. It's a good thing we can do this, since node-imagemagick
// has been abandoned. We also use our own custom command lines for
// drastically better performance and memory usage.

var im = require('gm').subClass({ imageMagick: true });
var childProcess = require('child_process');
var _ = require('lodash');
var async = require('async');

module.exports = {
  /**
   * Initialize the module. The current implementation needs no
   * special initialization options.
   */
  init: function(options, callback) {
    return callback(null);
  },

  /**
   * Identify a local image file.
   *
   * If the file is not an image or is too defective to be identified an error is
   * passed to the callback.
   *
   * Otherwise the second argument to the callback is guaranteed to have extension,
   * width, height, orientation, originalWidth and originalHeight properties.
   * extension will be gif, jpg or png and is detected from the file's true contents,
   * not the original file extension. With the imagemagick backend, width and height
   * are automatically rotated to TopLeft orientation while originalWidth and
   * originalHeight are not.
   *
   * If the orientation property is not explicitly set in the file it will be set to
   * 'Undefined'.
   *
   * Any other properties returned are dependent on the version of ImageMagick used
   * and are not guaranteed.
   *
   * @param {String} path Local filesystem path to image file
   * @param {Function} callback Receives the usual err argument, followed by an
   * object with extension, width, height, orientation, originalWidth and
   * originalHeight properties. Any other properties depend on the backend in use
   * and are not guaranteed
   *
   * @see Uploadfs#copyImageIn
   */

  identify: function(path, callback) {

    // Identify the file type, size, etc. Stuff them into context.info and
    // context.extension. Also sets context.info.animated to true if
    // an animated GIF is found, which the convert method uses to
    // figure out that it must use a slower algorithm

    var info;

    return async.series({
      identify: function(callback) {
        return im(path).identify(function (err, _info) {
          if (err) {
            return callback(err);
          }

          info = _info;
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
          return callback(null);
        });
      },
      detectAnimation: function(callback) {
        if (info.extension !== 'gif') {
          return callback(null);
        }
        return childProcess.execFile('identify', [ '-format', '%n', path ], {}, function(error, stdout, stderr) {
          if (error) {
            return callback(error);
          }
          var frames = parseInt(stdout.toString('utf8'), 10);
          if (frames > 1) {
            info.animated = true;
          }
          return callback(null);
        });
      }
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, info);
    });
  },

  /**
   * Generate one or more scaled versions of an image file.
   *
   * INPUT
   *
   * The options that may be passed in the context object are:
   *
   * workingPath: path to the original file (required)
   *
   * extension: true file extension of original file as
   * determined by a previous call to identify (required).
   *
   * info.width, info.height: should be provided as other backends may require
   * them, however the imagemagick backend does not need to consult them.
   *
   * sizes (required): array of objects with width and height
   * properties which are treated as maximums for each axis; the resulting image
   * will never exceed the original size, and will otherwise be scaled to
   * fill as much of the requested size as possible without changing the aspect
   * ratio. Files are generated in the temp folder with a filename made up of the
   * name property of the size, a '.', and the extension property of the
   * context object.
   *
   * tempFolder: folder where the scaled versions should be written
   * (required)
   *
   * crop: optional object with top, left, width and height properties
   *
   * scaledJpegQuality: quality setting for JPEGs (optional; otherwise
   * you get whatever default was compiled into imagemagick)
   *
   * copyOriginal: if true, copy the "original" image to the tempFolder too,
   * but do auto-orient it so that iPhone photos etc. work on the web
   *
   * All images, including the "original" if copyOriginal is set, are
   * auto-rotated to the orientation expected by web browsers.
   *
   * OUTPUT
   *
   * After the operation is complete, the following property of the
   * context object will be set if the copyOriginal option was set:
   *
   * adjustedOriginal: will contain the local filesystem path where the
   * original was copied (and rotated, if needed).
   *
   * @param  {[type]}   context  [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */

  convert: function(context, callback) {

    // Separate implementation for animated GIFs because
    // the fast +clone strategy discards all but the first frame ):
    if (context.info.animated && context.extension === 'gif') {
      return convertAnimatedGif(context, callback);
    }

    return convertFast(context, callback);

    function convertFast(context, callback) {
      // For performance we build our own imagemagick command which tackles all the
      // sizes in one run, avoiding redundant loads. We also scale to the largest
      // size we really want first and use that as a basis for all others, without
      // any lossy intermediate files, which is an even bigger win.
      //
      var args = [];
      var crop = context.crop;
      var imageSizes = context.sizes;
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

      if (context.copyOriginal) {
        context.adjustedOriginal = context.tempFolder + '/original.' + context.extension;
        args.push('(');
        args.push('+clone');
        args.push('-write');
        args.push(context.adjustedOriginal);
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

      return spawnThen('convert', args, callback);
    }

    function convertAnimatedGif(context, callback) {
      return async.series({
        original: function(callback) {
          if (!context.copyOriginal) {
            return callback(null);
          }
          var args = [];
          var crop = context.crop;
          args.push(context.workingPath);
          // So optimized animations don't resize strangely.
          // It can produce larger files, but we don't have
          // much choice
          args.push('-coalesce');
          if (crop) {
            args.push('-crop');
            args.push(crop.width + 'x' + crop.height + '+' + crop.left + '+' + crop.top);
            args.push('+repage');
          }
          context.adjustedOriginal = context.tempFolder + '/original.' + context.extension;
          args.push(context.adjustedOriginal);
          return spawnThen('convert', args, callback);
        },
        sizes: function(callback) {
          return async.eachSeries(context.sizes, function(size, callback) {
            var args = [];
            var crop = context.crop;
            args.push(context.workingPath);
            if (crop) {
              // So optimized animations don't resize strangely.
              // It can produce larger files, but we don't have
              // much choice
              args.push('-coalesce');
              args.push('-crop');
              args.push(crop.width + 'x' + crop.height + '+' + crop.left + '+' + crop.top);
              args.push('+repage');
            }
            args.push('-resize');
            args.push(size.width + 'x' + size.height + '>');
            var suffix = size.name + '.' + context.extension;
            var tempFile = context.tempFolder + '/' + suffix;
            args.push(tempFile);
            return spawnThen('convert', args, callback);
          }, callback);
        }
      }, callback);
    }

    function spawnThen(cmd, args, callback) {
      var convert = childProcess.spawn(cmd, args);
      return convert.on('close', function(code) {
        if (code !== 0) {
          return callback(code);
        } else {
          return callback(null);
        }
      });
    }
  }
};
