import { createInstantEmailWorker, instantEmailWorker } from './processors/instant';
import { createEmailQueue, emailQueue, enqueueEmail } from './queue';

export { emailQueue, enqueueEmail, instantEmailWorker, createEmailQueue, createInstantEmailWorker };
