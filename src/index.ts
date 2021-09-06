import { API } from 'homebridge';

import { PhilipsAirPlatform } from './platform';

const PLUGIN_NAME = 'homebridge-philips-air';
const PLATFORM_NAME = 'philipsAir';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PhilipsAirPlatform);
};