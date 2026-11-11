/**
 * DM Tome - plugin entry.
 *
 * This file is both the React Native entry and the Supernote plugin entry.
 * Order matters: register the React component first, then init the plugin
 * runtime, then register buttons, then attach the button listener.
 *
 * @format
 */

import React from 'react';
import {AppRegistry, Image, ScrollView, Text} from 'react-native';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTONS} from './src/buttons';
import {setLastButton} from './src/lastButton';
import {installGlobalErrorHandler, recordError} from './src/crashLog';

// First, so anything below that throws is captured and shown in the UI.
installGlobalErrorHandler();

// Release bundles inline requires, so App.tsx and everything it imports are
// evaluated the first time the host asks for the component, not at startup.
// If that evaluation throws, the view would mount nothing and the error would
// be invisible. Load App lazily inside the factory and print any failure.
AppRegistry.registerComponent(appName, () => {
  try {
    return require('./App').default;
  } catch (e) {
    recordError(e, true);
    const message = `${e && e.message}\n\n${(e && e.stack) || ''}`;
    return () =>
      React.createElement(
        ScrollView,
        {style: {flex: 1, backgroundColor: '#ffffff', padding: 24}},
        React.createElement(
          Text,
          {style: {fontSize: 26, fontWeight: '700', color: '#000000'}},
          'DM Tome failed to load App.tsx',
        ),
        React.createElement(
          Text,
          {style: {fontSize: 18, color: '#000000', fontFamily: 'monospace'}, selectable: true},
          message,
        ),
      );
  }
});

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

// Type 2: lasso button. Appears after circling strokes or text. The official
// first-plugin example registers it for DOC as well as NOTE, so PDF
// annotations can be captured too. editDataTypes 0 = strokes, 3 = text.
Promise.resolve(
  PluginManager.registerButton(2, ['NOTE', 'DOC'], {
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
