/* jshint node:true */

// Google Cloud Storage backend for uploadfs. See also
// local.js.

var storage = require('@google-cloud/storage');
var extname = require('path').extname;
var _ = require('lodash');

module.exports = function() {
  let contentTypes;
  let client;
  let cachingTime;
  let https;
  let bucketName;
  let endpoint;
  let defaultTypes;
  let noProtoEndpoint;

  const self = {
    init: function (options, callback) {
      if (!(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        callback("GOOGLE_APPLICATION_CREDENTIALS not set in env, cannot proceed");
      }
      // Ultimately the result will look like https://storage.googleapis.com/[BUCKET_NAME]/[OBJECT_NAME]
      // The rest is based mostly on s3 knox surmises.
      endpoint = 'storage.googleapis.com';
      if (options.endpoint) {
        endpoint = options.endpoint;
        if (!endpoint.match(/^https?:/)) {
          var defaultSecure = ((!options.port) || (options.port === 443));
          var secure = options.secure || defaultSecure;
          var port = options.port || 443;
          var protocol = secure ? 'https://' : 'http://';
          if (secure && (port === 443)) {
            port = '';
          } else if ((!secure) && (port === 80)) {
            port = '';
          } else {
            port = ':' + port;
          }
          endpoint = protocol + endpoint + port;
        }
      }
      // The storage client auth relies on the presence of the service account
      // file path expressed in the environment variable
      // GOOGLE_APPLICATION_CREDENTIALS and, of course, the presence of such file.
      //
      //
      // See https://cloud.google.com/docs/authentication/getting-started
      client = new storage.Storage();
      bucketName = options.bucket;
      defaultTypes = require(__dirname + "/contentTypes.js");
      if (options.contentTypes) {
        _.extend(contentTypes, defaultTypes, options.contentTypes);
      } else {
        contentTypes = defaultTypes;
      }
      defaultTypes = require(__dirname + "/contentTypes.js");
      if (options.contentTypes) {
        _.extend(contentTypes, defaultTypes, options.contentTypes);
      } else {
        contentTypes = defaultTypes;
      }
      https = options.https;
      cachingTime = options.cachingTime;
      return callback(null);
    },

    copyIn: function(localPath, path, options, callback) {
      const cleanPath = cleanKey(path);
      let ext = extname(cleanPath);
      if (ext.length) {
        ext = ext.substr(1);
      }
      let contentType = contentTypes[ext];
      if (!contentType) {
        console.log(`unknown extension ${ext}, using mime octet-stream`);
        contentType = 'application/octet-stream';
      }

      let cacheControl = 'no-cache';
      if (cachingTime) {
        cacheControl = 'public, max-age=' + cachingTime;
      }
      const uploadOptions = {
        destination: cleanPath,
        gzip: true,
        public: true,
        metadata: {
          cacheControl: cacheControl,
          ContentType: contentType
        }
      };
      client.bucket(bucketName).upload(localPath, uploadOptions, callback);
    },

    copyOut: function(path, localPath, options, callback) {
      const mergedOptions = _.assign({ destination: cleanKey(localPath) }, options);
      client.bucket(bucketName).file(path).download(mergedOptions, callback);
    },

    remove: function(path, callback) {
      client.bucket(bucketName).file(path).delete({}, callback);
    },

    enable: function(path, callback) {
      client.bucket(bucketName).file(cleanKey(path)).makePublic(callback);
    },

    disable: function(path, callback) {
      client.bucket(bucketName).file(cleanKey(path)).makePrivate({}, callback);
    },

    getUrl: function (path) {
      noProtoEndpoint = endpoint.replace(/^https?:\/\//i, "");
      return (https ? 'https://' : 'http://') + bucketName + '.' + noProtoEndpoint;
    },

    destroy: function(callback) {
      // No file descriptors or timeouts held
      return callback(null);
    }
  };
  return self;
};

// Borrowed from the convention in S3 backend. Not sure it's needed here but it seems OK.

function cleanKey(key) {
  return key.replace(/^\//, '');
}
