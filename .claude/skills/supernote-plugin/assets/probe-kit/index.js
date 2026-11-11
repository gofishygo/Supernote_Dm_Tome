/**
 * Plugin entry. Order matters: register the React component, init the plugin
 * runtime, register buttons, attach the button listener.
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

// Release bundles inline requires: App.tsx and its imports are evaluated the
// first time the host asks for the component. Load it lazily and render any
// failure instead of mounting nothing.
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
        React.createElement(Text, {style: {fontSize: 26, fontWeight: '700', color: '#000000'}}, 'Failed to load App.tsx'),
        React.createElement(Text, {style: {fontSize: 18, color: '#000000', fontFamily: 'monospace'}, selectable: true}, message),
      );
  }
});

Promise.resolve(PluginManager.init()).catch(e => recordError(e));

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

Promise.resolve(
  PluginManager.registerButton(1, ['NOTE', 'DOC'], {id: BUTTONS.TOOLBAR, name: 'Probe', icon, showType: 1}),
).catch(e => recordError(e));

// editDataTypes: 0 strokes, 1 title, 2 image, 3 text, 4 link, 5 geometry.
Promise.resolve(
  PluginManager.registerButton(2, ['NOTE'], {id: BUTTONS.LASSO, name: 'Probe lasso', icon, editDataTypes: [0, 3], showType: 1}),
).catch(e => recordError(e));

PluginManager.registerButtonListener({
  onButtonPress: event => {
    setLastButton(event);
  },
});
