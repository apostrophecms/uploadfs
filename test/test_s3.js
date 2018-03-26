const assert = require('assert');
const async = require('async');

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

  it('Should instantiate uploadfs module without errors', () => {
    console.log('s3Options', s3Options);
    assert(true, 'Module loads'); 
  });

  it('Should init s3 connection without error', done => {
    uploadfs.init(options, function(e) {
      assert(!e, 'S3 init without error');
      if (e) console.log(e);
      done();
    });
  });

  it('CopyIn should work', done => {
    uploadfs.copyIn('test.txt', dstPath, function(e) {
      const url = uploadfs.getUrl() + '/one/two/three/test.txt';
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(!e, 'S3 copyIn without error');
      if (e) console.log(e);
      console.log('Wait five seconds for S3 consistency.');
      setTimout(() => {
        request(url, (e, res, body) => {
          assert(!e, 'Request success');
          assert(res.statusCode === 200, 'Request status 200');
          assert(res.body === og, 'Res body equals uploaded file');
          done();
        });
      }, 5000);
    });
  });

  it('CopyOut should work', done => {
    const cpOutPath = 'copy-out-test.txt';
    uploadfs.copyOut(dstPath, cpOutPath, e => {
      assert(!e, 'S3 copyOut without error');
      if (e) console.log(e);
      const dl = fs.readFileSync(cpOutPath, 'utf8');
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(dl === og, 'Downloaded file is equal to previous upload');
    }); 
  });

  it('Disable / Enable should work as expected', done => {
    async.series({
      disable: cb => {
        uploadfs.disable(dstPath, e => {
          assert(!e, 'uploadfs disable no err');
          if (e) console.log(e);
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
      if (e) console.log(e);
      done();
    });
  });
});
