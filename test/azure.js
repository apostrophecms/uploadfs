/* global describe, it */
var assert = require('assert');
var fs = require('fs');
var rp = require('request-promise');
var uploadfs = require('../uploadfs.js')();
// A JPEG is not a good default because it is exempt from GZIP so
// we get less coverage. -Tom
var srcFile = process.env.AZURE_TEST_FILE || 'test.txt';
var infilePath = 'one/two/three/';
var infile = infilePath + srcFile;
var _ = require('underscore');

/* helper to automate scraping files from blob svc */
var _getOutfile = function(infile, done) {
  var tmpFileName = new Date().getTime() + srcFile;
  var ogFile = fs.readFileSync(srcFile, {encoding: 'utf8'});

  return uploadfs.copyOut(infile, tmpFileName, {}, function(e, res) {
    assert(!e, 'Azure copy out nominal success');
    var content = fs.readFileSync(tmpFileName, { encoding: 'utf8' });
    assert(content.length, 'copyOut file has length');
    assert(ogFile.length, 'original file body has length');
    // console.log(ogFile, content);
    assert(ogFile === content, 'Azure copy out equal to original text file');
    fs.unlinkSync(tmpFileName);
    done();
  });
};

describe('UploadFS Azure', function() {
  this.timeout(20000);

  var tempPath = '../temp';

  var azureOptions = require('../azureTestOptions.js');
  azureOptions.tempPath = tempPath;

  it('Should connect to Azure cloud successfully', function(done) {
    uploadfs.init(azureOptions, function(e) {
      if (e) {
        console.log("error", e);
      }
      assert(!e, 'Successfully initialize azure service');
      done();
    });
  });

  it('getGzipBlackList should return expected defaults if no options provided', done => {
    const types = uploadfs._storage.getGzipBlacklist();
    assert(Array.isArray(types), 'gzip blacklist array is an array');
    assert(types && types.indexOf('zip' >= 0));
    done();
  });

  it('getGzipBlacklist should be able to remove a type from the blacklist based on user settings', done => {
    const types = uploadfs._storage.getGzipBlacklist({ 'zip': true });
    assert(Array.isArray(types), 'gzip blacklist array is an array');
    assert(types && types.indexOf('zip' < 0));
    done();
  });

  it('getGzipBlacklist should be able to add a type to the blacklist based on user settings', done => {
    const types = uploadfs._storage.getGzipBlacklist({ 'foo': false });
    assert(Array.isArray(types), 'gzip blacklist array is an array');
    assert(types && types.indexOf('foo' >= 0));
    done();
  });

  it('getGzipBlacklist should quietly ignore `{ ext: false }` in user config if ext is not on default blacklist', done => {
    const types = uploadfs._storage.getGzipBlacklist({ 'foo': true });
    assert(Array.isArray(types), 'gzip blacklist array is an array');
    assert(types && types.indexOf('foo' <= 0), 'Filetype foo is not added to the blacklist if user wants to gzip it');
    done();
  });

  it('getGzipBlacklist should ignore duplicates', done => {
    const types = uploadfs._storage.getGzipBlacklist({ 'jpg': false, 'zip': false });
    const counts = _.countBy(types);
    done();
    assert(counts.jpg === 1, 'No duplicate jpg type is present, despite it all');
  });

  it('Azure test copyIn should work', function(done) {

    uploadfs.copyIn(srcFile, infile, function(e) {
      if (e) {
        console.log("test copyIn ERR", e);
      }
      assert(!e, 'Azure copy in - nominal success');
      done();
    });
  });

  it('Azure test copyOut should work', function(done) {
    _getOutfile(infile, done);
  });

  it('Azure disable should work', function(done) {
    uploadfs.disable(infile, function(e, val) {
      if (e) {
        console.log("error", e);
      }
      assert(!e, 'Azure disable, nominal success');
      done();
    });
  });

  it('Azure test copyOut after disable should fail', function(done) {
    setTimeout(function() {
      uploadfs.copyOut(infile, 'foo.bar', {}, function(e, res) {
        if (e) {
          console.log("error", e);
        }
        assert(e);
        assert(e.name === 'StorageError');
        assert(e.message === 'NotFound');
        done();
      });
    }, 5000);
  });

  it('Azure enable should work', function(done) {
    uploadfs.enable(infile, function(e, val) {
      if (e) {
        console.log("error", e);
      }
      assert(!e, 'Azure enable , nominal success');
      done();
    });
  });

  it('Azure test copyOut after enable should succeed', function(done) {
    _getOutfile(infile, done);
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
      if (e) {
        console.log("error", e);
      }
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
