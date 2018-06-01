var azure = require('azure-storage');
var contentTypes = require('./contentTypes');
var extname = require('path').extname;
var fs = require('fs');
var zlib = require('zlib');
var async = require('async');
var utils = require('../utils.js');
var defaultGzipBlacklist = require('../../defaultGzipBlacklist');
var verbose = false;
var _ = require('lodash');

var gzip = zlib.createGzip();
var DEFAULT_MAX_AGE_IN_SECONDS = 500;
var DEFAULT_MAX_CACHE = 2628000;

function copyBlob(blob, _src, dst, callback) {
  var src = blob.svc.getUrl(blob.container, _src, null);
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
  var blobSvc = azure.createBlobService(cluster.account, cluster.key);
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
  var extension = extname(localPath).substring(1);
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
      this.options.gzipBlacklist = self.getGzipBlacklist(options.gzipEncoding || {});
  
      if (!options.replicateClusters || !Array.isArray(options.replicateClusters)) {
        options.replicateClusters = [];
        options.replicateClusters.push({
          account: options.account,
          key: options.key,
          container: options.container
        });
      }
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

    cleanupStreams: function (inputStream, outputStream, tempPath, err, callback) {
      async.parallel({
        unlink: function(cb) {
          removeLocalBlob(tempPath, cb);
        },

        closeReadStream: function(cb) {
          inputStream.end(cb);
        },

        closeWriteStream: function(cb) {
          outputStream.end(cb);
        }
      }, function(cleanupError) {
        console.log("Error cleaning up from error", err, cleanupError);
        callback(cleanupError);
      });
    },

    copyIn: function(localPath, _path, options, callback) {
      var path = _path[0] === '/' ? _path.slice(1) : _path;
      var tmpFileName = Math.random().toString(36).substring(7);
      var tempPath = this.options.tempPath + '/' + tmpFileName;

      var inp = fs.createReadStream(localPath);
      var out = fs.createWriteStream(tempPath);
      var hasError = false;

      var self = this;

      inp.on('error', function(inpErr) {
        console.log("Error in read stream", inpErr);
        if (!hasError) {
          hasError = true;
          return self.cleanupStreams(inp, out, tempPath, inpErr, callback);
        }
      });

      out.on('error', function(outErr) {
        if (!hasError) {
          hasError = true;
          return self.cleanupStreams(inp, out, tempPath, outErr, callback);
        }
      });

      out.on('finish', function() {
        async.each(blobSvcs, function(blobSvc, cb) {
          createContainerBlob(blobSvc, path, tempPath, function(createBlobErr) {
            return cb(createBlobErr);
          });
        }, err => {
          removeLocalBlob(tempPath, _err => {
            if (err) {
              return callback(err);
            }
            return callback(_err);
          });
        });
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
      var dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(blobSvcs, function(blob, cb) {
        copyBlob(blob, path, dPath, function(e) {
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
      var dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(blobSvcs, function(blob, cb) {
        copyBlob(blob, dPath, path, function(e) {
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
      var url = blob.svc.getUrl(blob.container, path);
      return url;
    },

    destroy: function(callback) {
      // No file descriptors or timeouts held
      return callback(null);
    },
    
    /**
     * Use sane defaults and user config to get array of file extensions to avoid gzipping
     * @param gzipEncoding {Object} ex: {jpg: true, rando: false} 
     * @retyrb {Array} An array of file extensions to ignore
     */
    getGzipBlacklist: function(gzipEncoding) {
      var gzipSettings = gzipEncoding || {};
      var { whitelist, blacklist } = Object.keys(gzipSettings).reduce((prev, key) => { 
        if (gzipSettings[key]) {
          prev['whitelist'].push(key)
        } else {
         prev['blacklist'].push(key)
        }
        return prev;
      }, { whitelist: [], blacklist: [] });

      console.log('bl', blacklist, 'wh', whitelist, defaultGzipBlacklist);

      // @NOTE - we REMOVE whitelisted types from the blacklist array
      var gzipBlacklist = defaultGzipBlacklist.concat(blacklist).filter(el => whitelist.indexOf(el));

      console.log('gzip blacklist', gzipBlacklist);
      return _.uniq(gzipBlacklist);
    },
  };

  return self;
};
