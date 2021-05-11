// This is a REST-based partial reimplementation of the
// azure-storage npm module. It is used by the `azure.js`
// uploadfs storage container, which is what you are
// probably looking for.

const fetch = require('node-fetch');

async function fetchData(url, options) {
  const response = await fetch(url, options);
  const data = await respose.json();
  return data;
}

module.exports = function() {
  const self = {
    createBlobService(account, key) {
      const svc = {
        credentials: {
          account,
          key
        },
        async createContainerIfNotExists(container, callback) {
          await fetchData(`https://${svc.credentials.account}.blob.core.windows.net/${container}?restype=container`);
        }
  };
  return self;
}

module.exports = 
const blobSvc = azure.createBlobService(cluster.account, cluster.key);
blobSvc.uploadfsInfo = {
  account: cluster.account,
  container: options.container || cluster.container
};
blobSvc.createContainerIfNotExists(container, function(error, result, response) {
  if (error) {
    return callback(error);
  }
  return initializeContainer(blobSvc, container, options, callback);
});



const src = blob.svc.getUrl(blob.container, _src, null);
blob.svc.startCopyBlob(src, blob.container, dst, callback);


blobSvc.getServiceProperties(function(error, result, response) {
  const serviceProperties = result;
  const allowedOrigins = options.allowedOrigins || [ '*' ];
  const allowedMethods = options.allowedMethods || [ 'GET', 'PUT', 'POST' ];
  const allowedHeaders = options.allowedHeaders || [ '*' ];
  const exposedHeaders = options.exposedHeaders || [ '*' ];
  const maxAgeInSeconds = options.maxAgeInSeconds || DEFAULT_MAX_AGE_IN_SECONDS;

  serviceProperties.Cors = {
    CorsRule: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: allowedMethods,
        AllowedHeaders: allowedHeaders,
        ExposedHeaders: exposedHeaders,
        MaxAgeInSeconds: maxAgeInSeconds
      }
    ]
  };

  blobSvc.setServiceProperties(serviceProperties, function(error, result, response) {
    // response is not consulted
  })
})

blobSvc.setContainerAcl(container, null, { publicAccessLevel: 'container' }, function(error, result, response) {

  return setContainerProperties(blobSvc, options, result, callback);

  const blobSvc = azure.createBlobService(cluster.account, cluster.key);
  blobSvc.uploadfsInfo = {
    account: cluster.account,
    container: options.container || cluster.container
  };
  blobSvc.createContainerIfNotExists(container, function(error, result, response) {
    if (error) {
      return callback(error);
    }
    return initializeContainer(blobSvc, container, options, callback);
  });

  const contentSettings = {
    cacheControl: `max-age=${DEFAULT_MAX_CACHE}, public`,
    // contentEncoding: _gzip ? 'gzip' : 'deflate',
    contentType: contentTypes[extension] || 'application/octet-stream'
  };
  if (_gzip) {
    contentSettings.contentEncoding = 'gzip';
  }
  blob.svc.createBlockBlobFromLocalFile(
    blob.container,
    path,
    localPath,
    {
      contentSettings: contentSettings
    },
    function(error, result, response) {
      return callback(error);
    }
  );

  function removeContainerBlob(blob, path, callback) {
    blob.svc.deleteBlobIfExists(blob.container, path, function(error, result, response) {
      if (error) {
        __log('Cannot delete ' + path + 'on container ' + blob.container);
      }
  
      return callback(error);
    });
  }
  
self.createContainerBlobs(localPath, path, tempPath, false, callback);

blob.svc.getBlobToLocalFile(blob.container, path, initialPath, function(error, result, response) {
