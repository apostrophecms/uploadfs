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
  blobSvc.uploadfsInfo = {
    account: cluster.account,
    container: options.container || cluster.container
  };
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
function createContainerBlob(blob, path, localPath, _gzip, callback) {
  // Draw the extension from uploadfs, where we know they will be using
  // reasonable extensions, not from what could be a temporary file
  // that came from the gzip code. -Tom
  var extension = extname(path).substring(1);
  var contentSettings = {
    cacheControl: `max-age=${DEFAULT_MAX_CACHE}, public`,
    // contentEncoding: _gzip ? 'gzip' : 'deflate',
    contentType: contentTypes[extension] || 'application/octet-stream'
  };
  if (_gzip) {
    contentSettings.contentEncoding = 'gzip';
  }
  blob.svc.createBlockBlobFromLocalFile(
    blob.container,
    path,
    localPath,
    {
      contentSettings: contentSettings
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

// If err is truthy, annotate it with the account and container name
// for the cluster or blobSvc passed, so that error messages can be
// used to effectively debug the right cluster in a replication scenario.
// 'all' can also be passed to indicate all replicas were tried.

function clusterError(cluster, err) {
  // Accept a blobSvc (which acts for a cluster) or a cluster config object,
  // for convenience
  cluster = (cluster.svc && cluster.svc.uploadfsInfo) || cluster;
  if (!err) {
    // Pass through if there is no error, makes this easier to use succinctly
    return err;
  }
  // Allow clusters to be distinguished in error messages. Also report
  // the case where everything was tried (copyOut)
  if (cluster === 'all') {
    err.account = 'ALL';
    err.container = 'ALL';
  } else {
    err.account = cluster.account;
    err.container = cluster.container;
  }
  return err;
}

module.exports = function() {

  var self = {
    blobSvcs: [],
    init: function(options, callback) {
      if (!options.disabledFileKey) {
        return callback(new Error('You must set the disabledFileKey option to a random string when using the azure storage backend.'));
      }
      this.options = options;
      self.gzipBlacklist = self.getGzipBlacklist(options.gzipEncoding || {});

      if (!options.replicateClusters || (!Array.isArray(options.replicateClusters)) || (!options.replicateClusters[0])) {
        options.replicateClusters = [];
        options.replicateClusters.push({
          account: options.account,
          key: options.key,
          container: options.container
        });
      }
      async.each(options.replicateClusters, function(cluster, callback) {
        createContainer(cluster, options, function(err, svc) {
          if (err) {
            return callback(clusterError(cluster, err));
          }

          self.blobSvcs.push({
            svc: svc,
            container: cluster.container || options.container
          });

          return callback();
        });
      }, callback);
    },

    // Implementation detail. Used when stream-based copies fail.
    //
    // Cleans up the streams and temporary files (which can be null),
    // then delivers err to the callback unless something goes wrong in the cleanup itself
    // in which case that error is delivered.

    cleanupStreams: function (inputStream, outputStream, tempPath, tempPath2, err, callback) {
      async.parallel({
        unlink: function(callback) {
          if (!tempPath) {
            return callback(null);
          }
          removeLocalBlob(tempPath, callback);
        },

        unlink2: function(callback) {
          if (!tempPath2) {
            return callback(null);
          }
          removeLocalBlob(tempPath2, callback);
        },

        closeReadStream: function(callback) {
          inputStream.destroy();
          callback();
        },

        closeWriteStream: function(callback) {
          outputStream.destroy();
          callback();
        }
      }, cleanupError => {
        if (err) {
          return callback(err);
        }
        return callback(cleanupError);
      });
    },

    copyIn: function(localPath, _path, options, callback) {
      if (!self.blobSvcs.length) {
        return callback(new Error('At least one valid container must be included in the replicateCluster configuration.'));
      }
      const fileExt = localPath.split('.').pop();
      var path = _path[0] === '/' ? _path.slice(1) : _path;
      var tmpFileName = Math.random().toString(36).substring(7);
      var tempPath = this.options.tempPath + '/' + tmpFileName;
      // options optional
      if (!callback) {
        callback = options;
      }

      if (self.shouldGzip(fileExt)) {
        return self.doGzip(localPath, path, tempPath, callback);
      } else {
        tempPath = localPath; // we don't have a temp path for non-gzipped files
        return self.createContainerBlobs(localPath, path, tempPath, false, callback);
      }
    },

    createContainerBlobs: function(localPath, path, tempPath, _gzip, callback) {
      async.each(self.blobSvcs, function(blobSvc, callback) {
        createContainerBlob(blobSvc, path, tempPath, _gzip, function(createBlobErr) {
          return callback(clusterError(blobSvc, createBlobErr));
        });
      }, function(err) {
        return callback(err);
      });
    },

    doGzip: function(localPath, path, tempPath, callback) {
      var inp = fs.createReadStream(localPath);
      var out = fs.createWriteStream(tempPath);
      var hasError = false;

      inp.on('error', function(inpErr) {
        __log("Error in read stream", inpErr);
        if (!hasError) {
          hasError = true;
          return self.cleanupStreams(inp, out, tempPath, null, inpErr, callback);
        }
      });

      out.on('error', function(outErr) {
        if (!hasError) {
          hasError = true;
          return self.cleanupStreams(inp, out, tempPath, null, outErr, callback);
        }
      });

      out.on('finish', function() {
        self.createContainerBlobs(localPath, path, tempPath, true, callback);
      });
      var gzip = zlib.createGzip();
      inp.pipe(gzip).pipe(out);
    },

    shouldGzip: function(ext) {
      return !self.gzipBlacklist.includes(ext);
    },

    // Tries all replicas before giving up
    copyOut: function(path, localPath, options, callback) {
      if (!self.blobSvcs.length) {
        return callback(new Error('At least one valid container must be included in the replicateCluster configuration.'));
      }
      var index = 0;
      return attempt();

      function attempt(lastErr) {
        if (index >= self.blobSvcs.length) {
          return callback(clusterError('all', lastErr));
        }
        var blob = self.blobSvcs[index++];
        path = path[0] === '/' ? path.slice(1) : path;
        // Temporary name until we know if it is gzipped.
        var initialPath = localPath + '.initial';

        // Get the blob. Then we'll know if it's gzip encoded.
        return blob.svc.getBlobToLocalFile(blob.container, path, initialPath, function(error, result, response) {
          if (error) {
            // Try all replicas before giving up on copyOut
            return attempt(error);
          }

          var returnVal = {
            result: result,
            response: response
          };

          if (result.contentSettings.contentEncoding === 'gzip') {
            // Now we know we need to unzip it.
            return gunzipBlob();
          } else {
            // Simple rename, because it was not gzipped after all.
            fs.renameSync(initialPath, localPath);
            return callback(null, returnVal);
          }

          function gunzipBlob() {
            var out = fs.createWriteStream(localPath);
            var inp = fs.createReadStream(initialPath);
            var gunzip = zlib.createGunzip();
            var errorSeen = false;
            inp.pipe(gunzip);
            gunzip.pipe(out);
            inp.on('error', function(e) {
              fail(e);
            });
            gunzip.on('error', function(e) {
              fail(e);
            });
            out.on('error', function(e) {
              fail(e);
            });
            out.on('finish', function() {
              fs.unlinkSync(initialPath);
              return callback(null, returnVal);
            });
            function fail(e) {
              if (errorSeen) {
                return;
              }
              errorSeen = true;
              return self.cleanupStreams(inp, out, initialPath, localPath, e, callback);
            }
          }
        });
      }
    },

    remove: function(path, callback) {
      if (!self.blobSvcs.length) {
        return callback(new Error('At least one valid container must be included in the replicateCluster configuration.'));
      }
      path = path[0] === '/' ? path.slice(1) : path;

      async.each(self.blobSvcs, function(blobSvc, callback) {
        removeContainerBlob(blobSvc, path, callback);
      }, callback);
    },

    disable: function(path, callback) {
      if (!self.blobSvcs.length) {
        return callback(new Error('At least one valid container must be included in the replicateCluster configuration.'));
      }
      var dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(self.blobSvcs, function(blob, callback) {
        copyBlob(blob, path, dPath, function(e) {
          // if copy fails, abort
          if (e) {
            return callback(clusterError(blob, e));
          } else { // otherwise, remove original file (azure does not currently support rename operations, so we dance)
            self.remove(path, callback);
          }
        });
      }, function(err) {
        callback(err);
      });
    },

    enable: function(path, callback) {
      if (!self.blobSvcs.length) {
        return callback(new Error('At least one valid container must be included in the replicateCluster configuration.'));
      }
      var dPath = utils.getDisabledPath(path, self.options.disabledFileKey);
      async.each(self.blobSvcs, function(blob, callback) {
        copyBlob(blob, dPath, path, function(e) {
          if (e) {
            return callback(clusterError(blob, e));
          } else {
            self.remove(dPath, callback);
          }
        });
      }, function(err) {
        callback(err);
      });
    },

    getUrl: function(path) {
      var blob = self.blobSvcs[0];
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
          prev['whitelist'].push(key);
        } else {
          prev['blacklist'].push(key);
        }
        return prev;
      }, { whitelist: [], blacklist: [] });

      // @NOTE - we REMOVE whitelisted types from the blacklist array
      var gzipBlacklist = defaultGzipBlacklist.concat(blacklist).filter(el => whitelist.indexOf(el));

      return _.uniq(gzipBlacklist);
    }
  };

  return self;
};
