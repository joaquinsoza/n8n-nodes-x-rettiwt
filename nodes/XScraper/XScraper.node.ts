import { INodeTypeBaseDescription, IVersionedNodeType, VersionedNodeType } from 'n8n-workflow';

import { XScraperV1 } from './V1/XScraperV1.node';

export class XScraper extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'X Scraper',
			name: 'xScraper',
			icon: 'file:x.svg',
			group: ['output'],
			subtitle: '={{$parameter["resource"] + ":" + $parameter["operation"]}}',
			description: 'Consume X without their API',
			defaultVersion: 1,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new XScraperV1(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}
