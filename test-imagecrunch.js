var uploadfs = require('./uploadfs.js')();
var fs = require('fs');
var _ = require('lodash');

// Test the imagecrunch image backend, written specifically for Macs

var localOptions = { storage: 'local', local: 'imagecrunch', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' };

var imageSizes = [
  {
    name: 'small',
    width: 320,
    height: 320
  },
  {
    name: 'medium',
    width: 640,
    height: 640
  },
  {
    name: 'large',
    width: 1140,
    height: 1140
  }
];

var tempPath = __dirname + '/temp';

localOptions.imageSizes = imageSizes;
localOptions.tempPath = tempPath;

localTestStart();

function localTestStart() {
  var options = localOptions;
  console.log('Initializing uploadfs for the ' + options.storage + ' storage backend with the imagecrunch image backend');
  uploadfs.init(options, function(e) {
    if (e) {
      console.log('uploadfs.init failed:');
      console.log(e);
      process.exit(1);
    }
    testCopyImageIn();
  });

  function testCopyImageIn() {
    console.log('testing copyImageIn');

    // Note copyImageIn adds an extension for us
    uploadfs.copyImageIn('test.jpg', '/images/profiles/me', function(e, info) {
      if (e) {
        console.log('testCopyImageIn failed:');
        console.log(e);
        process.exit(1);
      }

      if (info.basePath !== '/images/profiles/me') {
        console.log('info.basePath is incorrect');
        process.exit(1);
      }

      console.log('Testing that returned image dimensions are reoriented');

      if ((info.width !== 1936) || (info.height !== 2592)) {
        console.log('Width and height missing or not reoriented for web use');
        console.log(info);
        process.exit(1);
      }

      if ((info.originalWidth !== 2592) || (info.originalHeight !== 1936)) {
        console.log('Original width and height missing or incorrect');
        console.log(info);
        process.exit(1);
      }

      var stats = fs.statSync('test/images/profiles/me.jpg');
      if (!stats.size) {
        console.log('Copied image is empty or missing');
        process.exit(1);
      }
      // We already tested remove, just do it to mop up
      console.log('Removing files...');
      uploadfs.remove('/images/profiles/me.jpg', function(e) { });
      _.each(imageSizes, function(size) {
        var name = info.basePath + '.' + size.name + '.jpg';
        var stats = fs.statSync('test' + name);
        if (!stats.size) {
          console.log('Scaled and copied image is empty or missing (2)');
          process.exit(1);
        }
        // We already tested remove, just do it to mop up
        uploadfs.remove(info.basePath + '.' + size.name + '.jpg', function(e) { });
      });
      testCopyImageInCrop();
    });
  }

  function testCopyImageInCrop() {
    console.log('testing copyImageIn with cropping');

    // Note copyImageIn adds an extension for us
    // Should grab the flowers
    uploadfs.copyImageIn('test.jpg', '/images/profiles/me-cropped', { crop: { top: 830, left: 890, width: 500, height: 500 } }, function(e, info) {
      if (e) {
        console.log('testCopyImageIn failed:');
        console.log(e);
        process.exit(1);
      }

      if (info.basePath !== '/images/profiles/me-cropped') {
        console.log('info.basePath is incorrect');
        process.exit(1);
      }

      console.log('Testing that returned image dimensions are reoriented');

      if ((info.width !== 500) || (info.height !== 500)) {
        console.log('Reported size does not match crop');
        console.log(info);
        process.exit(1);
      }

      var stats = fs.statSync('test/images/profiles/me-cropped.jpg');
      if (!stats.size) {
        console.log('Copied image is empty or missing');
        process.exit(1);
      }
      // We already tested remove, just do it to mop up
      console.log('Removing files...');
      uploadfs.remove('/images/profiles/me-cropped.jpg', function(e) { });
      _.each(imageSizes, function(size) {
        var name = info.basePath + '.' + size.name + '.jpg';
        var stats = fs.statSync('test' + name);
        if (!stats.size) {
          console.log('Scaled and copied image is empty or missing (2)');
          process.exit(1);
        }
        // We already tested remove, just do it to mop up
        uploadfs.remove(info.basePath + '.' + size.name + '.jpg', function(e) { });
      });
      success();
    });
  }

  function success() {
    console.log('All tests passing.');
    process.exit(0);
  }
}
