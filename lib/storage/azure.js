var azure = require('azure-storage');
var contentTypes = require('./contentTypes');
var extname = require('path').extname;
var fs = require('fs');
var zlib = require('zlib');
var async = require('async');
var utils = require('../utils.js');
var verbose = false;

const gzip = zlib.createGzip();
const DEFAULT_MAX_AGE_IN_SECONDS = 500;
const DEFAULT_MAX_CACHE = 2628000;

function copyBlob(blob, _src, dst, callback) {
  const src = blob.svc.getUrl(blob.container, _src, null);
  blob.svc.startCopyBlob(src, blob.container, dst, callback);
}

function __log() {
  if (verbose) console.error(arguments);
}

/**
 * Set the main properties of the selected container.
 * @param {AzureService} blobSvc Azure service object
 * @param {Object} options Options passed to UploadFS library
 * @param {Object} result Service Properties
 * @param {Function} callback Callback to be called when operation is terminated
 * @return {any} Return the service which has been initialized
 */
function setContainerProperties(blobSvc, options, result, callback) {
  blobSvc.getServiceProperties(function(error, result, response) {
    if (error) {
      return callback(error);
    }
    var serviceProperties = result;
    var allowedOrigins = options.allowedOrigins || ['*'];
    var allowedMethods = options.allowedMethods || ['GET', 'PUT', 'POST'];
    var allowedHeaders = options.allowedHeaders || ['*'];
    var exposedHeaders = options.exposedHeaders || ['*'];
    var maxAgeInSeconds = options.maxAgeInSeconds || DEFAULT_MAX_AGE_IN_SECONDS;

    serviceProperties.Cors = {
      CorsRule: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: allowedMethods,
          AllowedHeaders: allowedHeaders,
          ExposedHeaders: exposedHeaders,
          MaxAgeInSeconds: maxAgeInSeconds
        }
      ]
    };

    blobSvc.setServiceProperties(serviceProperties, function(error, result, response) {
      if (error) {
        return callback(error);
      }
      return callback(null, blobSvc);
    });
  });
}

/**
 * Initialize the container ACLs
 * @param {AzureService} blobSvc Azure Service object
 * @param {String} container Container name
 * @param {Object} options Options passed to UploadFS library
 * @param {Function} callback Callback to be called when operation is terminated
 * @return {any} Returns the result of `setContainerProperties`
 */
function initializeContainer(blobSvc, container, options, callback) {
  blobSvc.setContainerAcl(container, null, { publicAccessLevel: 'container' }, function(error, result, response) {
    if (error) {
      return callback(error);
    }
    return setContainerProperties(blobSvc, options, result, callback);
  });
}

/**
 * Create an Azure Container
 * @param {Object} cluster Azure Cluster Info
 * @param {Object} options Options passed to UploadFS library
 * @param {Function} callback Callback to be called when operation is terminated
 * @return {any} Returns the initialized service
 */
function createContainer(cluster, options, callback) {
  const blobSvc = azure.createBlobService(cluster.account, cluster.key);
  var container = cluster.container || options.container;
  blobSvc.createContainerIfNotExists(container, function(error, result, response) {
    if (error) {
      return callback(error);
    }
    return initializeContainer(blobSvc, container, options, callback);
  });
}

/**
 * Deletes a local file from its path
 * @param {String} path File path
 * @param {Function} callback Callback to be called when operation is terminated
 * @return Always null
 */
function removeLocalBlob(path, callback) {
  fs.unlink(path, function(error) {
    return callback(error);
  });
}

/**
 * Send a binary file to a specified container and a specified service
 * @param {Object} blob Azure Service info and container
 * @param {String} path Remote path
 * @param {String} localPath Local file path
 * @param {Function} callback Callback to be called when operation is terminated
 * @return {any} Result of the callback
 */
function createContainerBlob(blob, path, localPath, callback) {
  const extension = extname(localPath).substring(1);
  blob.svc.createBlockBlobFromLocalFile(
    blob.container,
    path,
    localPath,
    {
      contentSettings: {
        cacheControl: `max-age=${DEFAULT_MAX_CACHE}, public`,
        contentEncoding: 'gzip',
        contentType: contentTypes[extension] || 'application/octet-stream'
      }
    },
    function(error, result, response) {
      return callback(error);
    }
  );
}

