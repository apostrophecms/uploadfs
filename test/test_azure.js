/* global describe, it */
const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');

describe('UploadFS Azure', function() {
  this.timeout(4500);
  const uploadfs = require('../uploadfs.js')();
  const srcFile = 'test.txt';
  const infile = '/one/two/three/test.txt';

  let azureOptions = require('../azureTestOptions.js');

  azureOptions.tempPath = '../tmp';

  it('Should connect to Azure cloud successfully', done => {
    uploadfs.init(azureOptions, e => {
      assert(!e, 'Successfully initialize azure service');
      done();
    });
  });

  it('Azure test copyIn should work', done => {
    uploadfs.copyIn(srcFile, infile, e => {
      assert(!e, 'Azure copy in - nominal success');
      done();
    });
  });

  it('Azure test copyOut should work', done => {
    const ogFile = fs.readFileSync('test.txt', {encoding: 'utf8'});
    const tmpFileName = new Date().getTime() + '_text.txt';

    uploadfs.copyOut(infile, tmpFileName, {}, (e, res) => {
      // gunzipit
      const read = fs.createReadStream(tmpFileName);
      const gunzip = zlib.createGunzip();
      let buffer = [];
      let str;

      read.pipe(gunzip);
      gunzip.on('data', chunk => {
        buffer.push(chunk);
      });

      gunzip.on('end', () => {
        str = buffer.join('');

        assert(!e, 'Azure copy out - nominal success');
        // make sure we have actual values not null or undefined
        assert(str.length, 'copOutFile has length');
        assert(ogFile.length, 'original textfile body has length');
        assert(ogFile === str, 'Azure copy out equal to original text file');

        // @@TODO make sure to clean up tmpFiles
        fs.unlinkSync(tmpFileName);
        done();
      });
    });
  });

  it('Azure test remove should work', done => {
    uploadfs.remove(infile, e => {
      assert(!e, 'Azure remove, nominal success');
      done();
    });
  });
});
