/**
 * DM Tome - plugin entry.
 *
 * This file is both the React Native entry and the Supernote plugin entry.
 * Order matters: register the React component first, then init the plugin
 * runtime, then register buttons, then attach the button listener.
 *
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTONS} from './src/buttons';
import {setLastButton} from './src/lastButton';
import {installGlobalErrorHandler, recordError} from './src/crashLog';

// First, so anything below that throws is captured and shown in the UI.
installGlobalErrorHandler();

AppRegistry.registerComponent(appName, () => App);

// init() is async; a rejection here (for example a native method missing on
// older firmware) would otherwise vanish silently.
Promise.resolve(PluginManager.init()).catch(e => recordError(e));

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

// Type 1: toolbar button. Visible whenever a note or document is open.
Promise.resolve(
  PluginManager.registerButton(1, ['NOTE', 'DOC'], {
    id: BUTTONS.CONSOLE,
    name: 'DM Tome',
    icon,
    showType: 1,
  }),
).catch(e => recordError(e));

// Type 2: lasso button. Appears after circling strokes or text in a NOTE.
// editDataTypes 0 = handwritten strokes, 3 = text boxes.
Promise.resolve(
  PluginManager.registerButton(2, ['NOTE'], {
    id: BUTTONS.CAPTURE,
    name: 'Capture',
    icon,
    editDataTypes: [0, 3],
    showType: 1,
  }),
).catch(e => recordError(e));

// Remember which button opened the UI so App.tsx can pick the right screen.
PluginManager.registerButtonListener({
  onButtonPress: event => {
    setLastButton(event);
  },
});
