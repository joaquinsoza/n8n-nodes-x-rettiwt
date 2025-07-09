import type {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { Rettiwt } from 'rettiwt-api';

// Declare timer functions for TypeScript
declare const setTimeout: (callback: () => void, delay: number) => any;
declare const clearTimeout: (timeoutId: any) => void;

export class XScraperTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'X Scraper Trigger',
		name: 'xScraperTrigger',
		icon: 'file:x.svg',
		group: ['trigger'],
		version: 1,
		description: 'Triggers when new tweets, mentions, or DMs are received',
		defaults: {
			name: 'X Scraper Trigger',
		},
		inputs: [], // No inputs for trigger nodes
		outputs: ['main'],
		credentials: [
			{
				name: 'xScraperApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'triggerOn',
				type: 'options',
				options: [
					{
						name: 'New Tweets From Search',
						value: 'newTweets',
						description: 'Trigger when new tweets match a search query',
					},
					{
						name: 'New Mentions',
						value: 'mentions',
						description: 'Trigger when you are mentioned in tweets',
					},
					{
						name: 'New Timeline Updates',
						value: 'timeline',
						description: 'Trigger when new tweets appear on your timeline',
					},
				],
				default: 'newTweets',
			},
			{
				displayName: 'Search Query',
				name: 'searchQuery',
				type: 'string',
				displayOptions: {
					show: {
						triggerOn: ['newTweets'],
					},
				},
				default: '',
				placeholder: 'Enter search terms...',
				description: 'The search query to monitor for new tweets',
			},
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				displayOptions: {
					show: {
						triggerOn: ['mentions', 'timeline'],
					},
				},
				default: '',
				placeholder: 'Enter username without @',
				description: 'Username to monitor for mentions or timeline updates',
			},
			{
				displayName: 'Poll Interval',
				name: 'pollInterval',
				type: 'number',
				default: 60,
				description: 'How often to check for new content (in seconds)',
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				default: 10,
				description: 'Maximum number of results to return per check',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const triggerOn = this.getNodeParameter('triggerOn') as string;
		const pollInterval = this.getNodeParameter('pollInterval') as number;
		const maxResults = this.getNodeParameter('maxResults') as number;

		// Get credentials
		const credentials = await this.getCredentials('xScraperApi');
		const rettiwt = new Rettiwt({ apiKey: credentials.apiKey as string });

		// Store the last processed tweet ID to avoid duplicates
		const workflowStaticData = this.getWorkflowStaticData('node');
		let lastProcessedId = workflowStaticData.lastProcessedId as string | undefined;

		let isPolling = true;

		const pollForNewContent = async () => {
			try {
				let newContent: any[] = [];

				switch (triggerOn) {
					case 'newTweets':
						const searchQuery = this.getNodeParameter('searchQuery') as string;
						if (!searchQuery) {
							throw new NodeOperationError(this.getNode(), 'Search query is required');
						}

						const searchResults = await rettiwt.tweet.search(
							{ includePhrase: searchQuery },
							maxResults,
						);

						newContent = searchResults.list || [];
						break;

					case 'mentions':
						const mentionUsername = this.getNodeParameter('username') as string;
						if (!mentionUsername) {
							throw new NodeOperationError(this.getNode(), 'Username is required');
						}

						// Search for mentions of the user
						const mentionResults = await rettiwt.tweet.search(
							{ includePhrase: `@${mentionUsername}` },
							maxResults,
						);

						newContent = mentionResults.list || [];
						break;

					case 'timeline':
						const timelineUsername = this.getNodeParameter('username') as string;
						if (!timelineUsername) {
							throw new NodeOperationError(this.getNode(), 'Username is required');
						}

						// Get user details first
						const userData = await rettiwt.user.details(timelineUsername);
						if (!userData) {
							throw new NodeOperationError(this.getNode(), 'User not found');
						}

						// Get timeline
						const timelineResults = await rettiwt.user.timeline(userData.id, maxResults);
						newContent = timelineResults.list || [];
						break;
				}

				// Filter out already processed content
				if (lastProcessedId) {
					const lastProcessedIndex = newContent.findIndex((item) => item.id === lastProcessedId);
					if (lastProcessedIndex !== -1) {
						newContent = newContent.slice(0, lastProcessedIndex);
					}
				}

				// Process new content
				if (newContent.length > 0) {
					// Update the last processed ID
					lastProcessedId = newContent[0].id;
					workflowStaticData.lastProcessedId = lastProcessedId;

					// Emit each new item
					for (const item of newContent.reverse()) {
						// Reverse to process oldest first
						this.emit([this.helpers.returnJsonArray([item])]);
					}
				}
			} catch (error) {
				this.logger.error('Error in X Scraper Trigger:', error);
				this.emit([
					this.helpers.returnJsonArray([
						{
							error: (error as Error).message,
							timestamp: new Date().toISOString(),
						},
					]),
				]);
			}
		};

		const sleep = (ms: number): Promise<void> => {
			return new Promise(resolve => {
				const timeout = setTimeout(resolve, ms);
				// Store timeout for cleanup if needed
				(this as any).__timeout = timeout;
			});
		};

		const startConsumer = async () => {
			// Initial poll
			await pollForNewContent();

			// Start recursive polling
			const pollIntervalMs = pollInterval * 1000; // Convert seconds to milliseconds
			
			const continuousPolling = async () => {
				while (isPolling) {
					try {
						await sleep(pollIntervalMs);
						if (isPolling) {
							await pollForNewContent();
						}
					} catch (error) {
						this.logger.error('Error in polling cycle:', error);
						// Continue polling even if one cycle fails
					}
				}
			};

			// Start the polling loop (don't await it, let it run in background)
			continuousPolling().catch(error => {
				this.logger.error('Polling loop terminated with error:', error);
			});
		};

		const closeFunction = async () => {
			// Stop polling
			isPolling = false;
			
			// Clear any pending timeout
			if ((this as any).__timeout) {
				clearTimeout((this as any).__timeout);
				(this as any).__timeout = undefined;
			}
		};

		const manualTriggerFunction = async () => {
			// Manual trigger for testing - just poll once
			await pollForNewContent();
		};

		// Start the consumer immediately when trigger is activated
		startConsumer();

		return {
			closeFunction,
			manualTriggerFunction,
		};
	}
}
