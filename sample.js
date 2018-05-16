// An extremely simple app that accepts uploaded files
// and stores them in either a local folder or s3,
// depending on which backend you choose.

var express = require('express');
var uploadfs = require('./uploadfs.js')();

// For the local backend
var uploadsPath = __dirname + '/public/uploads';
var uploadsLocalUrl = '/uploads';
var options = {
  backend: 'local',
  uploadsPath: uploadsPath,
  uploadsUrl: 'http://localhost:3000' + uploadsLocalUrl,
  // Required if you use imageSizes and copyImageIn
  tempPath: __dirname + '/temp',
  imageSizes: [
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
  ]
};

// Or use the S3 backend
// var options = {
//   backend: 's3',
//   // Get your credentials at aws.amazon.com
//   secret: 'xxx',
//   key: 'xxx',
//   // You need to create your bucket first before using it here
//   // Go to aws.amazon.com
//   bucket: 'getyourownbucketplease',
//   // I recommend creating your buckets in a region with
//   // read-after-write consistency (not us-standard)
//   region: 'us-west-2',
//   // Required if you use imageSizes and copyImageIn
//   tempPath: __dirname + '/temp',
//   imageSizes: [
//     {
//       name: 'small',
//       width: 320,
//       height: 320
//     },
//     {
//       name: 'medium',
//       width: 640,
//       height: 640
//     },
//     {
//       name: 'large',
//       width: 1140,
//       height: 1140
//     }
//   ]
// };

uploadfs.init(options, createApp);

function createApp(err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  var app = express();

  // For the local backend: serve the uploaded files at /uploads.
  // With the s3 backend you don't need this of course, s3 serves
  // the files for you.

  app.use(uploadsLocalUrl, express.static(uploadsPath));

  app.use(express.bodyParser());
  app.use(express.cookieParser());

  app.get('/', function(req, res) {
    res.send('<form method="POST" enctype="multipart/form-data">' +
      '<input type="file" name="photo" /> <input type="submit" value="Upload Photo" />' +
      '</form>');
  });

  app.post('/', function(req, res) {
    uploadfs.copyImageIn(req.files.photo.path, '/profiles/me', function(e, info) {
      if (e) {
        res.send('An error occurred: ' + e);
      } else {
        res.send('<h1>All is well. Here is the image in three sizes plus the original.</h1>' +
          '<div><img src="' + uploadfs.getUrl() + info.basePath + '.small.' + info.extension + '" /></div>' +
          '<div><img src="' + uploadfs.getUrl() + info.basePath + '.medium.' + info.extension + '" /></div>' +
          '<div><img src="' + uploadfs.getUrl() + info.basePath + '.large.' + info.extension + '" /></div>' +
          '<div><img src="' + uploadfs.getUrl() + info.basePath + '.' + info.extension + '" /></div>');
      }
    });
  });
  app.listen(3000);
  console.log('Listening at http://localhost:3000');
}
