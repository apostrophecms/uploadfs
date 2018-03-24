/* jshint node:true */

var uploadfs = require('./uploadfs.js')();
var fs = require('fs');
var request = require('request');
var _ = require('lodash');
var async = require('async');
var zlib = require('zlib');

var localOptions = { storage: 'local', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' };

// Supply your own. See s3TestOptions-sample.js
var s3Options = require(__dirname + '/s3TestOptions.js');
var azureOptions = require(__dirname + '/azureTestOptions.js');

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
azureOptions.imageSizes = imageSizes;
azureOptions.tempPath = tempPath;

//localTestStart();
azureTestStart();

function localTestStart() {
  options = localOptions;
  console.log('Initializing uploadfs for the ' + options.storage + ' backend');
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
      testCopyOut();
    });
  }

  function testCopyOut() {
    console.log('testing copyOut');
    uploadfs.copyOut('/one/two/three/test.txt', 'copy-out-test.txt', function(e) {
      if (e) {
        console.log('testCopyOut failed:');
        console.log(e);
        process.exit(1);
      }
      var content = fs.readFileSync('copy-out-test.txt', 'utf8');
      var original = fs.readFileSync('test.txt', 'utf8');
      if (content !== original) {
        console.log('testCopyOut did not copy the file faithfully.');
        process.exit(1);
      }
      // Don't confuse the next test
      fs.unlinkSync('copy-out-test.txt');
      testDisableAndEnable();
    });
  }

  function testDisableAndEnable() {
    console.log('testing disable and enable');
    return async.series({
      disable: function(callback) {
        uploadfs.disable('/one/two/three/test.txt', function(err) {
          if (err) {
            console.log('uploadfs.disable failed:');
            console.log(err);
            process.exit(1);
          }
          return callback(null);
        });
      },
      copyShouldFail: function(callback) {
        uploadfs.copyOut('/one/two/three/test.txt', 'copy-out-test.txt', function(e) {
          if (!e) {
            console.log('uploadfs.disable allowed access when it should not have');
            process.exit(1);
          }
          return callback(null);
        });
      },
      enable: function(callback) {
        uploadfs.enable('/one/two/three/test.txt', function(err) {
          if (err) {
            console.log('uploadfs.enable failed:');
            console.log(err);
            process.exit(1);
          }
          return callback(null);
        });
      },
      copyShouldWork: function(callback) {
        uploadfs.copyOut('/one/two/three/test.txt', 'copy-out-test.txt', function(e) {
          if (e) {
            console.log('uploadfs.enable did not restore access');
            process.exit(1);
          }

          var content = fs.readFileSync('copy-out-test.txt', 'utf8');
          var original = fs.readFileSync('test.txt', 'utf8');
          if (content !== original) {
            console.log('testCopyOut did not copy the file faithfully.');
            process.exit(1);
          }
          return callback(null);
        });
      }
    }, function(err) {
      if (err) {
        console.log('Unexpected error');
        process.exit(1);
      }
      // Don't confuse the next test
      fs.unlinkSync('copy-out-test.txt');
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
    s3TestStart();
  }
}


function azureTestStart() {
  options = azureOptions;

  uploadfs.init(options, function (e) {
    if (e) {
      console.log('azure uploadfs.init failed:');
      console.log(e);
      process.exit(1);
    }

    console.log("Init success");
    azureTestCopyIn();
  });
}

function azureTestCopyIn() {
  console.log("Test azure copy in")
  uploadfs.copyIn('test.txt', '/one/two/three/test.txt', function(e) {
    if (e) {
      console.log("azure uploadfs.copyIn fail:", e);
      process.exit(1);
    }

    console.log("azure copy in - nominnal success");
    azureTestCopyOut();
  });
}

function azureTestCopyOut() {
  var ogFile = fs.readFileSync('test.txt', {encoding: 'utf8'});
  var cmpFile;
  var tmpFileName = new Date().getTime() + '_text.txt';
  console.log("Test azure copy out", tmpFileName);
  
  uploadfs.copyOut('one/two/three/test.txt', tmpFileName, {}, function (e, val) {  
    console.log('az copyOut 2', e, val)
    if (e) {
      console.log("azure uploadfs.copyOut fail:", e);
      process.exit(1);
    }
      
    // assert, check for undefined
    console.log('File names match', tmpFileName, val.response.localPath, tmpFileName === val.response.localPath);
    var read = fs.createReadStream(tmpFileName)
    var gunzip = zlib.createGunzip()
    var write = fs.createWriteStream("utput.txt")
    var buffer = [];
    var val;

    read.pipe(gunzip);
    gunzip.on('data', function(chunk) {
      buffer.push(chunk)		
    });

    gunzip.on('end', function() {
      val = buffer.join("");
      // assert, copyOut value should equal local value
      console.log("Val", val, ogFile, val === ogFile);
     // azureTestRemove();
    });
  });
}

function azureTestRemove() {
  var azurePath = '/one/two/three/test.txt';
  uploadfs.remove(azurePath, function(err) {
    if (err) {
      console.log('azureTestRemove error', err);
    } else {
      console.log('azureTestRemove sucess');
    }
  })
}

function s3TestStart() {
  options = s3Options;
  console.log('Initializing uploadfs for the ' + options.storage + ' backend');
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
          testCopyOut();
        });
      }, 5000);
    });
  }

  function testCopyOut() {
    console.log('testing copyOut');
    uploadfs.copyOut('/one/two/three/test.txt', 'copy-out-test.txt', function(e) {
      if (e) {
        console.log('testCopyOut failed:');
        console.log(e);
        process.exit(1);
      }
      var content = fs.readFileSync('copy-out-test.txt', 'utf8');
      var original = fs.readFileSync('test.txt', 'utf8');
      if (content !== original) {
        console.log('testCopyOut did not copy the file faithfully.');
        process.exit(1);
      }
      // Don't confuse the next test
      fs.unlinkSync('copy-out-test.txt');
      testDisableAndEnable();
    });
  }

  function testDisableAndEnable() {
    console.log('s3 test of disable and enable');
    return async.series({
      disable: function(callback) {
        return uploadfs.disable('/one/two/three/test.txt', function(err) {
          if (err) {
            console.log('uploadfs.disable failed:');
            console.log(err);
            process.exit(1);
          }
          return callback(null);
        });
      },
      webShouldFail: function(callback) {
        // With s3, copyOut always works, but web access will fail, which is
        // all that uploadfs.disable actually promises.
        var url = uploadfs.getUrl() + '/one/two/three/test.txt';
        return request(url, function(err, response, body) {
          if (response.statusCode >= 400) {
            return callback(null);
          }
          console.log('uploadfs.disable: web request should have failed, succeeded with status code ' + response.statusCode);
          process.exit(1);
        });
      },
      enable: function(callback) {
        uploadfs.enable('/one/two/three/test.txt', function(err) {
          if (err) {
            console.log('uploadfs.enable failed:');
            console.log(err);
            process.exit(1);
          }
          return callback(null);
        });
      },
      webShouldWork: function(callback) {
        var url = uploadfs.getUrl() + '/one/two/three/test.txt';
        return request(url, function(err, response, body) {
          if (response.statusCode >= 400) {
            console.log('uploadfs.enable: web request failed with status code ' + response.statusCode);
            process.exit(1);
          }
          var content = response.body;
          console.log(content);
          var original = fs.readFileSync('test.txt', 'utf8');
          if (content !== original) {
            console.log('After uploadfs.enable, web request did not copy the file faithfully.');
            process.exit(1);
          }
          if (response.headers['content-type'] !== 'text/plain') {
            console.log("Content type is not text/plain");
            process.exit(1);
          }
          return callback(null);
        });
      }
    }, function(err) {
      if (err) {
        console.log('Unexpected error');
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
