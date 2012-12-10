// An extremely simple app that accepts uploaded files
// and stores them in either a local folder or s3,
// depending on which backend you choose.

var express = require('express');
var uploadfs = require('./uploadfs.js');

// For the local backend
var uploadsPath = __dirname + '/public/uploads';
var uploadsLocalUrl = '/uploads';
var options = { 
  backend: 'local', 
  uploadsPath: uploadsPath,
  uploadsUrl: 'http://localhost:3000' + uploadsLocalUrl
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
//   region: 'us-west-2'
// };

uploadfs.init(options, createApp);

function createApp() {
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
    uploadfs.copyIn(req.files.photo.path, '/profiles/me.jpg', function(e) {
      if (e) {
        res.send('An error occurred: ' + e);
      } else {
        res.send('<h1>All is well. Here is the image.</h1>' +
          '<img src="' + uploadfs.getUrl() + '/profiles/me.jpg" />'); 
      }
    });
  });
  app.listen(3000);
  console.log('Listening at http://localhost:3000')
}
