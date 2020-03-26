// polyfill Promise if it's not available to support backwards compatablity with ES5
require('es6-promise').polyfill();

var Jimp = require('jimp');

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
     * not the original file extension. With the Jimp backend, width and height
     * are automatically rotated to TopLeft orientation while originalWidth and
     * originalHeight are not.
     *
     * Since Jimp blows away exif data upon saving the orientation property will be set to 'Undefined'.
     *
     * @param {String} path Local filesystem path to image file
     * @param {Function} callback Receives the usual err argument, followed by an
     * object with extension, width, height, orientation, originalWidth and
     * originalHeight properties.
     *
     * @see Uploadfs#copyImageIn
     */

    identify: function(path, callback) {
      return Jimp.read(path, function (err, image) {
        var originalWidth = image.bitmap.width;
        var originalHeight = image.bitmap.height;

        var extension = image.getExtension();
        extension = extension === 'jpeg' ? 'jpg' : extension;

        callback(err, {
          extension: extension,
          width: image.bitmap.width,
          height: image.bitmap.height,
          // Jimp blows away exif data on write, so keeping a reference to the original orientation is not useful
          orientation: 'Undefined',
          originalWidth: originalWidth,
          originalHeight: originalHeight
        });
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
     * info.width, info.height: dimensions of original file as determined
     * by a previous call to identify (required)
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
     * scaledJpegQuality: quality setting for JPEGs (optional; Otherwise a default of 80 is used)
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
      Jimp.read(context.workingPath)
        .then(cropImage)
        .then(copyOriginal)
        .then(sizes)
        .then(function() {
          return callback(null);
        })
        .catch(callback);

      function cropImage(image) {
        if (context.crop) {
          return new Promise(function(resolve, reject) {
            var crop = context.crop;
            return image.crop(
              crop.left,
              crop.top,
              crop.width,
              crop.height,
              function(err) {
                return err ? reject(err) : resolve(image);
              }
            );
          });
        }
        return Promise.resolve(image);
      }

      function copyOriginal(image) {
        if (!context.copyOriginal) {
          return Promise.resolve(image);
        }

        return new Promise(function (resolve, reject) {
          var copyPath = context.tempFolder + '/original.' + context.extension;
          context.adjustedOriginal = copyPath;
          image.write(copyPath, function(err) {
            return err ? reject(err) : resolve(image);
          });
        });
      }

      function sizes(image) {
        var sizeOperations = context.sizes.map(function(size) {
          return sizeOperation(image, size);
        });
        return Promise.all(sizeOperations);
      }

      function sizeOperation(image, size) {
        var sizePath = context.tempFolder + '/' + size.name + '.' + context.extension;
        var width = Math.min(size.width, image.bitmap.width);
        var height = Math.min(size.height, image.bitmap.height);
        var quality = context.scaledJpegQuality ? context.scaledJpegQuality : 80;

        return new Promise(function (resolve, reject) {
          return image
            .clone()
            .quality(quality)
            .scaleToFit(width, height)
            .write(sizePath, function (error) {
              return error ? reject(error) : resolve(null);
            });
        });
      }
    }
  };
};
