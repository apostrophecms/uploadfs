var azure = require('azure-storage');
var contentTypes = require('./contentTypes');
var extname = require('path').extname;
var fs = require('fs');
var gzipme = require('gzipme');
var async = require('async')

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
    var allowedMethods = options.allowedMethods || ['GET', 'PUT', 'POST'];
    var allowedHeaders = options.allowedHeaders  || ['*'];
    var exposedHeaders = options.exposedHeaders  || ['*'];
    var maxAgeInSeconds = options.maxAgeInSeconds || 500;

    serviceProperties.Cors = {
      CorsRule: [
        {
          AllowedOrigins : allowedOrigins,
          AllowedMethods : allowedMethods,
          AllowedHeaders : allowedHeaders,
          ExposedHeaders : exposedHeaders,
          MaxAgeInSeconds : maxAgeInSeconds,
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
  blobSvc.setContainerAcl(container, null, { publicAccessLevel : 'container' }, function(error, result, response) {
    if (error) {
      return callback(error)
    }
    return setContainerProperties(blobSvc, options, result, callback)
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
  var container = cluster.container || options.container
  blobSvc.createContainerIfNotExists(container, function(error, result, response) {
    if (error) {
      return callback(error)
    }
    return initializeContainer(blobSvc, container, options, callback)
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
    return callback(error)
  })
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
  var extension = extname(localPath).substring(1)
  blob.svc.createBlockBlobFromLocalFile(
    blob.container,
    path,
    localPath + '.gz',
    {
      contentSettings: {
        cacheControl: 'max-age=2628000, public',
        contentEncoding: 'gzip',
        contentType: contentTypes[extension] || 'application/octet-stream'
      }
    },
    function(error, result, response) {
      return callback(error)
    }
  )
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
      console.error('Cannot delete ' + path + 'on container ' + blob.container)
    }
    return callback(error)
  })
}

module.exports = function() {

  var blobSvcs = [];

  var self = {
    init: function(options, callback) {

      if (!options.replicateClusters || !Array.isArray(options.replicateClusters)) {
        options.replicateClusters = []
      }
      options.replicateClusters.push({
        account : options.account,
        key : options.key,
        container : options.container,
      })
      async.each(options.replicateClusters, function(cluster, cb) {
        createContainer(cluster, options, function(err, svc) { 
          if (err) {
            return cb(err)
          }
          blobSvcs.push({
            svc : svc,
            container : cluster.container || options.container,
          })
          return cb()
        })
      }, callback);
    },

    copyIn: function(localPath, path, options, callback) {
      gzipme(localPath, false, 'best', function() {
        path = path[0] === '/' ? path.slice(1) : path;
        async.each(blobSvcs, function(blobSvc, cb) {
          createContainerBlob(blobSvc, path, localPath, function(err) {
            if (err) {
              console.error('! Cannot create blob in container : ' + err)
            }
            cb(err)
          })
        }, function(err) {
          if (err) {
            console.error('Cannot create blobs in container: ' + err)
            return callback(err)
          }
          removeLocalBlob(localPath + '.gz', callback)
        })
      })
    },

    copyOut: function(path, localPath, options, callback) {
      var blob = blobSvcs[0]
      path = path[0] === '/' ? path.slice(1) : path;

      blob.svc.getBlobToLocalFile(blob.container, path, localPath, function(error, result, response) {
        if (error) {
          console.error('error azure download file', error);
        }

        return callback(null);
      });
    },

    remove: function(path, callback) {
      path = path[0] === '/' ? path.slice(1) : path;
      
      async.each(blobSvcs, function(blobSvc, cb) {
        removeContainerBlob(blobSvc, path, cb)
      }, callback)
    },

    enable: function(path, callback) {

      return callback(null);
    },

    disable: function(path, callback) {

      return callback(null);
    },

    getUrl: function(path) {
      var blob = blobSvcs[0]
      return blob.svc.getUrl(blob.container);
    }
  };

  return self;
};
