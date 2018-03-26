/* global describe, it */
const assert = require('assert');
const request = require('request');

describe('Upload S3', function () {
  this.timeout(4500);
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

  it('S3 Should instantiate uploadfs module without errors', () => {
    assert(true, 'Module loads');
  });

  it('S3 Should init s3 connection without error', done => {
    uploadfs.init(s3Options, function(e) {
      assert(!e, 'S3 init without error');
      done();
    });
  });

  it('CopyIn should work', done => {
    uploadfs.copyIn('test.txt', dstPath, function(e) {
      const url = uploadfs.getUrl() + '/one/two/three/test.txt';
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(!e, 'S3 copyIn without error');
      setTimeout(() => {
        request(url, (e, res, body) => {
          assert(!e, 'Request success');
          assert(res.statusCode === 200, 'Request status 200');
          assert(res.body === og, 'Res body equals uploaded file');
          done();
        });
      }, 5000);
    });
  });

  it('S3 CopyOut should work', done => {
    const cpOutPath = 'copy-out-test.txt';
    uploadfs.copyOut(dstPath, cpOutPath, e => {
      assert(!e, 'S3 copyOut without error');
      const dl = fs.readFileSync(cpOutPath, 'utf8');
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(dl === og, 'Downloaded file is equal to previous upload');
    });
  });

  it('S3 Disable / Enable should work as expected', done => {
    async.series({
      disable: cb => {
        uploadfs.disable(dstPath, e => {
          assert(!e, 'uploadfs disable no err');
          cb(null);
        });
      },
      webShouldFail: cb => {
        const url = uploadfs.getUrl() + dstPath;
        return request(url, (e, res, body) => {
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
        return request(url, (e, res, body) => {
          const og = fs.readFileSync('test.txt', 'utf8');
          assert(!e, 'Request for enabled resource should not fail');
          assert(res.statusCode < 400, 'Request for enabled resource should not fail');
          assert(og === res.body, 'Downloaded content should be equal to previous upload');
          assert(res.headers['content-type'] === 'text/plain', 'Check content-type header');
        });
      }
    }, e => {
      assert(!e, 'Series should succeed');
      done();
    });
  });

  it('S3 uploadfs Remove should work', done => {
    uploadfs.remove(dstPath, e => {
      assert(!e, 'Remove should succeed');

      setTimeout(() => {
        const url = uploadfs.getUrl() + dstPath;
        request(url, (e, res, body) => {
          assert(!e);
          assert(res.statusCode >= 400, 'Removed file is gone from s3');
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
          request(imgPath, (e, res, body) => {
            assert(!e);
            assert(res.statusCode === 200);
            /* @@TODO we should test the correctness of uploaded images */

            // clean up
            uploadfs.remove(path, e => {
              assert(!e, 'Remove uploaded file after testing');
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
