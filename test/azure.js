/* global describe, it */
var assert = require('assert');
var fs = require('fs');
var zlib = require('zlib');
var rp = require('request-promise');
var uploadfs = require('../uploadfs.js')();
var srcFile = 'test.txt';
var infile = 'one/two/three/test.txt';

/* helper to automate scraping files from blob svc */
var _getOutfile = function(infile, tmpFileName, done) {
  var ogFile = fs.readFileSync(srcFile, {encoding: 'utf8'});
  return uploadfs.copyOut(infile, tmpFileName, {}, function(e, res) {
    assert(!e, 'Azure copy out nominal success');
    if (e) return console.error("copyOut Error", e);
    var read = fs.createReadStream(tmpFileName);
    var gunzip = zlib.createGunzip();
    var buffer = [];
    var str;

    read.pipe(gunzip);
    gunzip.on('data', function(chunk) {
      buffer.push(chunk);
    });

    gunzip.on('end', function() {
      str = buffer.join('');

      assert(!e, 'Azure copy out - nominal success');
      if (e) console.log(e);
      // make sure we have actual values not null or undefined
      assert(str.length, 'copOutFile has length');
      assert(ogFile.length, 'original textfile body has length');
      assert(ogFile === str, 'Azure copy out equal to original text file');

      // @@TODO make sure to clean up tmpFiles
      fs.unlinkSync(tmpFileName);
      done();
    });
  });
};

describe('UploadFS Azure', function() {
  this.timeout(20000);

  var tempPath = '../temp';

  var azureOptions = require('../azureTestOptions.js');
  azureOptions.tempPath = tempPath;

  it('Should connect to Azure cloud successfully', function(done) {
    uploadfs.init(azureOptions, function(e) {
      assert(!e, 'Successfully initialize azure service');
      done();
    });
  });

  it('Azure test copyIn should work', function(done) {
    uploadfs.copyIn(srcFile, infile, function(e) {
      assert(!e, 'Azure copy in - nominal success');
      done();
    });
  });

  it('Azure test copyOut should work', function(done) {
    var tmpFileName = new Date().getTime() + '_text.txt';
    _getOutfile(infile, tmpFileName, done);
  });

  it('Azure disable should work', function(done) {
    uploadfs.disable(infile, function(e, val) {
      assert(!e, 'Azure disable, nominal success');
      done();
    });
  });

  it('Azure test copyOut after disable should fail', function(done) {
    var tmpFileName = new Date().getTime() + '_text.txt';
    setTimeout(function() {
      uploadfs.copyOut(infile, tmpFileName, {}, function(e, res) {
        assert(e);
        assert(e.name === 'StorageError');
        assert(e.message === 'NotFound');
        done();
      });
    }, 5000);
  });

  it('Azure enable should work', function(done) {
    uploadfs.enable(infile, function(e, val) {
      assert(!e, 'Azure enable , nominal success');
      done();
    });
  });

  it('Azure test copyOut after enable should succeed', function(done) {
    var tmpFileName = new Date().getTime() + '_text.txt';
    _getOutfile(infile, tmpFileName, done);
  });

  it('Uploadfs should return valid web-servable url pointing to uploaded file', function() {
    var url = uploadfs.getUrl(infile);
    var ogFile = fs.readFileSync(srcFile, {encoding: 'utf8'});

    return rp({uri: url, gzip: true})
      .then(function(res) {
        assert(ogFile === res, "Web servable file contents equal original text file contents");
      });
  });

  it('Azure test remove should work', function(done) {
    uploadfs.remove(infile, function(e) {
      assert(!e, 'Azure remove, nominal success');
      done();
    });
  });

  it('Azure test copyOut should fail', function(done) {
    var tmpFileName = new Date().getTime() + '_text.txt';

    uploadfs.copyOut(infile, tmpFileName, {}, function(e, res) {
      assert(e);
      assert(e.name === 'StorageError');
      assert(e.message === 'NotFound');
      done();
    });
  });
});
