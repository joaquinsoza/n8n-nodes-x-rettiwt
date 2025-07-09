import type {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { Rettiwt, TweetFilter } from 'rettiwt-api';

export class XScraperStreamTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'X Scraper Stream Trigger',
		name: 'xScraperStreamTrigger',
		icon: 'file:x.svg',
		group: ['trigger'],
		version: 1,
		description: 'Streams tweets in real-time using Rettiwt API stream function',
		defaults: {
			name: 'X Scraper Stream Trigger',
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
				displayName: 'Stream Type',
				name: 'streamType',
				type: 'options',
				options: [
					{
						name: 'Advanced Filter',
						value: 'advanced',
						description: 'Use advanced filtering options',
					},
					{
						name: 'From Users',
						value: 'fromUsers',
						description: 'Stream tweets from specific users',
					},
					{
						name: 'Hashtags',
						value: 'hashtags',
						description: 'Stream tweets containing specific hashtags',
					},
					{
						name: 'Mentions',
						value: 'mentions',
						description: 'Stream tweets mentioning specific users',
					},
					{
						name: 'Search Terms',
						value: 'search',
						description: 'Stream tweets matching search terms',
					},
				],
				default: 'search',
			},
			{
				displayName: 'Search Terms',
				name: 'searchTerms',
				type: 'string',
				displayOptions: {
					show: {
						streamType: ['search'],
					},
				},
				default: '',
				placeholder: 'Enter search terms...',
				description: 'Terms to search for in tweets',
			},
			{
				displayName: 'Usernames',
				name: 'usernames',
				type: 'string',
				displayOptions: {
					show: {
						streamType: ['fromUsers'],
					},
				},
				default: '',
				placeholder: 'user1,user2,user3',
				description: 'Comma-separated list of usernames (without @)',
			},
			{
				displayName: 'Mention Users',
				name: 'mentionUsers',
				type: 'string',
				displayOptions: {
					show: {
						streamType: ['mentions'],
					},
				},
				default: '',
				placeholder: 'user1,user2,user3',
				description: 'Comma-separated list of usernames to monitor for mentions (without @)',
			},
			{
				displayName: 'Hashtags',
				name: 'hashtags',
				type: 'string',
				displayOptions: {
					show: {
						streamType: ['hashtags'],
					},
				},
				default: '',
				placeholder: 'hashtag1,hashtag2,hashtag3',
				description: 'Comma-separated list of hashtags (without #)',
			},
			{
				displayName: 'Advanced Filter Options',
				name: 'advancedFilter',
				type: 'collection',
				placeholder: 'Add Filter',
				displayOptions: {
					show: {
						streamType: ['advanced'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Include Phrase',
						name: 'includePhrase',
						type: 'string',
						default: '',
						description: 'Phrase that must be included in tweets',
					},

					{
						displayName: 'From Users',
						name: 'fromUsers',
						type: 'string',
						default: '',
						description: 'Comma-separated list of usernames (without @)',
					},
					{
						displayName: 'To Users',
						name: 'toUsers',
						type: 'string',
						default: '',
						description: 'Comma-separated list of usernames for replies/mentions (without @)',
					},
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						description: 'Language code (e.g., en, es, fr)',
					},
					{
						displayName: 'Start Date',
						name: 'startDate',
						type: 'dateTime',
						default: '',
						description: 'Start date for tweet search',
					},
					{
						displayName: 'End Date',
						name: 'endDate',
						type: 'dateTime',
						default: '',
						description: 'End date for tweet search',
					},
					{
						displayName: 'Min Replies',
						name: 'minReplies',
						type: 'number',
						default: 0,
						description: 'Minimum number of replies',
					},
					{
						displayName: 'Min Retweets',
						name: 'minRetweets',
						type: 'number',
						default: 0,
						description: 'Minimum number of retweets',
					},
					{
						displayName: 'Min Likes',
						name: 'minLikes',
						type: 'number',
						default: 0,
						description: 'Minimum number of likes',
					},
					{
						displayName: 'Top Tweets Only',
						name: 'top',
						type: 'boolean',
						default: false,
						description: 'Whether to search for top tweets only',
					},
				],
			},
			{
				displayName: 'Polling Interval',
				name: 'pollingInterval',
				type: 'number',
				default: 60000,
				description: 'How Often To Poll For New Tweets (In Milliseconds). Default: 60000 (1 minute).',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Metadata',
						name: 'includeMetadata',
						type: 'boolean',
						default: false,
						description: 'Whether to include additional metadata in the output',
					},
					{
						displayName: 'Stream Start Message',
						name: 'includeStartMessage',
						type: 'boolean',
						default: true,
						description: 'Whether to emit a message when the stream starts',
					},
				],
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const streamType = this.getNodeParameter('streamType') as string;
		const pollingInterval = this.getNodeParameter('pollingInterval') as number;
		const options = this.getNodeParameter('options') as {
			includeMetadata?: boolean;
			includeStartMessage?: boolean;
		};

		// Get credentials
		const credentials = await this.getCredentials('xScraperApi');
		const rettiwt = new Rettiwt({ apiKey: credentials.apiKey as string });

		// Build the tweet filter based on stream type
		let tweetFilter: TweetFilter = {};

		switch (streamType) {
			case 'search':
				const searchTerms = this.getNodeParameter('searchTerms') as string;
				if (!searchTerms) {
					throw new NodeOperationError(this.getNode(), 'Search terms are required');
				}
				tweetFilter.includePhrase = searchTerms;
				break;

			case 'fromUsers':
				const usernames = this.getNodeParameter('usernames') as string;
				if (!usernames) {
					throw new NodeOperationError(this.getNode(), 'Usernames are required');
				}
				tweetFilter.fromUsers = usernames.split(',').map(u => u.trim());
				break;

			case 'mentions':
				const mentionUsers = this.getNodeParameter('mentionUsers') as string;
				if (!mentionUsers) {
					throw new NodeOperationError(this.getNode(), 'Mention users are required');
				}
				const mentionTerms = mentionUsers.split(',').map(u => `@${u.trim()}`).join(' OR ');
				tweetFilter.includePhrase = mentionTerms;
				break;

			case 'hashtags':
				const hashtags = this.getNodeParameter('hashtags') as string;
				if (!hashtags) {
					throw new NodeOperationError(this.getNode(), 'Hashtags are required');
				}
				const hashtagTerms = hashtags.split(',').map(h => `#${h.trim()}`).join(' OR ');
				tweetFilter.includePhrase = hashtagTerms;
				break;

			case 'advanced':
				const advancedFilter = this.getNodeParameter('advancedFilter') as any;
				
				if (advancedFilter.includePhrase) {
					tweetFilter.includePhrase = advancedFilter.includePhrase;
				}
				if (advancedFilter.fromUsers) {
					tweetFilter.fromUsers = advancedFilter.fromUsers.split(',').map((u: string) => u.trim());
				}
				if (advancedFilter.toUsers) {
					tweetFilter.toUsers = advancedFilter.toUsers.split(',').map((u: string) => u.trim());
				}
				if (advancedFilter.language) {
					tweetFilter.language = advancedFilter.language;
				}
				if (advancedFilter.startDate) {
					tweetFilter.startDate = new Date(advancedFilter.startDate);
				}
				if (advancedFilter.endDate) {
					tweetFilter.endDate = new Date(advancedFilter.endDate);
				}
				if (advancedFilter.minReplies) {
					tweetFilter.minReplies = advancedFilter.minReplies;
				}
				if (advancedFilter.minRetweets) {
					tweetFilter.minRetweets = advancedFilter.minRetweets;
				}
				if (advancedFilter.minLikes) {
					tweetFilter.minLikes = advancedFilter.minLikes;
				}
				if (advancedFilter.top) {
					tweetFilter.top = advancedFilter.top;
				}
				break;
		}

		let streamGenerator: AsyncGenerator<any> | undefined;
		let isActive = true;

		const startConsumer = async () => {
			try {
				// Emit start message if enabled
				if (options.includeStartMessage) {
					this.emit([
						this.helpers.returnJsonArray([
							{
								type: 'stream_start',
								message: 'X Scraper Stream started',
								filter: tweetFilter,
								timestamp: new Date().toISOString(),
							},
						]),
					]);
				}

				// Start the stream
				streamGenerator = rettiwt.tweet.stream(tweetFilter, pollingInterval);

				// Process stream items
				for await (const tweet of streamGenerator) {
					if (!isActive) break;

					try {
						// Prepare the output data
						const outputData = options.includeMetadata
							? {
									tweet,
									metadata: {
										streamType,
										filter: tweetFilter,
										receivedAt: new Date().toISOString(),
									},
							  }
							: tweet;

						// Emit the tweet
						this.emit([this.helpers.returnJsonArray([outputData])]);
					} catch (error) {
						this.logger.error('Error processing tweet:', error);
						this.emit([
							this.helpers.returnJsonArray([
								{
									type: 'error',
									error: (error as Error).message,
									timestamp: new Date().toISOString(),
								},
							]),
						]);
					}
				}
			} catch (error) {
				this.logger.error('Error in X Scraper Stream Trigger:', error);
				this.emit([
					this.helpers.returnJsonArray([
						{
							type: 'stream_error',
							error: (error as Error).message,
							timestamp: new Date().toISOString(),
						},
					]),
				]);
			}
		};

		const closeFunction = async () => {
			isActive = false;
			if (streamGenerator) {
				try {
					await streamGenerator.return(undefined);
				} catch (error) {
					this.logger.error('Error closing stream:', error);
				}
			}
		};

		const manualTriggerFunction = async () => {
			// For manual trigger, just do a one-time search
			try {
				const searchResults = await rettiwt.tweet.search(tweetFilter, 5);
				const tweets = searchResults.list || [];
				
				for (const tweet of tweets) {
					const outputData = options.includeMetadata
						? {
								tweet,
								metadata: {
									streamType,
									filter: tweetFilter,
									receivedAt: new Date().toISOString(),
									isManualTrigger: true,
								},
						  }
						: tweet;

					this.emit([this.helpers.returnJsonArray([outputData as any])]);
				}
			} catch (error) {
				this.emit([
					this.helpers.returnJsonArray([
						{
							type: 'manual_trigger_error',
							error: (error as Error).message,
							timestamp: new Date().toISOString(),
						},
					]),
				]);
			}
		};

		// Start the consumer immediately when trigger is activated
		startConsumer();

		return {
			closeFunction,
			manualTriggerFunction,
		};
	}
} 