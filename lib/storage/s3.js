/* jshint node:true */

// Amazon s3-based backend for uploadfs. See also
// local.js.

const fs = require('fs');
const AWS = require('aws-sdk');
const extname = require('path').extname;
const _ = require('lodash');
const utils = require('../utils');
const { PassThrough } = require('stream');

module.exports = function() {
  let contentTypes;
  let client;
  let cachingTime;
  let https;
  let bucket;
  let bucketObjectsACL;
  let disabledBucketObjectsACL;
  let endpoint;
  let defaultTypes;
  let noProtoEndpoint;
  let pathStyle;
  let noGzipContentTypes;
  let addNoGzipContentTypes;
  const self = {
    init: function (options, callback) {
      // knox bc
      endpoint = 's3.amazonaws.com';
      if (options.secret) {
        options.credentials = new AWS.Credentials(options.key, options.secret, options.token || null);
      }
      bucket = options.bucket;
      bucketObjectsACL = options.bucketObjectsACL || 'public-read';
      disabledBucketObjectsACL = options.disabledBucketObjectsACL || 'private';
      options.params = options.params || {};
      options.params.Bucket = options.params.Bucket || options.bucket;
      noGzipContentTypes = options.noGzipContentTypes || require('./noGzipContentTypes');
      addNoGzipContentTypes = options.addNoGzipContentTypes || [];
      // bc for the `endpoint`, `secure` and `port` options
      if (options.endpoint) {
        endpoint = options.endpoint;
        if (!endpoint.match(/^https?:/)) {
          // Infer it like knox would
          const defaultSecure = ((!options.port) || (options.port === 443));
          const secure = options.secure || defaultSecure;
          let port = options.port || 443;
          const protocol = secure ? 'https://' : 'http://';
          if (secure && (port === 443)) {
            port = '';
          } else if ((!secure) && (port === 80)) {
            port = '';
          } else {
            port = ':' + port;
          }
          endpoint = protocol + endpoint + port;
        }
        options.params = options.params || {};
        options.params.endpoint = options.params.endpoint || new AWS.Endpoint(endpoint);
      }

      // this is to support the knox style attribute OR AWS s3ForcePathStyle attribute
      if (options.style && (options.style === 'path')) {
        options.s3ForcePathStyle = true;
      }
      pathStyle = !!options.s3ForcePathStyle;

      if (options.agent) {
        options.params = options.params || {};
        options.params.httpOptions = options.params.httpOptions || {};
        options.params.httpOptions.agent = options.params.httpOptions.agent || options.agent;
      }
      client = new AWS.S3(options);
      defaultTypes = require('./contentTypes.js');
      if (options.contentTypes) {
        _.extend(contentTypes, defaultTypes, options.contentTypes);
      } else {
        contentTypes = defaultTypes;
      }
      https = (options.https === undefined) ? true : options.https;
      cachingTime = options.cachingTime;
      self.options = options;
      return callback(null);
    },

    copyIn: function(localPath, path, options, callback) {
      let ext = extname(path);
      if (ext.length) {
        ext = ext.substr(1);
      }
      let contentType = contentTypes[ext];
      if (!contentType) {
        contentType = 'application/octet-stream';
      }

      const inputStream = fs.createReadStream(localPath);

      const params = {
        ACL: bucketObjectsACL,
        Key: utils.removeLeadingSlash(self.options, path),
        Body: inputStream,
        ContentType: contentType
      };

      if (gzipAppropriate(contentType)) {
        params.ContentEncoding = 'gzip';
        const gzip = require('zlib').createGzip();
        inputStream.pipe(gzip);
        params.Body = gzip;
      }

      if (cachingTime) {
        params.CacheControl = 'public, max-age=' + cachingTime;
      }

      return client.upload(params, callback);

      function gzipAppropriate(contentType) {
        return !_.includes([ ...noGzipContentTypes, ...addNoGzipContentTypes ], contentType);
      }
    },

    streamOut: function(path, options) {
      const result = new PassThrough();
      let finished = false;
      const params = {
        Key: utils.removeLeadingSlash(self.options, path)
      };
      const request = client.getObject(params);
      let inputStream = request.createReadStream();
      request.on('httpHeaders', function(status, headers) {
        if (headers['content-encoding'] === 'gzip') {
          const gunzip = require('zlib').createGunzip();
          inputStream.pipe(gunzip);
          inputStream = gunzip;
        }
        inputStream.pipe(result);
      });
      return result;
    },

    copyOut: function(path, localPath, options, callback) {
      let finished = false;
      const outputStream = fs.createWriteStream(localPath);
      const inputStream = self.streamOut(path, options);
      inputStream.pipe(outputStream);
      inputStream.on('error', function(err) {
        // Watch out for any oddities in stream implementation
        if (finished) {
          return;
        }
        finished = true;
        return callback(err);
      });
      outputStream.on('error', function(err) {
        // Watch out for any oddities in stream implementation
        if (finished) {
          return;
        }
        finished = true;
        return callback(err);
      });
      outputStream.on('finish', function() {
        // Watch out for any oddities in stream implementation
        if (finished) {
          return;
        }
        finished = true;
        return callback(null);
      });
    },

    remove: function(path, callback) {
      return client.deleteObject({ Key: utils.removeLeadingSlash(self.options, path) }, callback);
    },

    enable: function(path, callback) {
      return client.putObjectAcl({
        ACL: bucketObjectsACL,
        Key: utils.removeLeadingSlash(self.options, path)
      }, callback);
    },

    disable: function(path, callback) {
      return client.putObjectAcl({
        ACL: disabledBucketObjectsACL,
        Key: utils.removeLeadingSlash(self.options, path)
      }, callback);
    },

    getUrl: function (path) {
      let url;
      noProtoEndpoint = endpoint.replace(/^https?:\/\//i, '');
      if (pathStyle) {
        url = (https ? 'https://' : 'http://') + noProtoEndpoint + '/' + bucket;
      } else {
        url = (https ? 'https://' : 'http://') + bucket + '.' + noProtoEndpoint;
      }
      return utils.addPathToUrl(self.options, url, path);
    },

    destroy: function(callback) {
      // No file descriptors or timeouts held
      return callback(null);
    }
  };
  return self;
};
