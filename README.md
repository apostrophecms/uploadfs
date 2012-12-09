uploadfs
========

Copies files to a web-accessible location and provides a consistent way to get the URLs that correspond to those files. Includes both S3-based and local filesystem-based backends. The API offers the same conveniences with both backends:

* Parent directories are created automatically as needed
* Content types are inferred from file extensions
* Files are automatically marked as being readable via the web when using S3

You can also remove a file if needed.

There is no API to retrieve information about existing files. This is intentional. Constantly manipulating directory information is much slower in the cloud than on a local filesystem and you should not become reliant on it. Your code should maintain its own database of file information if needed, for instance in a MongoDB collection.

The copyIn method takes a local filename and copies it to a path in uploadfs. Note that Express conveniently handles file uploads by dropping them in a temporary local file for the duration of the request. 

Usage:

    var uploadfs = require('uploadfs');
    uploadfs.init({ backend: 'local', uploadsPath: __dirname + '/public/uploads' });

    app.post('/profile', function(req, res) {
      uploadfs.copyIn(req.files.photo.path, '/profiles/me.jpg', function(e) {
        if (e) {
          res.send('An error occurred: ' + e);
        } else {
          res.send('<h1>All is well. Here is the image.</h1>' +
            '<img src="' + uploadfs.getUploadsUrl() + '/images/me.jpg'" />'); 
        }
      });
    });

Note the use of uploadfs.getUploadsUrl() to determine the URL of the uploaded image. Use this method consistently and your code will find the file in the right place regardless of the backend chosen.

Removing a file:

    uploadfs.remove('/profiles/me.jpg', function(e) { ... });

That's it. That should be all you need. If not, I'll add things.

Tom Boutell, @boutell, tom@punkave.com
