// Amazon s3-based backend for uploadfs. See also
// local.js.

var fs = require('fs');
var knox = require('knox');
var extname = require('path').extname;
var contentTypes;
var client;
var https;
var bucket;

var self = module.exports = {
  init: function(options, callback) {
    client = knox.createClient(options);
    if (options.contentTypes) {
      contentTypes = options.contentTypes;
    } else {
      contentTypes = require(__dirname + '/contentTypes.js');
    }
    bucket = options.bucket;
    https = options.https;
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
    client.putFile(localPath, path, { 'x-amz-acl': 'public-read', 'Content-Type': contentType }, callback);
  },

  remove: function(path, callback) {
    client.deleteFile(path, function(err, res) {
      callback(err);
    });
  },

  getUrl: function(path) {
    return (https ? 'https://' : 'http://') + bucket + '.s3.amazonaws.com';
  }
};

