/* jshint node:true */

// Amazon s3-based backend for uploadfs. See also
// local.js.

var fs = require('fs');
var AWS = require('aws-sdk');
var extname = require('path').extname;
var _ = require('lodash');

module.exports = function() {
  var contentTypes;
  var client;
  var cachingTime;
  var https;
  var bucket;

  var self = {
    init: function(options, callback) {
      // knox bc
      var endpoint;
      if (options.secret) {
        options.credentials = new AWS.Credentials(options.key, options.secret, options.token || null);
      }
      bucket = options.bucket;
      options.params = options.params || {};
      options.params.Bucket = options.params.Bucket || options.bucket;
      // bc for the `endpoint`, `secure` and `port` options
      if (options.endpoint) {
        endpoint = options.endpoint;
        if (!endpoint.match(/^https?\:/)) {
          // Infer it like knox would
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
        options.params = options.params || {};
        options.params.endpoint = options.params.endpoint || new AWS.Endpoint(endpoint);
      }
      if (options.agent) {
        options.params = options.params || {};
        options.params.httpOptions = options.params.httpOptions || {};
        options.params.httpOptions.agent = options.params.httpOptions.agent || options.agent;
      }
      client = new AWS.S3(options);
      if (options.contentTypes) {
        contentTypes = options.contentTypes;
      } else {
        contentTypes = require(__dirname + '/contentTypes.js');
      }
      https = options.https;
      cachingTime = options.cachingTime;
      return callback(null);
    },

    copyIn: function(localPath, path, options, callback) {
      var ext = extname(path);
      if (ext.length) {
        ext = ext.substr(1);
      }
      var contentType = contentTypes[ext];
      if (!contentType) {
        contentType = 'application/octet-stream';
      }

      var inputStream = fs.createReadStream(localPath);

      var params = { 
        ACL: 'public-read',
        Key: cleanKey(path),
        Body: inputStream,
        ContentType: contentType
      };

      if (cachingTime) {
        headers['CacheControl'] = 'public, max-age=' + cachingTime;
      }
      
      return client.upload(params, callback);
    },

    copyOut: function(path, localPath, options, callback) {
      var finished = false;
      var outputStream = fs.createWriteStream(localPath);
      var params = {
        Key: cleanKey(path)
      };
      var inputStream = client.getObject(params).createReadStream();
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
      return client.deleteObject({ Key: cleanKey(path) }, callback);
    },

    enable: function(path, callback) {
      return client.putObjectAcl({
        ACL: 'public-read',
        Key: cleanKey(path)
      }, callback);
    },

    disable: function(path, callback) {
      return client.putObjectAcl({
        ACL: 'private',
        Key: cleanKey(path)
      }, callback);
    },

    getUrl: function(path) {
      return (https ? 'https://' : 'http://') + bucket + '.s3.amazonaws.com';
    }
  };
  return self;
};

// Leading slashes were the norm with knox, but
// produce unwanted extra slashes in the URL with
// the AWS SDK.

function cleanKey(key) {
  return key.replace(/^\//, '');
}