/**
 * Remove remote container binary file
 * @param {Object} param0 Azure Service info and container
 * @param {String} path Remote file path
 * @param {Function} callback Callback to be called when operation is terminated
 * @return {any} Result of the callback
 */
function removeContainerBlob(blob, path, callback) {
  blob.svc.deleteBlobIfExists(blob.container, path, function(error, result, response) {
    if (error) {
      __log('Cannot delete ' + path + 'on container ' + blob.container);
    }
    return callback(error);
  });
}

module.exports = function() {
  var blobSvcs = [];

  var self = {
    init: function(options, callback) {
      this.options = options;

      if (!options.replicateClusters || !Array.isArray(options.replicateClusters)) {
        options.replicateClusters = [];
      }
      options.replicateClusters.push({
        account: options.account,
        key: options.key,
        container: options.container
      });
      async.each(options.replicateClusters, function(cluster, cb) {
        createContainer(cluster, options, function(err, svc) {
          if (err) {
            return cb(err);
          }

          blobSvcs.push({
            svc: svc,
            container: cluster.container || options.container
          });

          return cb();
        });
      }, callback);
    },

    cleanupStreams: function (inputStream, outputStream, tempPath, err) {
      async.parallel({
        unlink: cb => {
          removeLocalBlob(tempPath, cb);
        },

        closeReadStream: cb => {
          inputStream.end(cb);
        },

        closeWriteStream: () => {
          outputStream.end(cb);
        }
      }, cleanupError => {
        console.log("Error cleaning up from error", err, cleanupError);
      });
    },

    copyIn: function(localPath, _path, options, callback) {
      const path = _path[0] === '/' ? _path.slice(1) : _path;
      const tmpFileName = Math.random().toString(36).substring(7);
      const tempPath = this.options.tempPath + '/' + tmpFileName;

      let inp = fs.createReadStream(localPath);
      let out = fs.createWriteStream(tempPath);
      let hasError = false;

      inp.on('error', inpErr => {
        console.log("Error in read stream", inpErr);
        if (!hasError) {
          hasError = true;
          cleanupStreams(inp, out, tempPath, inpErr);
        }
      });

      out.on('error', outErr => {
        if (!hasError) {
          hasError = true;
          cleanupStreams(inp, out, tempPath, inpErr);
        }
      });

      out.on('finish', () => {
        async.each(blobSvcs, (blobSvc, cb) => {
          createContainerBlob(blobSvc, path, tempPath, function(createBlobErr) {
            if (createBlobErr) {
              __log('! Cannot create blob in container : ' + createBlobErr);
              cb(createBlobErr);
            }

            removeLocalBlob(tempPath, removeBlobErr => {
              cb(removeBlobErr);
            });
          });
        }, callback);
      });

      inp.pipe(gzip).pipe(out);
    },

    copyOut: function(path, localPath, options, callback) {
      var blob = blobSvcs[0];
      path = path[0] === '/' ? path.slice(1) : path;

      blob.svc.getBlobToLocalFile(blob.container, path, localPath, function(error, result, response) {
        if (error) {
          __log('error azure download file', error);
          return callback(error);
        }

        response.localPath = localPath;

        var returnVal = {
          result: result,
          response: response
        };

        return callback(null, returnVal);
      });
    },

    remove: function(path, callback) {
      path = path[0] === '/' ? path.slice(1) : path;

      async.each(blobSvcs, function(blobSvc, cb) {
        removeContainerBlob(blobSvc, path, cb);
      }, callback);
    },

    disable: function(path, callback) {
      const dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(blobSvcs, function(blob, cb) {
        copyBlob(blob, path, dPath, e => {
          // if copy fails, abort
          if (e) {
            return cb(e);
          } else { // otherwise, remove original file (azure does not currently support rename operations, so we dance)
            self.remove(path, cb);
          }
        });
      }, function(err) {
        callback(err);
      });
    },

    enable: function(path, callback) {
      const dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(blobSvcs, function(blob, cb) {
        copyBlob(blob, dPath, path, e => {
          if (e) {
            return cb(e);
          } else {
            self.remove(dPath, cb);
          }
        });
      }, function(err) {
        callback(err);
      });
    },

    getUrl: function(path) {
      var blob = blobSvcs[0];
      const url = blob.svc.getUrl(blob.container, path);
      return url;
    },

    destroy: function(callback) {
      // No file descriptors or timeouts held
      return callback(null);
    }

  };

  return self;
};
