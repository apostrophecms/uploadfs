var uploadfs = require('./uploadfs.js')();
var fs = require('fs');
var _ = require('lodash');
var async = require('async');

var localOptions = { backend: 'local', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' };

var imageSizes = [
  {
    name: 'full',
    width: 1140,
    height: 1140
  },
  {
    name: 'two-thirds',
    width: 760,
    height: 760
  },
  {
    name: 'one-half',
    width: 570,
    height: 700
  },
  {
    name: 'one-third',
    width: 380,
    height: 700
  },
  // Handy for thumbnailing
  {
    name: 'one-sixth',
    width: 190,
    height: 350
  }
];

var tempPath = __dirname + '/temp';

localOptions.imageSizes = imageSizes;
localOptions.tempPath = tempPath;

var options;

var start = (new Date()).getTime();

async.series({
  init: function(callback) {
    options = localOptions;
    console.log('Initializing uploadfs for the ' + options.backend + ' backend');
    return uploadfs.init(options, function(e) {
      if (e) {
        console.log('uploadfs.init failed:');
        console.log(e);
        process.exit(1);
      }
      return callback(null);
    });
  },
  copyImageIn: function(callback) {

    // Note copyImageIn adds an extension for us
    uploadfs.copyImageIn('test.jpg', '/images/profiles/me', function(e, info) {
      if (e) {
        console.log('testCopyImageIn failed:');
        console.log(e);
        process.exit(1);
      }
      return callback(null);
    });
  }
}, function(err) {
  if (err) {
    console.error('Failed');
    process.exit(1);
  }
  var end = (new Date()).getTime();
  console.log((end - start) + 'ms');
  process.exit(0);
});

