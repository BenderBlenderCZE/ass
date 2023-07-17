import fs from 'fs-extra';
import bb from 'express-busboy';
import { Router } from 'express';
import { log } from '../log';
import { UserConfig } from '../UserConfig';
import { random } from '../generators';
import { BusBoyFile, AssFile } from 'ass';
import { getFileS3, uploadFileS3 } from '../s3';
import { Readable } from 'stream';
import * as data from '../data';

const router = Router({ caseSensitive: true });

//@ts-ignore // Required since bb.extends expects express.Application, not a Router (but it still works)
bb.extend(router, {
	upload: true,
	restrictMultiple: true,
	allowedPath: (url: string) => url === '/',
	limits: {
		fileSize: () => (UserConfig.ready ? UserConfig.config.maximumFileSize : 50) * 1000000 // MB
	}
});

// Render or redirect
router.get('/', (req, res) => UserConfig.ready ? res.render('index') : res.redirect('/setup'));

// Upload flow
router.post('/', async (req, res) => {

	// Check user config
	if (!UserConfig.ready) return res.status(500).type('text').send('Configuration missing!');

	// Does the file actually exist
	if (!req.files || !req.files['file']) return res.status(400).type('text').send('No file was provided!');
	else log.debug('Upload request received', `Using ${UserConfig.config.s3 != null ? 'S3' : 'local'} storage`);

	// Type-check the file data
	const bbFile: BusBoyFile = req.files['file'];

	// Prepare file move
	const uploads = UserConfig.config.uploadsDir;
	const timestamp = Date.now().toString();
	const fileKey = `${timestamp}_${bbFile.filename}`;
	const destination = `${uploads}${uploads.endsWith('/') ? '' : '/'}${fileKey}`;

	// S3 configuration
	const s3 = UserConfig.config.s3 != null ? UserConfig.config.s3 : false;

	try {

		// Get the file size
		const fileSize = (await fs.stat(bbFile.file)).size;

		// * Move the file
		if (!s3) await fs.move(bbFile.file, destination);
		else await uploadFileS3(await fs.readFile(bbFile.file), bbFile.mimetype, fileKey);

		// Build ass metadata
		const assFile: AssFile = {
			fakeid: random({ length: UserConfig.config.idSize }), // todo: more generators
			fileKey,
			mimetype: bbFile.mimetype,
			filename: bbFile.filename,
			timestamp,
			uploader: '0', // todo: users
			save: {},
			sha256: '0', // todo: hashing
			size: fileSize
		};

		// Set the save location
		if (!s3) assFile.save.local = destination;
		else {
			// Using S3 doesn't move temp file, delete it now
			await fs.rm(bbFile.file);
			assFile.save.s3 = true;
		}

		// * Save metadata
		data.put('files', assFile.fakeid, assFile);

		log.debug('File saved to', !s3 ? assFile.save.local! : 'S3');
		return res.type('json').send({ resource: `${req.ass.host}/${assFile.fakeid}` });
	} catch (err) {
		log.error('Failed to upload file', bbFile.filename);
		console.error(err);
		return res.status(500).send(err);
	}
});

router.get('/:fakeId', (req, res) => res.redirect(`/direct/${req.params.fakeId}`));

router.get('/direct/:fakeId', async (req, res) => {
	if (!UserConfig.ready) res.redirect('/setup');

	// Get the ID
	const fakeId = req.params.fakeId;

	// Get the file metadata
	let _data;
	try { _data = await data.get('files', fakeId); }
	catch (err) {
		log.error('Failed to get', fakeId);
		console.error(err);
		return res.status(500).send();
	}

	if (!_data) return res.status(404).send();
	else {
		const meta = _data as AssFile;

		// File data can come from either S3 or local filesystem
		let output: Readable | NodeJS.ReadableStream;

		// Try to retrieve the file
		if (!!meta.save.s3) {
			const file = await getFileS3(meta.fileKey);
			if (!file.Body) return res.status(500).send('Unknown error');
			output = file.Body as Readable;
		} else output = fs.createReadStream(meta.save.local!);

		// Configure response headers
		res.type(meta.mimetype)
			.header('Content-Disposition', `inline; filename="${meta.filename}"`)
			.header('Cache-Control', 'public, max-age=31536000, immutable')
			.header('Accept-Ranges', 'bytes');

		// Send the file (thanks to https://stackoverflow.com/a/67373050)
		output.pipe(res);
	}
});

export { router };
