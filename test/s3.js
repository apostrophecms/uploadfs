/* global describe, it */
const assert = require('assert');
const request = require('request');

describe('UploadFS S3', function () {
  this.timeout(50000);
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

  let s3Options = require('../s3TestOptions.js');

  s3Options.imageSizes = imageSizes;
  s3Options.tempPath = tempPath;
  s3Options.params = {
    Bucket: s3Options.bucket,
    ACL: 'public-read'
  };

  it('S3 Should init s3 connection without error', function(done) {
    return uploadfs.init(s3Options, function(e) {
      assert(!e, 'S3 init without error');
      if (e) console.log("=======E", e);
      uploadfs.copyIn('test.txt', dstPath, function(e) {
        if (e) console.log("=======EE", e);
        assert(!e, 'S3 copyIn without error');
        done();
      });
    });
  });

  it('CopyIn should work', function (done) {
    return uploadfs.copyIn('test.txt', dstPath, function(e) {
      assert(!e, 'S3 copyIn without error');
      done();
    });
  });

  it('CopyIn file should be available via s3', function (done) {
    const url = uploadfs.getUrl() + '/one/two/three/test.txt';
    const og = fs.readFileSync('test.txt', 'utf8');

    request(url, {
      gzip: true
    }, (e, res, body) => {
      assert(!e, 'Request success');
      assert(res.statusCode === 200, 'Request status 200');
      assert(res.body === og, 'Res body equals uploaded file');
      done();
    });
  });

  it('S3 CopyOut should work', done => {
    const cpOutPath = 'copy-out-test.txt';
    return uploadfs.copyOut(dstPath, cpOutPath, e => {
      assert(!e, 'S3 copyOut without error');
      const dl = fs.readFileSync(cpOutPath, 'utf8');
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(dl === og, 'Downloaded file is equal to previous upload');
      done();
    });
  });

  it('S3 Disable / Enable should work as expected', done => {
    return async.series({
      disable: cb => {
        uploadfs.disable(dstPath, e => {
          assert(!e, 'uploadfs disable no err');
          cb(null);
        });
      },
      webShouldFail: cb => {
        const url = uploadfs.getUrl() + dstPath;
        return request(url, {
          gzip: true
        }, (e, res, body) => {
          assert(res.statusCode >= 400, 'Request on disabled resource should fail');
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
        return request(url, {
          gzip: true
        }, (e, res, body) => {
          const og = fs.readFileSync('test.txt', 'utf8');
          assert(!e, 'Request for enabled resource should not fail');
          assert(res.statusCode < 400, 'Request for enabled resource should not fail');
          assert(og === res.body, 'Downloaded content should be equal to previous upload');
          assert(res.headers['content-type'] === 'text/plain', 'Check content-type header');
          cb(null);
        });
      }
    }, e => {
      assert(!e, 'Series should succeed');
      done();
    });
  });

  it('S3 uploadfs Remove should work', done => {
    return uploadfs.remove(dstPath, e => {
      assert(!e, 'Remove should succeed');

      setTimeout(() => {
        const url = uploadfs.getUrl() + dstPath;
        request(url, {
          gzip: true
        }, (e, res, body) => {
          assert(!e);
          assert(res.statusCode >= 400, 'Removed file is gone from s3');
          done();
        });
      }, 5000);
    });
  });

  it('S3 uploadfs copyImageIn should work', done => {
    const imgDstPath = '/images/profiles/me';

    uploadfs.copyImageIn('test.jpg', imgDstPath, (e, info) => {
      assert(!e, 'S3 copyImageIn works');

      setTimeout(() => {
        const url = uploadfs.getUrl();
        let paths = [ info.basePath + '.jpg' ];

        paths.push(info.basePath + '.small.jpg');
        paths.push(info.basePath + '.medium.jpg');
        paths.push(info.basePath + '.large.jpg');

        async.map(paths, (path, cb) => {
          const imgPath = url + path;
          request(imgPath, {
            gzip: true,
            // return a buffer so we can test bytes
            encoding: null
          }, (e, res, body) => {
            assert(!e);
            // Not suitable for images, make sure we didn't force it
            assert(res.headers['content-encoding'] !== 'gzip');
            assert(res.statusCode === 200);
            // JPEG magic number check
            assert(body[0] === 0xFF);
            assert(body[1] === 0xD8);
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
