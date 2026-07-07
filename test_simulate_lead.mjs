import { config } from 'dotenv';
config({ path: '.env' });

process.env.TEST_MODE_LLM = 'true';

import { handleAiBotMessage } from './lib/ai-bot.ts';

const messages = [
  'Hi',
  'I want to buy a 2 BHK in Baner',
  'My budget is around 90 lakh',
  'Yes I would like to visit',
  'Sunday 11 AM',
  'shantanunitinkulkaarni@gmail.com'
];

const mockChannel = {
  phoneNumberId: 'mock-phone-id',
  accessToken: 'mock-token',
};

(async () => {
  for (const msg of messages) {
    console.log('SENT: ' + msg);

    try {
      await handleAiBotMessage({
        phone: '919999999999',
        message: msg,
        agentId: 'd36fb518-309f-42fa-b3cb-23ceb3f3a870',
        channel: mockChannel,
        simulate: false
      });
    } catch (e) {
      console.log('ERROR: ' + e.message);
      break;
    }
    console.log('---');
  }

  process.exit(0);
})();
