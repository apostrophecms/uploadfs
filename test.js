var uploadfs = require('./uploadfs.js');
var fs = require('fs');
var request = require('request');
var _ = require('underscore');
var async = require('async');

var localOptions = { backend: 'local', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' };

// Supply your own. See s3TestOptions-sample.js
var s3Options = require(__dirname + '/s3TestOptions.js');

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
s3Options.imageSizes = imageSizes;
s3Options.tempPath = tempPath;

localTestStart();

function localTestStart() {
  options = localOptions;
  console.log('Initializing uploadfs for the ' + options.backend + ' backend');
  uploadfs.init(options, function(e) {
    if (e) {
      console.log('uploadfs.init failed:');
      console.log(e);
      process.exit(1);
    }
    testCopyIn();
  });

  function testCopyIn() {
    console.log('testing copyIn');
    uploadfs.copyIn('test.txt', '/one/two/three/test.txt', function(e) {
      if (e) {
        console.log('testCopyIn failed:');
        console.log(e);
        process.exit(1);
      }
      var content = fs.readFileSync('test/one/two/three/test.txt', 'utf8');
      var original = fs.readFileSync('test.txt', 'utf8');
      if (content !== original) {
        console.log('testCopyIn did not copy the file faithfully.');
        process.exit(1);
      }
      testRemove();
    });
  }

  function testRemove() {
    console.log('testing remove');
    uploadfs.remove('/one/two/three/test.txt', function(e) {
      if (e) {
        console.log('testRemove failed:');
        console.log(e);
        process.exit(1);
      }
      if (fs.existsSync('test/one/two/three/test.txt')) {
        console.log('testRemove did not remove the file.');
        process.exit(1);
      }
      testRmdir();
    });
  }

  function testRmdir() {
    // This is not an issue with s3
    if (options.backend === 's3') {
      return testGetUrl();
    }
    console.log('testing the automatic empty folder cleanup mechanism');
    console.log('Waiting for the automatic empty folder cleanup mechanism to finish.');
    setTimeout(function() {
      if (fs.existsSync('test/one')) {
        console.log('testRmdir saw that test/one still existed.');
        process.exit(1);
      }
      testGetUrl();
    }, 5000);
  }

  function testGetUrl() {
    console.log('testing getUrl');
    var url = uploadfs.getUrl();
    if (url + '/one/two/three/test.txt' !== 'http://localhost:3000/test/one/two/three/test.txt') {
      console.log('testGetUrl did not return the expected URL.');
      process.exit(1);
    }
    testCopyImageIn();
  }

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
      }
      // We already tested remove, just do it to mop up
      uploadfs.remove('/images/profiles/me.jpg', function(e) { });
      _.each(imageSizes, function(size) {
        var name = info.basePath + '.' + size.name + '.jpg';
        var stats = fs.statSync('test' + name);
        if (!stats.size) {
          console.log('Scaled and copied image is empty or missing');
        }
        // We already tested remove, just do it to mop up
        uploadfs.remove(info.basePath + '.' + size.name + '.jpg', function(e) { });
      });
      success();
    });
  }

  function success() {
    console.log('All tests passing.');
    s3TestStart();
  }
}

function s3TestStart() {
  options = s3Options;
  console.log('Initializing uploadfs for the ' + options.backend + ' backend');
  uploadfs.init(options, function(e) {
    if (e) {
      console.log('uploadfs.init failed:');
      console.log(e);
      process.exit(1);
    }
    testCopyIn();
  });

  function testCopyIn() {
    console.log('testing copyIn');
    uploadfs.copyIn('test.txt', '/one/two/three/test.txt', function(e) {
      if (e) {
        console.log('testCopyIn failed:');
        console.log(e);
        process.exit(1);
      }
      var url = uploadfs.getUrl() + '/one/two/three/test.txt';
      var original = fs.readFileSync('test.txt', 'utf8');
      console.log('Waiting 5 seconds for AWS consistency after PUT');
      console.log('(Note: only really required for us-standard region or an update of an existing file)');
      setTimeout(function() {
        request(url, function(err, response, body) {
          if (err || (response.statusCode !== 200)) {
            console.log("Did not get 200 status fetching " + url);
            process.exit(1);
          }
          if (response.headers['content-type'] !== 'text/plain') {
            console.log("Content type is not text/plain");
            process.exit(1);
          }
          if (response.body !== original) {
            console.log("Content not copied faithfully");
            process.exit(1);
          }
          testRemove();
        });
      }, 5000);
    });
  }

  function testRemove() {
    console.log('testing remove');
    uploadfs.remove('/one/two/three/test.txt', function(e) {
      if (e) {
        console.log('testRemove failed:');
        console.log(e);
        process.exit(1);
      }
      console.log('Waiting 5 seconds for AWS consistency after delete');
      console.log('(note: this is not immediately consistent in any region)');
      setTimeout(function() {
        var url = uploadfs.getUrl() + '/one/two/three/test.txt';
        var expectedUrl = 'http://' + options.bucket + '.s3.amazonaws.com/one/two/three/test.txt';
        if (url !== expectedUrl) {
          console.log('URL is not ' + expectedUrl);
          process.exit(1);
        } else {
          console.log('URL is ' + expectedUrl);
        }
        request(url, function(err, response, body) {
          // Amazon currently gives out a 403 rather than a 404 and
          // they could conceivably change that, so just make sure
          // it's an error code
          if (err || (response.statusCode < 400)) {
            console.log('testRemove did not remove the file.');
            process.exit(1);
          } else {
            console.log('File removed.');
          }
          testCopyImageIn();
        });
      }, 5000);
    });
  }

  function testCopyImageIn() {
    console.log('testing copyImageIn');
    // Let copyImageIn supply a file extension
    uploadfs.copyImageIn('test.jpg', '/images/profiles/me', function(e, info) {
      if (e) {
        console.log('testCopyImageIn failed:');
        console.log(e);
        process.exit(1);
      }
      console.log('Waiting 5 seconds for AWS consistency');
      console.log('(Only really necessary in the us-standard region)');
      setTimeout(function() {
        var path = '/images/profiles/me';
        var url = uploadfs.getUrl();

        var paths = [ info.basePath + '.jpg' ];
        paths.push(info.basePath + '.small.jpg');
        paths.push(info.basePath + '.medium.jpg');
        paths.push(info.basePath + '.large.jpg');
        async.map(paths, function(path, callback) {
          request(url + path, function(err, response, body) {
            if (err || (response.statusCode !== 200)) {
              console.log('testCopyImageIn failed');
              console.log(e);
              console.log(response);
              process.exit(1);
            }
            // Just mopping up so the next test isn't a false positive
            uploadfs.remove(path, function(e) {
              if (e) {
                console.log('remove failed');
                console.log(e);
                process.exit(1);
              }
              callback(null);
            });
          });
        }, function(e) {
          if (e) {
            console.log('testCopyImageIn failed');
            console.log(e);
            process.exit(1);
          }
          success();
        });
      }, 5000);
    });
  }

  function success() {
    console.log('All tests passing.');
    process.exit(0);
  }
}
