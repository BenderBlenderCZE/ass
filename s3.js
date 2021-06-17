// https://docs.digitalocean.com/products/spaces/resources/s3-sdk-examples/
// https://www.digitalocean.com/community/tutorials/how-to-upload-a-file-to-object-storage-with-node-js

const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3endpoint, s3bucket, s3accessKey, s3secretKey } = require('./config.json');

const s3 = new aws.S3({
	endpoint: new aws.Endpoint(s3endpoint),
	credentials: new aws.Credentials({ accessKeyId: s3accessKey, secretAccessKey: s3secretKey })
});

const upload = multer({
	storage: multerS3({
		s3: s3,
		bucket: s3bucket,
		acl: 'public-read',
		key: (_req, file, cb) => cb(null, file.originalname),
		contentType: (_req, file, cb) => cb(null, file.mimetype)
	})
}).single('file');

module.exports = upload;
