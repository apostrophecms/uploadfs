var azure = require('azure-storage');
var contentTypes = require('./contentTypes');
var extname = require('path').extname;
var gzipme = require('gzipme');

module.exports = function() {
  var blobSvc;
  var container;

  var self = {
    init: function(options, callback) {

      blobSvc   = azure.createBlobService(options.account, options.key);
      container = options.container;
      blobSvc.createContainerIfNotExists(container, function(error, result, response) {
        if (error) {
          console.error('error azure container', error);
        } else {
          blobSvc.setContainerAcl(container, null, { publicAccessLevel : 'container' }, function(error, result, response) {
            if (error) {
              console.error('error azure publicAccessLevel', error);
            }
          });

          blobSvc.getServiceProperties(function(error, result, response) {
            if (error) {
              console.error('error azure getServiceProperties', error);
            }

            var serviceProperties = result;
            var allowedOrigins    = options.allowedOrigins  || ['*'];
            var allowedMethods    = options.allowedMethods  || ['GET', 'PUT', 'POST'];
            var allowedHeaders    = options.allowedHeaders  || ['*'];
            var exposedHeaders    = options.exposedHeaders  || ['*'];
            var maxAgeInSeconds   = options.maxAgeInSeconds || 500;

            serviceProperties.Cors = {
              CorsRule: [
                {
                  AllowedOrigins:  allowedOrigins,
                  AllowedMethods:  allowedMethods,
                  AllowedHeaders:  allowedHeaders,
                  ExposedHeaders:  exposedHeaders,
                  MaxAgeInSeconds: maxAgeInSeconds
                }
              ]
            };

            blobSvc.setServiceProperties(serviceProperties, function(error, result, response) {
              if (error) {
                console.error('error azure setServiceProperties', error);
              }
            });
          });
        }
      });

      return callback(null);
    },

    copyIn: function(localPath, path, options, callback) {
      var extension = extname(localPath).substring(1)

      gzipme(localPath, false, 'best', () => {
        path = path[0] === '/' ? path.slice(1) : path;

        blobSvc.createBlockBlobFromLocalFile(
          container,
          path,
          `${localPath}.gz`,
          {
            contentSettings: {
              cacheControl: 'max-age=2628000, public',
              contentEncoding: 'gzip',
              contentType: contentTypes[extension] || 'application/octet-stream'
            }
          },
          function (error, result, response) {
            if (error) {
              console.error('error azure upload file', error);
            }

            return callback(null);
          }
        );
      })
    },

    copyOut: function(path, localPath, options, callback) {
      path = path[0] === '/' ? path.slice(1) : path;

      blobSvc.getBlobToLocalFile(container, path, localPath, function(error, result, response) {
        if (error) {
          console.error('error azure download file', error);
        }

        return callback(null);
      });
    },

    remove: function(path, callback) {
      path = path[0] === '/' ? path.slice(1) : path;

      blobSvc.deleteBlobIfExists(container, path, function(error, result, response) {
        if (error) {
          console.error('error azure remove file', error);
        }

        return callback(null);
      });
    },

    enable: function(path, callback) {

      return callback(null);
    },

    disable: function(path, callback) {

      return callback(null);
    },

    getUrl: function(path) {

      return blobSvc.getUrl(container);
    }
  };

  return self;
};
