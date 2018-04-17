var uploadfs = require('./uploadfs.js')();
var fs = require('fs');
var request = require('request');
var _ = require('lodash');
var async = require('async');

// Test the imagecrunch image backend, written specifically for Macs

var localOptions = { storage: 'local', image: 'imagemagick', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' };

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
var basePath = '/images/profiles/me';
var testFileSizes = {};

localOptions.imageSizes = imageSizes;
localOptions.tempPath = tempPath;
localOptions.backend = 'local';

localTestStart(function () {
  console.log("RERUN TESTS WITH IMAGEMIN OPTION ENABLED");
  localOptions.imagemin = true;
  localTestStart(function () {
    console.log("Tests, done");
    process.exit(0);
  });
});

// run again with imagemin enabled

function localTestStart(cb) {
  options = localOptions;
  console.log('Initializing uploadfs for the ' + options.backend + ' storage backend with the imagecrunch image backend');
  uploadfs.init(options, function(e) {
    if (e) {
      console.log('uploadfs.init failed:');
      console.log(e);
      process.exit(1);
    }
    console.log('uploadfs.init', this.options);
    testCopyImageIn();
  });

  function testCopyImageIn() {
    console.log('testing copyImageIn');

    // Note copyImageIn adds an extension for us
    uploadfs.copyImageIn('test.jpg', basePath, function(e, info) {
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
        uploadfs.remove('/images/profiles/me.jpg', function(e) { 
        async.each(imageSizes, function(size, callback) {
          var name = info.basePath + '.' + size.name + '.jpg';
          var stats = fs.statSync('test' + name);
          if (!stats.size) {
            console.log('Scaled and copied image is empty or missing (2)');
            process.exit(1);
          }

          // check minned versions again unminned
          if (options.imagemin) {
            testFileSizes[size.name + '_min'] = stats.size;
          } else {
            testFileSizes[size.name]  = stats.size;
          }

          console.log("SIZES", testFileSizes);

          if (testFileSizes[size.name + '_min'] >= testFileSizes[size.name]) {
            console.log('Test fails, minned file should be smaller than unminned');
            process.exit(1);
          } 
          
          // We already tested remove, just do it to mop up
          uploadfs.remove(info.basePath + '.' + size.name + '.jpg', function(e)  {
            callback();
          });
        }, function(err) {
          if (err) {
            console.log("Test failed", err);
            process.exit(1);
          }
          testCopyImageInCrop(cb);
        });
        }); // remove me.jpg
    });
  }

  function testCopyImageInCrop(cb) {
    console.log('testing copyImageIn with cropping');

    // Note copyImageIn adds an extension for us
    // Should grab the flowers
    uploadfs.copyImageIn('test.jpg', '/images/profiles/me-cropped', { crop: { top: 830, left: 890, width: 500, height: 500 } }, function(e, info) {
      if (e) {
        console.log('testCopyImageIn failed:');
        console.log(e);
        process.exit(1);
      }

      if (info.basePath !== '/images/profiles/me-cropped')
      {
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
      uploadfs.remove(`${basePath}-cropped.jpg`, function(e) { 
        async.each(imageSizes, function(size, callback) {
          var name = info.basePath + '.' + size.name + '.jpg';
          var stats = fs.statSync('test' + name);
          if (!stats.size) {
            console.log('Scaled and copied image is empty or missing (2)');
            process.exit(1);
          }
          // We already tested remove, just do it to mop up
          uploadfs.remove(info.basePath + '.' + size.name + '.jpg', function(e) {
            callback(e);  
          });
        }, function (err) {
          if (err) {
            console.log("Remove file fails", err);
            process.exit(1);
          }
          console.log("Files removed");
          cb();
        });
      });
    });
  }

  function testCopyImageInWithImagemin() {
    console.log('testing copyImageIn with Imagemin');
  }
}

