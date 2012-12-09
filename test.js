var uploadfs = require('./uploadfs.js');
var fs = require('fs');

console.log('Initializing uploadfs');

uploadfs.init({ backend: 'local', uploadsPath: __dirname + '/test', uploadsUrl: 'http://localhost:3000/test' }, function(e) {
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
  console.log('testing the automatic empty folder cleanup mechanism');
  console.log('Waiting for the automatic empty folder cleanup mechanism to finish.');
  setTimeout(function() {
    if (fs.existsSync('test/one')) {
      console.log('testRmdir saw that test/one still existed.');
      process.exit(1);
    }
    testGetUrl();
  }, 10000);
}

function testGetUrl() {
  console.log('testing getUrl');
  var url = uploadfs.getUrl();
  if (url + '/one/two/three/test.txt' !== 'http://localhost:3000/test/one/two/three/test.txt') {
    console.log('testGetUrl did not return the expected URL.');
    process.exit(1);
  }
  success();
}

function success() {
  console.log('All tests passing.');
  process.exit(0);
}
