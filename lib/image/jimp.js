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
        image.exifRotate();

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
      if (context.extension === "gif") {
        // Assuming gifs don't need exifRotate.
        GifUtil.read(context.workingPath)
          .then(spliceGif)
          .then(cropGif)
          .then(copyOriginal)
          .then(sizes)
          .then(function() {
            return callback(null);
          })
          .catch(callback);
      } else {
        Jimp.read(context.workingPath)
          .then(function(image) {
            return image.exifRotate();
          })
          .then(cropImage)
          .then(copyOriginal)
          .then(sizes)
          .then(function() {
            return callback(null);
          })
          .catch(callback);
      }

      // NOTE: Any more than 1 frame and this crawls at the speed of a potato.
      function spliceGif(inputGif) {
        return new Promise(function (resolve, reject) {
          var frame = new GifFrame(inputGif.frames[0]);
          inputGif.frames = [frame];
          return resolve(inputGif);
        })
      }

      function cropGif(inputGif) {
        if (context.crop) {
          return new Promise(function(resolve, reject) {
            var crop = context.crop;
            for (var i = 0; i < inputGif.frames.length(); i++) {
              var crop = context.crop;
              inputGif.frames[i].reframe(
                crop.left,
                crop.top,
                crop.width,
                crop.height
              );
            }
            return resolve(inputGif);
          });
        }
        return Promise.resolve(inputGif);
      }

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
          if (context.extension === "gif") {
            GifUtil.quantizeSorokin(image.frames);
            GifUtil.write(copyPath, image.frames, image).then(function(
              outputGif
            ) {
              return resolve(image);
            });
          } else {
            image.write(copyPath, function(err) {
              return err ? reject(err) : resolve(image);
            });
          }
        });
      }

      function sizes(image) {
        var sizeOperations = context.sizes.map(function(size) {
          return sizeOperation(image, size);
        });
        return Promise.all(sizeOperations);
      }

      function sizeOperation(image, size) {
        // console.log("\n===  Resizing", _.startCase(size.name) + "  ===");
        var sizePath = context.tempFolder + '/' + size.name + '.' + context.extension;
        var width = Math.min(size.width, context.extension == 'gif' ? image.width : image.bitmap.width);
        var height = Math.min(size.height, context.extension == 'gif' ? image.height : image.bitmap.height);
        var quality = context.scaledJpegQuality ? context.scaledJpegQuality : 80;

        return new Promise(function(resolve, reject) {
          if (context.extension === "gif") {
            var tempGif = image;
            var f = width / height > tempGif.width / tempGif.height ? height / tempGif.height : width / tempGif.width;
            for (var i = 0; i < tempGif.frames.length; i++) {
              var gFrame = tempGif.frames[i];
              var wOld = gFrame.bitmap.width;
              var jFrame = new Jimp(
                tempGif.width,
                tempGif.height,
                function(e, i) {}
              );
              _.merge(jFrame, gFrame);
              jFrame.scale(f);
              tempGif.frames[i].bitmap = jFrame.bitmap;
            }
            GifUtil.quantizeSorokin(tempGif.frames);
            // var colors = GifUtil.getColorInfo(tempGif.frames, 256);
            // var numColors = colors.indexCount ? colors.indexCount : "More than 256";
            // var dimensions = GifUtil.getMaxDimensions(tempGif.frames);
            // console.log("Max Width:", dimensions.maxWidth, "Max Height:", dimensions.maxHeight, "Number of Colors:", numColors);
            GifUtil.write(sizePath, tempGif.frames, tempGif).then(
              function(outputGif) {
                // console.log(_.startCase(size.name), "resized\nLocation:", sizePath );
                return resolve(null);
              }
            );
          } else {
            return image
              .clone()
              .quality(quality)
              .scaleToFit(width, height)
              .write(sizePath, function (error) {
                return error ? reject(error) : resolve(null);
              });
          }
        });
      }
    }
  };
};
