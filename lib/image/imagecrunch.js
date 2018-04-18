/* jshint node:true */

// Process images with the "imagecrunch" utility for MacOS, which we
// built to provide a simple way to transform images on a Mac without
// installing homebrew, macports or the imagemagick binaries for Mac,
// which are busted for PNG and JPEG. "imagecrunch" is actually pretty
// cool - the binary is only 15k and it's fast because it uses Quartz -
// but it is completely Mac-specific. So you should use imagemagick if you are
// serious about matching the exact behavior you'll get when deploying
// to Linux.
//
// Like our imagemagick backend, imagecrunch implicitly autorotates JPEGs
// with an orientation hint, such as iPhone photos.

var childProcess = require('child_process');
var _ = require('lodash');
var async = require('async');
var copyFile = require('../copyFile.js');

module.exports = function() {
  return {
    /**
     * Initialize the module. The current implementation needs no
     * special initialization options.
     */
    init: function(options, callback) {
      return callback(null);
    },

    destroy: function(callback) {
      // No file descriptors or timeouts held
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
     * not the original file extension. Orientation is the string "Undefined" if
     * the file does not specify it or is not a JPEG.
     *
     * Any other properties returned are dependent on the version of ImageMagick used
     * and are not guaranteed.
     *
     * @param {String} path Local filesystem path to image file
     * @param {Function} callback Receives the usual err argument, followed by an
     * object with extension, width, height, orientation, originalWidth and
     * originalHeight properties. Any other properties are not guaranteed.
     *
     * @see Uploadfs#copyImageIn
     */

    identify: function(path, callback) {
      // Identify the file type, size, etc. Stuff them into context.info and
      // context.extension

      var result = {};

      return async.series({
        imagecrunch: function(callback) {
          var args = [ '-info', path ];
          var proc = childProcess.spawn('imagecrunch', args);
          var output = '';
          proc.stdout.on('data', function(data) {
            output += data.toString();
          });
          proc.on('close', function(code) {
            if (code !== 0) {
              return callback(code);
            } else {
              result = JSON.parse(output);
              if (!result) {
                return callback('malformed output from imagecrunch');
              }
              return callback(null);
            }
          });
        }
      }, function(err) {
        return callback(err, result);
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
     * determined by a previous call to identify (required)
     *
     * info.width, info.height: dimensions of original file as determined
     * by a previous call to identify (required)
     *
     * sizes (required): array of objects with width and height properties
     * which are treated as maximums for each axis; the resulting image
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
     * scaledJpegQuality: currently ignored (TODO: implement in imagecrunch)
     *
     * copyOriginal: if true, copy the "original" image to the tempFolder too as
     * original.extension, performing auto-rotation as needed for JPEGs
     * (thus the air-quotes around original).
     *
     * OUTPUT
     *
     * After the operation is complete, the following property of the
     * context object will be set if the copyOriginal option was set:
     *
     * adjustedOriginal: will contain the local filesystem path where the
     * original was copied.
     *
     * @param  {[type]}   context  [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */

    convert: function(context, callback) {
      return async.series({
        // Autorotated "original" copied in if desired

        copyOriginal: function(callback) {
          if (!context.copyOriginal) {
            return callback(null);
          }
          var suffix = 'original.' + context.extension;
          var tempFile = context.tempFolder + '/' + suffix;
          if (context.extension !== 'jpg') {
            // Don't forget to tell the caller that we did the work,
            // even if it was just a copy
            context.adjustedOriginal = tempFile;
            return copyFile(context.workingPath, tempFile, callback);
          }

          var args = [ context.workingPath ];
          if (context.crop) {
            args.push('-crop');
            args.push(context.crop.left);
            args.push(context.crop.top);
            args.push(context.crop.width);
            args.push(context.crop.height);
          }
          args.push('-write');
          args.push(tempFile);
          context.adjustedOriginal = tempFile;

          var proc = childProcess.spawn('imagecrunch', args);
          proc.on('close', function(code) {
            if (code !== 0) {
              return callback(code);
            }
            return callback(null);
          });
        },

        sizes: function(callback) {
          var args = [ context.workingPath ];
          if (context.crop) {
            args.push('-crop');
            args.push(context.crop.left);
            args.push(context.crop.top);
            args.push(context.crop.width);
            args.push(context.crop.height);
          }
          _.each(context.sizes, function(size) {
            args.push('-size');
            args.push(size.width);
            args.push(size.height);

            var suffix = size.name + '.' + context.extension;
            var tempFile = context.tempFolder + '/' + suffix;

            args.push('-write');
            args.push(tempFile);
          });
          var proc = childProcess.spawn('imagecrunch', args);
          proc.on('close', function(code) {
            if (code !== 0) {
              return callback(code);
            } else {
              return callback(null);
            }
          });
        }
      }, callback);
    }
  };
};
