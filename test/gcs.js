/* global describe, it */
const assert = require('assert');
const request = require('request');

describe('UploadFS GCS', function () {
  this.timeout(20000);
  const uploadfs = require('../uploadfs.js')();
  const fs = require('fs');
  const async = require('async');
  const tempPath = '../temp';
  const dstPath = '/one/two/three/test.txt';
  const imageSizes = [
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

  let gcsOptions = require('../gcsTestOptions.js');

  gcsOptions.imageSizes = imageSizes;
  gcsOptions.tempPath = tempPath;
  gcsOptions.params = {
    Bucket: gcsOptions.bucket
  };

  it('uploadfs should init gcs connection without error', function(done) {
    return uploadfs.init(gcsOptions, function(e) {
      assert(!e, 'gcs init without error');
      if (e) console.log("=======E", e);
      uploadfs.copyIn('test.txt', dstPath, function(e) {
        if (e) console.log("=======EE", e);
        assert(!e, 'gcs copyIn without error');
        done();
      });
    });
  });

  it('CopyIn should work', function (done) {
    return uploadfs.copyIn('test.txt', dstPath, function(e) {
      assert(!e, 'gcs copyIn without error');
      done();
    });
  });

  it('CopyIn file should be available via gcs', function (done) {
    const url = uploadfs.getUrl() + '/one/two/three/test.txt';
    const og = fs.readFileSync('test.txt', 'utf8');
    request(url, (e, res, body) => {
      assert(!e, 'Request success');
      assert(res.statusCode === 200, `Request status 200 != ${res.statusCode}`);
      assert(res.body === og, 'Res body equals uploaded file');
      done();
    });
  });

  it('CopyOut should work', done => {
    const cpOutPath = 'copy-out-test.txt';
    return uploadfs.copyOut(dstPath, cpOutPath, e => {
      assert(!e, 'gcs copyOut without error');
      const dl = fs.readFileSync(cpOutPath, 'utf8');
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(dl === og, 'Downloaded file is equal to previous upload');
      done();
    });
  });

  it('disable / enable should work as expected', done => {
    return async.series({
      disable: cb => {
        uploadfs.disable(dstPath, e => {
          assert(!e, 'uploadfs disable no err');
          cb(null);
        });
      },
      webShouldFail: cb => {
        const url = uploadfs.getUrl() + dstPath;
        return request(url, (e, res, body) => {
          assert(res.statusCode >= 400, 'Request on disabled resource should fail: expected 40x, got ' + res.statusCode);
          cb(null);
        });
      },
      enable: cb => {
        uploadfs.enable(dstPath, e => {
          assert(!e, 'uploadfs enable should not fail');
          cb(null);
        });
      },
      webShouldSucceed: cb => {
        const url = uploadfs.getUrl() + dstPath;
        return request(url, (e, res, body) => {
          const og = fs.readFileSync('test.txt', 'utf8');
          assert(!e, 'Request for enabled resource should not fail');
          assert(res.statusCode < 400, 'Request for enabled resource should not fail');
          assert(og === res.body, 'Downloaded content should be equal to previous upload');
          assert(res.headers['content-type'] === 'text/plain; charset=utf-8',
            `Check content-type header expected "text/plain; charset=utf-8" but got "${res.headers['content-type']}"`);
          cb(null);
        });
      }
    }, e => {
      assert(!e, 'Series should succeed');
      done();
    });
  });

  it('remove should work', done => {
    return uploadfs.remove(dstPath, e => {
      assert(!e, 'Remove should succeed');

      setTimeout(() => {
        const url = uploadfs.getUrl() + dstPath;
        request(url, (e, res, body) => {
          assert(!e);
          assert(res.statusCode >= 400, 'Removed file is gone from gcs');
          done();
        });
      }, 5000);
    });
  });

  it('copyImageIn should work', done => {
    const imgDstPath = '/images/profiles/me';

    uploadfs.copyImageIn('test.jpg', imgDstPath, (e, info) => {
      assert(!e, 'gcs copyImageIn works');

      setTimeout(() => {
        const url = uploadfs.getUrl();
        let paths = [ info.basePath + '.jpg' ];

        paths.push(info.basePath + '.small.jpg');
        paths.push(info.basePath + '.medium.jpg');
        paths.push(info.basePath + '.large.jpg');

        async.map(paths, (path, cb) => {
          const imgPath = url + path;
          request(imgPath, (e, res, body) => {
            assert(!e);
            assert(res.statusCode === 200, `Request status 200 != ${res.statusCode}`);
            /* @@TODO we should test the correctness of uploaded images */

            // clean up
            uploadfs.remove(path, e => {
              assert(!e, 'Remove uploaded file after testing');
              return cb();
            });
          });
        }, e => {
          assert(!e, 'Can request all copyImageInned images');
          done();
        });
        // end async.each
      }, 5000);
    });
  });
});
