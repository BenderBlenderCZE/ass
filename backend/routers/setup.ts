import fs from 'fs-extra';
import { path } from '@tycrek/joint';
import { Router, json as BodyParserJson } from 'express';
import { log } from '../log';
import { UserConfiguration } from 'ass';
import { UserConfig } from '../UserConfig';

const router = Router({ caseSensitive: true });
const userConfigExists = () => fs.pathExistsSync(path.join('userconfig.json'));

// Static routes
router.get('/', (req, res) => userConfigExists() ? res.redirect('/') : res.render('setup'));
router.get('/ui.js', (req, res) => userConfigExists() ? res.send('') : res.type('text').sendFile(path.join('dist-frontend/setup.mjs')));

// Setup route
router.post('/', BodyParserJson(), (req, res) => {
	if (userConfigExists())
		return res.status(409).json({ success: false, message: 'User config already exists' });

	log.debug('Setup initiated');

	// Parse body
	try {
		const confTest = new UserConfig(req.body as UserConfiguration);

		// Temp logs
		log.debug('Uploads dir', confTest.getConfig().uploadsDir);
		log.debug('ID type', confTest.getConfig().idType);
		log.debug('ID size', confTest.getConfig().idSize.toString());
		log.debug('Gfy size', confTest.getConfig().gfySize.toString());
		log.debug('Max file size', confTest.getConfig().maximumFileSize.toString());

		return res.json({ success: true });
	} catch (err: any) {
		return res.status(400).json({ success: false, message: err.message });
	}
});

export { router };
